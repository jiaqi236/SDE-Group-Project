const fs = require('fs');
const path = require('path');
const T = require('../public/js/tasks.js');

describe('Client helper logic (public/js/tasks.js)', () => {
  test('validateTitle accepts a normal title', () => {
    expect(T.validateTitle('Finish report')).toBeNull();
  });

  test('validateTitle rejects empty and whitespace-only titles', () => {
    expect(T.validateTitle('')).toMatch(/empty/);
    expect(T.validateTitle('   ')).toMatch(/empty/);
  });

  test('validateTitle rejects titles over 100 characters but accepts exactly 100', () => {
    expect(T.validateTitle('x'.repeat(101))).toMatch(/100/);
    expect(T.validateTitle('x'.repeat(100))).toBeNull();
  });

  test('validateTitle rejects non-string values', () => {
    expect(T.validateTitle(undefined)).toMatch(/text/);
    expect(T.validateTitle(42)).toMatch(/text/);
  });

  test('filterTasks returns active, completed and all', () => {
    const list = [{ id: 1, title: 'A', done: true }, { id: 2, title: 'B', done: false }];
    expect(T.filterTasks(list, 'active').map((t) => t.title)).toEqual(['B']);
    expect(T.filterTasks(list, 'completed').map((t) => t.title)).toEqual(['A']);
    expect(T.filterTasks(list, 'all')).toHaveLength(2);
  });

  test('countRemaining counts only tasks that are not done', () => {
    expect(T.countRemaining([{ done: true }, { done: false }, { done: false }])).toBe(2);
    expect(T.countRemaining([])).toBe(0);
  });
});

describe('Static files', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

  test('index.html has the title, form, version placeholder and database status', () => {
    expect(html).toContain('<title>CampusTask</title>');
    expect(html).toContain('id="task-form"');
    expect(html).toContain('__APP_VERSION__');
    expect(html).toContain('id="db-status"');
  });

  test('index.html references the stylesheet and both scripts, and they exist', () => {
    ['style.css', 'js/tasks.js', 'js/app.js'].forEach((f) => {
      expect(html).toContain(f);
      expect(fs.existsSync(path.join(__dirname, '../public', f))).toBe(true);
    });
  });
});
