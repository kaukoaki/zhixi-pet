'use strict';
const { displayBuckets } = require('../renderer/usage-view.js');
const WALLET_ACTION_IDS = ['wallet','wallet-careful','wallet-low','wallet-empty','wallet-wait'];
const finite = value => typeof value === 'number' && Number.isFinite(value);

function selectWalletAction(usage, options = {}) {
  const now = options.now ?? Date.now();
  const hasMedia = options.hasMedia || (() => true);
  let selected = 'wallet';
  // Do not turn failed, missing, expired, or ambiguous model-specific data into a quota claim.
  if (usage?.status === 'ready' && finite(usage.fetchedAt) && now-usage.fetchedAt<=120000 && usage.fetchedAt<=now+30000) {
    const buckets = displayBuckets(usage);
    const bucket = buckets.find(b => b.id === 'codex') || (buckets.length === 1 ? buckets[0] : null);
    const windows = bucket?.windows || [];
    const complete = windows.length && windows.every(w => finite(w.remainingPercent) && (!finite(w.resetsAt) || w.resetsAt*1000 > now));
    if (usage.ordinaryUsageAllowed === false) selected = 'wallet-empty';
    if (complete) {
      const remaining = Math.min(...windows.map(w => w.remainingPercent));
      if (remaining <= 0) {
        const blocking = windows.filter(w => w.remainingPercent <= 0);
        const soon = blocking.length && blocking.every(w => finite(w.resetsAt) && w.resetsAt*1000>now && w.resetsAt*1000-now<=30*60000);
        selected = soon ? 'wallet-wait' : 'wallet-empty';
      } else if (usage.ordinaryUsageAllowed !== false) selected = remaining <= 20 ? 'wallet-low' : remaining <= 50 ? 'wallet-careful' : 'wallet';
    }
  }
  return hasMedia(selected) ? selected : hasMedia('wallet') ? 'wallet' : null;
}

function createWalletReactions(options) {
  let generation = 0;
  return {
    cancel() { generation++; },
    async query(force = false) {
      const own = ++generation, busyAtStart = Boolean(options.isBusy?.());
      const usage = await options.refresh(force);
      if (own === generation && !busyAtStart && !options.isBusy?.()) {
        const id = selectWalletAction(usage, { hasMedia: options.hasMedia, now: options.now?.() ?? Date.now() });
        if (id) options.play(id);
      }
      return usage;
    }
  };
}
module.exports = { WALLET_ACTION_IDS, selectWalletAction, createWalletReactions };
