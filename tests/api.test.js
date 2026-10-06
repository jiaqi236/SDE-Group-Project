const request = require('supertest');
const { createApp, parseId } = require('../server/app');
const { createMemoryRepo } = require('../server/repo-memory');

describe('REST API (with in-memory repository)', () => {
  let app;
  beforeEach(() => { app = createApp(createMemoryRepo()); });

  test('GET /health returns ok with database up', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  test('GET /health returns 503 when the database is unreachable', async () => {
    const broken = createMemoryRepo();
    broken.ping = async () => { throw new Error('connection refused'); };
    const res = await request(createApp(broken)).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.database).toBe('down');
  });

  test('GET /api/tasks starts empty', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /api/tasks creates a trimmed task and it appears in the list', async () => {
    const created = await request(app).post('/api/tasks').send({ title: '  Buy milk  ' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: 1, title: 'Buy milk', done: false });
    const list = await request(app).get('/api/tasks');
    expect(list.body).toHaveLength(1);
  });

  test('POST /api/tasks rejects empty, missing and too long titles', async () => {
    expect((await request(app).post('/api/tasks').send({ title: '   ' })).status).toBe(400);
    expect((await request(app).post('/api/tasks').send({})).status).toBe(400);
    expect((await request(app).post('/api/tasks').send({ title: 'x'.repeat(101) })).status).toBe(400);
  });

  test('POST /api/tasks rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/tasks').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/);
  });

  test('PATCH /api/tasks/:id toggles done', async () => {
    await request(app).post('/api/tasks').send({ title: 'A' });
    const res = await request(app).patch('/api/tasks/1').send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  test('PATCH validates id, body and existence', async () => {
    expect((await request(app).patch('/api/tasks/abc').send({ done: true })).status).toBe(400);
    expect((await request(app).patch('/api/tasks/1').send({ done: 'yes' })).status).toBe(400);
    expect((await request(app).patch('/api/tasks/99').send({ done: true })).status).toBe(404);
  });

  test('DELETE /api/tasks/:id removes the task, then returns 404', async () => {
    await request(app).post('/api/tasks').send({ title: 'A' });
    expect((await request(app).delete('/api/tasks/1')).status).toBe(204);
    expect((await request(app).delete('/api/tasks/1')).status).toBe(404);
    expect((await request(app).delete('/api/tasks/0')).status).toBe(400);
  });

  test('DELETE /api/tasks/completed removes only completed tasks', async () => {
    await request(app).post('/api/tasks').send({ title: 'A' });
    await request(app).post('/api/tasks').send({ title: 'B' });
    await request(app).patch('/api/tasks/1').send({ done: true });
    expect((await request(app).delete('/api/tasks/completed')).status).toBe(204);
    const list = await request(app).get('/api/tasks');
    expect(list.body.map((t) => t.title)).toEqual(['B']);
  });

  test('unknown /api routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nothing');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('repository failures return 500 without leaking details', async () => {
    const broken = createMemoryRepo();
    broken.list = async () => { throw new Error('secret db detail'); };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(createApp(broken)).get('/api/tasks');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    console.error.mockRestore();
  });

  test('the web page is served from /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('CampusTask');
  });

  test('parseId only accepts positive integers within the INTEGER range', () => {
    expect(parseId('5')).toBe(5);
    expect(parseId('0')).toBeNull();
    expect(parseId('-1')).toBeNull();
    expect(parseId('1.5')).toBeNull();
    expect(parseId('99999999999')).toBeNull();
  });
});
