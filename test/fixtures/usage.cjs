'use strict';
const { normalizeUsage } = require('../../main/codex-usage.cjs');
module.exports = () => normalizeUsage({ type: 'chatgpt', planType: 'plus' }, { rateLimits: { limitId: 'codex', primary: { usedPercent: 32, windowDurationMins: 300, resetsAt: Date.now() / 1000 + 3600 }, secondary: { usedPercent: 11, windowDurationMins: 10080, resetsAt: Date.now() / 1000 + 86400 }, credits: { hasCredits: false, unlimited: false, balance: '0' } } });
