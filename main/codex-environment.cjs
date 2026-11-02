'use strict';
const { execFile } = require('node:child_process');
const PROXY_KEYS = new Set(['http_proxy', 'https_proxy', 'all_proxy']);

function hasProxy(env) {
  return Object.keys(env).some(key => PROXY_KEYS.has(key.toLowerCase()) && env[key]);
}
function proxyUrl(address, protocol = 'http') {
  try {
    const url = new URL(/^[a-z][\w+.-]*:\/\//i.test(address) ? address : `${protocol}://${address}`);
    if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) || !url.hostname || url.search || url.hash || !['', '/'].includes(url.pathname)) return null;
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}
function withWindowsProxy(env, { enabled, server } = {}) {
  const copy = { ...env };
  if (hasProxy(env)) return { env: copy, proxySource: 'environment' };
  if (!enabled || typeof server !== 'string') return { env: copy, proxySource: 'none' };
  for (const entry of server.split(';')) {
    const part = entry.trim(), index = part.indexOf('=');
    if (!part) continue;
    const type = index < 0 ? 'all' : part.slice(0, index).toLowerCase();
    const url = proxyUrl(index < 0 ? part : part.slice(index + 1), type === 'socks' ? 'socks5' : 'http');
    if (!url) continue;
    if (type === 'all' || type === 'http') copy.HTTP_PROXY = url;
    if (type === 'all' || type === 'https') copy.HTTPS_PROXY = url;
    if (type === 'socks') copy.ALL_PROXY = url;
  }
  if (!hasProxy(copy)) return { env: copy, proxySource: 'none' };
  if (!Object.keys(copy).some(key => key.toLowerCase() === 'no_proxy')) copy.NO_PROXY = 'localhost,127.0.0.1,::1';
  return { env: copy, proxySource: 'system' };
}
async function resolveCodexEnvironment(options = {}) {
  const env = options.env || process.env;
  if ((options.platform || process.platform) !== 'win32' || hasProxy(env)) return withWindowsProxy(env);
  const run = options.execFileImpl || execFile;
  const read = name => new Promise(resolve => {
    run('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', name], { windowsHide: true, timeout: 2000, encoding: 'utf8' }, (error, stdout) => {
      const match = !error && new RegExp(`${name}\\s+REG_\\w+\\s+([^\\r\\n]+)`, 'i').exec(stdout || '');
      resolve(match ? match[1].trim() : null);
    });
  });
  const [enabled, server] = await Promise.all([read('ProxyEnable'), read('ProxyServer')]);
  return withWindowsProxy(env, { enabled: Number(enabled) === 1, server });
}
module.exports = { resolveCodexEnvironment, withWindowsProxy };
