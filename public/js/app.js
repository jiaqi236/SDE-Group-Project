/* UI code: talks to the CampusTask REST API (which stores tasks in PostgreSQL). */
(function () {
  const API = '/api/tasks';
  let tasks = [];
  let filter = 'all';

  const form = document.getElementById('task-form');
  const input = document.getElementById('task-input');
  const errorEl = document.getElementById('error');
  const listEl = document.getElementById('task-list');
  const emptyEl = document.getElementById('empty');
  const countEl = document.getElementById('count');
  const dbEl = document.getElementById('db-status');

  function showError(msg) { errorEl.textContent = msg || ''; }

  async function request(method, url, body) {
    const res = await fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
    return data;
  }

  async function refresh() {
    tasks = await request('GET', API);
    render();
  }

  async function checkHealth() {
    try {
      const h = await request('GET', '/health');
      dbEl.textContent = h.database;
    } catch (e) {
      dbEl.textContent = 'down';
    }
  }

  function render() {
    const visible = TaskLogic.filterTasks(tasks, filter);
    listEl.innerHTML = '';
    visible.forEach(function (t) {
      const li = document.createElement('li');
      if (t.done) li.className = 'done';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = t.done;
      cb.setAttribute('aria-label', 'Mark "' + t.title + '" as done');
      cb.addEventListener('change', async function () {
        try {
          const updated = await request('PATCH', API + '/' + t.id, { done: cb.checked });
          tasks = tasks.map(function (x) { return x.id === t.id ? updated : x; });
          showError('');
        } catch (e) { showError(e.message); await refresh().catch(function () {}); return; }
        render();
      });

      const span = document.createElement('span');
      span.textContent = t.title;

      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete "' + t.title + '"');
      del.addEventListener('click', async function () {
        try {
          await request('DELETE', API + '/' + t.id);
          tasks = tasks.filter(function (x) { return x.id !== t.id; });
          showError('');
        } catch (e) { showError(e.message); await refresh().catch(function () {}); return; }
        render();
      });

      li.appendChild(cb); li.appendChild(span); li.appendChild(del);
      listEl.appendChild(li);
    });
    emptyEl.style.display = visible.length === 0 ? 'block' : 'none';
    const n = TaskLogic.countRemaining(tasks);
    countEl.textContent = n + (n === 1 ? ' task left' : ' tasks left');
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const problem = TaskLogic.validateTitle(input.value);
    if (problem) { showError(problem); return; }
    try {
      const created = await request('POST', API, { title: input.value });
      tasks.push(created);
      input.value = '';
      showError('');
      render();
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('filters').addEventListener('click', function (e) {
    const f = e.target.getAttribute('data-filter');
    if (!f) return;
    filter = f;
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-filter') === f);
    });
    render();
  });

  document.getElementById('clear-completed').addEventListener('click', async function () {
    try {
      await request('DELETE', API + '/completed');
      tasks = tasks.filter(function (t) { return !t.done; });
      showError('');
      render();
    } catch (e) { showError(e.message); }
  });

  if (location.protocol === 'file:') {
    showError('Start the server and open http://localhost:3000 (see README). This page cannot be opened by double-clicking the file.');
  } else {
    refresh().catch(function (e) { showError('Could not load tasks: ' + e.message); });
    checkHealth();
  }
  render();
})();
