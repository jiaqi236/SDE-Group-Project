// Runs the real SQL in server/repo-pg.js against pg-mem (an in-memory PostgreSQL emulator),
// so the queries are checked in the unit-test stage without needing a database server.
// (pg-mem cannot re-run CREATE TABLE IF NOT EXISTS on an existing table, so init() being
// idempotent is verified against a real PostgreSQL in the end-to-end check instead.)
const { newDb } = require('pg-mem');
const { createPgRepo } = require('../server/repo-pg');

describe('PostgreSQL repository (SQL checked with pg-mem)', () => {
  let repo;
  beforeEach(async () => {
    const { Pool } = newDb().adapters.createPg();
    repo = createPgRepo(new Pool());
    await repo.init();
  });

  test('ping succeeds once the schema exists', async () => {
    await expect(repo.ping()).resolves.not.toThrow();
  });

  test('ping fails before the schema exists', async () => {
    const { Pool } = newDb().adapters.createPg();
    await expect(createPgRepo(new Pool()).ping()).rejects.toThrow();
  });

  test('create returns the stored row with an id and default done=false', async () => {
    const t = await repo.create('Write report');
    expect(t).toMatchObject({ id: 1, title: 'Write report', done: false });
    expect(t.created_at).toBeDefined();
  });

  test('list returns tasks ordered by id', async () => {
    await repo.create('A');
    await repo.create('B');
    expect((await repo.list()).map((t) => t.title)).toEqual(['A', 'B']);
  });

  test('setDone updates the row, and returns null for a missing id', async () => {
    await repo.create('A');
    expect((await repo.setDone(1, true)).done).toBe(true);
    expect(await repo.setDone(42, true)).toBeNull();
  });

  test('remove deletes the row and reports whether it existed', async () => {
    await repo.create('A');
    expect(await repo.remove(1)).toBe(true);
    expect(await repo.remove(1)).toBe(false);
  });

  test('clearCompleted deletes only done tasks', async () => {
    await repo.create('A');
    await repo.create('B');
    await repo.setDone(1, true);
    expect(await repo.clearCompleted()).toBe(1);
    expect((await repo.list()).map((t) => t.title)).toEqual(['B']);
  });
});
