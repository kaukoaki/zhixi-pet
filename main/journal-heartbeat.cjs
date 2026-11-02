'use strict';

// Idle timers do not emit pomodoro changes. Keep daily visits and pending
// journal writes alive without awarding any dates while the process is absent.
function createJournalHeartbeat({ getJournal, now = Date.now, onChange = () => {}, intervalMs = 1000 }) {
  let current = null, lastCheck = null, lastDate = null, lastWarning = null, lastAttempt = null;
  function tick(force = false) {
    const journal = getJournal(), clock = now(), switched = journal !== current;
    if (!journal) return { checked: false, changed: false };
    if (!force && !switched && lastCheck !== null && clock >= lastCheck && clock - lastCheck < intervalMs) return { checked: false, changed: false };
    if (switched) { current = journal; lastDate = null; lastWarning = null; lastAttempt = null; }
    lastCheck = clock;
    const at = journal.now(), date = journal.dayKey(at), dateChanged = date !== lastDate;
    journal.visit(at);
    const elapsed = at - journal.lastFlush;
    const due = force || dateChanged || elapsed >= 15000 || elapsed < 0;
    const retryDue = force || dateChanged || lastAttempt === null || clock < lastAttempt || clock - lastAttempt >= 15000;
    let saved = null;
    if (journal.dirty && due && retryDue) { lastAttempt = clock; saved = journal.flush(); }
    const warning = journal.warning || null, changed = switched || dateChanged || warning !== lastWarning;
    lastDate = date; lastWarning = warning;
    const result = { checked: true, changed, saved, date, warning };
    if (changed) onChange(result);
    return result;
  }
  return { tick };
}
module.exports = { createJournalHeartbeat };
