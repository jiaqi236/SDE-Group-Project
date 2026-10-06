'use strict';
const express = require('express');
const path = require('path');
const { validateTitle } = require('../public/js/tasks.js');

const MAX_ID = 2147483647; // PostgreSQL INTEGER limit

function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 && id <= MAX_ID ? id : null;
}

// Wraps async route handlers so rejected promises reach the error handler
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createApp(repo) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  // Health check used by Docker, deploy.sh (rollback decision) and the smoke tests.
  // Returns 503 when the database cannot be reached.
  app.get('/health', async (req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ok', database: 'up' });
    } catch (err) {
      res.status(503).json({ status: 'error', database: 'down' });
    }
  });

  app.get('/api/tasks', wrap(async (req, res) => {
    res.json(await repo.list());
  }));

  app.post('/api/tasks', wrap(async (req, res) => {
    const title = req.body && req.body.title;
    const error = validateTitle(title);
    if (error) return res.status(400).json({ error });
    res.status(201).json(await repo.create(title.trim()));
  }));

  // Must be registered before /api/tasks/:id
  app.delete('/api/tasks/completed', wrap(async (req, res) => {
    await repo.clearCompleted();
    res.status(204).end();
  }));

  app.patch('/api/tasks/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid task id.' });
    if (!req.body || typeof req.body.done !== 'boolean') {
      return res.status(400).json({ error: 'Field "done" must be true or false.' });
    }
    const task = await repo.setDone(id, req.body.done);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json(task);
  }));

  app.delete('/api/tasks/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid task id.' });
    const removed = await repo.remove(id);
    if (!removed) return res.status(404).json({ error: 'Task not found.' });
    res.status(204).end();
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp, parseId };
