'use strict';
function dispatchLaunch(argv, handlers) {
  const flags = new Set(Array.isArray(argv) ? argv.filter(value => typeof value === 'string') : []);
  if (flags.has('--quit')) { handlers.quit(); return 'quit'; }
  handlers.show();
  for (const [flag, method] of [['--panel','panel'],['--pomodoro','pomodoro'],['--usage','usage'],['--journal','journal']]) if (flags.has(flag)) handlers[method]?.();
  return 'shown';
}
module.exports = { dispatchLaunch };
