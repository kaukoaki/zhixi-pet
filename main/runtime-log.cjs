'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Local lifecycle diagnostics only: never prompts, account data, or task output.
function createRuntimeLog(directory) {
  const folder = path.join(directory, 'logs'), file = path.join(folder, 'runtime.jsonl');
  return function log(event, detail = {}) {
    try {
      fs.mkdirSync(folder, { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.renameSync(file, file + '.previous');
      fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), event, ...detail }) + '\n', 'utf8');
    } catch { /* Diagnostic I/O must never interrupt the pet. */ }
  };
}
module.exports = { createRuntimeLog };
