'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { withWindowsProxy, resolveCodexEnvironment } = require('../main/codex-environment.cjs');
test('enabled static Windows proxy is inherited by CLI children without changing parent or login settings', () => {
  const original = { Path: 'bin', CODEX_HOME: 'custom', NO_PROXY: 'example.test' };
  const result = withWindowsProxy(original, { enabled: true, server: '127.0.0.1:8765' });
  assert.equal(result.proxySource, 'system');
  assert.equal(result.env.HTTP_PROXY, 'http://127.0.0.1:8765');
  assert.equal(result.env.HTTPS_PROXY, result.env.HTTP_PROXY);
  assert.equal(result.env.NO_PROXY, 'example.test');
  assert.equal(result.env.CODEX_HOME, original.CODEX_HOME);
  assert.equal(original.HTTP_PROXY, undefined);
});
test('custom proxy environments win, with case-insensitive keys and no partial overwrites', () => {
  for (const key of ['HTTPS_PROXY', 'http_proxy', 'all_proxy']) {
    const env = { [key]: 'http://custom.test:8765' };
    const result = withWindowsProxy(env, { enabled: true, server: '127.0.0.1:1234' });
    assert.equal(result.proxySource, 'environment'); assert.deepEqual(result.env, env);
  }
});
test('disabled, invalid and PAC-only settings do not invent a proxy; keyed HTTP and SOCKS remain distinct', () => {
  for (const settings of [{ enabled: false, server: 'localhost:1' }, { enabled: true }, { enabled: true, server: 'file:///invalid;http=bad address' }]) assert.deepEqual(withWindowsProxy({}, settings), { env: {}, proxySource: 'none' });
  const result = withWindowsProxy({}, { enabled: true, server: 'http=localhost:8000;https=localhost:8001;socks=localhost:8002' });
  assert.equal(result.env.HTTP_PROXY, 'http://localhost:8000');
  assert.equal(result.env.HTTPS_PROXY, 'http://localhost:8001');
  assert.equal(result.env.ALL_PROXY, 'socks5://localhost:8002');
  assert.equal(result.env.NO_PROXY, 'localhost,127.0.0.1,::1');
});
test('registry detection is read-only and bounded; unavailable settings retain the original environment', async () => {
  const calls = [];
  const result = await resolveCodexEnvironment({ platform: 'win32', env: { KEEP: 'yes' }, execFileImpl: (exe, args, options, callback) => {
    calls.push({ exe, args, options }); const name = args.at(-1);
    callback(null, name === 'ProxyEnable' ? 'ProxyEnable REG_DWORD 0x1\r\n' : 'ProxyServer REG_SZ localhost:5678\r\n');
  } });
  assert.equal(result.proxySource, 'system'); assert.equal(result.env.HTTPS_PROXY, 'http://localhost:5678');
  assert.equal(calls.length, 2); assert.ok(calls.every(c => c.args[0] === 'query' && c.options.timeout === 2000 && c.options.windowsHide));
  const failed = await resolveCodexEnvironment({ platform: 'win32', env: { KEEP: 'yes' }, execFileImpl: (_e, _a, _o, callback) => callback(Error('missing')) });
  assert.deepEqual(failed, { env: { KEEP: 'yes' }, proxySource: 'none' });
});
