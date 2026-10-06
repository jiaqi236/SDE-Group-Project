/* Pure helper logic (no DOM, no network) shared by the browser and the server, and unit tested by Jest. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.TaskLogic = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  const MAX_LENGTH = 100;

  function validateTitle(title) {
    if (typeof title !== 'string') return 'Task must be text.';
    const t = title.trim();
    if (t.length === 0) return 'Task cannot be empty.';
    if (t.length > MAX_LENGTH) return 'Task must be ' + MAX_LENGTH + ' characters or fewer.';
    return null;
  }

  function filterTasks(list, filter) {
    if (filter === 'active') return list.filter(function (t) { return !t.done; });
    if (filter === 'completed') return list.filter(function (t) { return t.done; });
    return list.slice();
  }

  function countRemaining(list) {
    return list.filter(function (t) { return !t.done; }).length;
  }

  return { MAX_LENGTH: MAX_LENGTH, validateTitle: validateTitle, filterTasks: filterTasks, countRemaining: countRemaining };
}));
