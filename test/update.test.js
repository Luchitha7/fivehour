const test = require('node:test');
const assert = require('node:assert');
const { isNewer, parseVersion, parseRelease } = require('../src/update');

test('version comparison', () => {
  assert.equal(isNewer('0.2.0', '0.1.0'), true);
  assert.equal(isNewer('v0.1.1', '0.1.0'), true);
  assert.equal(isNewer('1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.10.0', '0.9.0'), true, 'numeric, not string, compare');
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.0.9', '0.1.0'), false);
  assert.equal(isNewer('garbage', '0.1.0'), false);
  assert.deepEqual(parseVersion('v1.2.3-beta.1'), [1, 2, 3]);
  assert.equal(parseVersion('1.2'), null);
});

test('release parsing only trusts this repo’s release pages', () => {
  const good = { tag_name: 'v0.2.0', html_url: 'https://github.com/Luchitha7/fivehour/releases/tag/v0.2.0' };
  assert.deepEqual(parseRelease(good), { version: '0.2.0', url: good.html_url });
  assert.equal(parseRelease({ ...good, html_url: 'https://evil.example/releases/tag/v0.2.0' }), null);
  assert.equal(parseRelease({ ...good, html_url: 'https://github.com/someone/else/releases/tag/v0.2.0' }), null);
  assert.equal(parseRelease({ ...good, draft: true }), null);
  assert.equal(parseRelease({ ...good, prerelease: true }), null);
  assert.equal(parseRelease({ ...good, tag_name: 'latest' }), null);
  assert.equal(parseRelease(null), null);
});

test('an expired or missing Claude Code login waits for the user', () => {
  const { nextDelay, parseCredentials } = require('../src/sources/endpoint');
  assert.equal(nextDelay({ code: 'expired' }, 1), 30 * 60e3);
  assert.equal(nextDelay({ code: 'no-login' }, 1), 30 * 60e3);
  assert.deepEqual(parseCredentials({ claudeAiOauth: { accessToken: 't', expiresAt: 5 } }), { token: 't', expiresAt: 5 });
  assert.deepEqual(parseCredentials({ claudeAiOauth: { accessToken: 't' } }), { token: 't', expiresAt: null });
  assert.equal(parseCredentials({ claudeAiOauth: { accessToken: '' } }), null);
  assert.equal(parseCredentials({}), null);
});

test('live data backs off, hardest on 429', () => {
  const { nextDelay, retryAfterMs } = require('../src/sources/endpoint');
  const MIN = 60e3;
  assert.equal(nextDelay(null, 0), 5 * MIN);
  assert.equal(nextDelay({ status: 500 }, 1), 5 * MIN);
  assert.equal(nextDelay({ status: 500 }, 3), 20 * MIN);
  assert.equal(nextDelay({ status: 500 }, 20), 60 * MIN, 'capped at an hour');
  assert.equal(nextDelay({ status: 429 }, 1), 10 * MIN, 'at least 10 min after a 429');
  assert.equal(nextDelay({ status: 429, retryAfter: 30 * MIN }, 1), 30 * MIN, 'honours Retry-After');
  assert.equal(retryAfterMs('120'), 120e3);
  assert.equal(retryAfterMs(new Date(Date.now() + 60e3).toUTCString()) > 50e3, true);
  assert.equal(retryAfterMs('soon'), null);
});
