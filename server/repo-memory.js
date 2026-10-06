'use strict';
// In-memory repository: used for local development without a database and in API tests.
// NEVER used in production (server/index.js refuses to start without DB_HOST in production).
function createMemoryRepo() {
  let tasks = [];
  let nextId = 1;
  return {
    async init() {},
    async ping() {},
    async list() { return tasks.map((t) => ({ ...t })); },
    async create(title) {
      const task = { id: nextId++, title, done: false, created_at: new Date().toISOString() };
      tasks.push(task);
      return { ...task };
    },
    async setDone(id, done) {
      const task = tasks.find((t) => t.id === id);
      if (!task) return null;
      task.done = done;
      return { ...task };
    },
    async remove(id) {
      const before = tasks.length;
      tasks = tasks.filter((t) => t.id !== id);
      return tasks.length < before;
    },
    async clearCompleted() {
      const before = tasks.length;
      tasks = tasks.filter((t) => !t.done);
      return before - tasks.length;
    },
    async close() {},
  };
}

module.exports = { createMemoryRepo };
