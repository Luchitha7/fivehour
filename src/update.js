// "Update available" check against the latest GitHub release.
// Read-only: it never downloads or installs anything, it just tells the user and links
// to the release page.
const https = require('https');

const REPO = 'Luchitha7/fivehour';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PREFIX = `https://github.com/${REPO}/releases/`;

/** Parse "v1.2.3" / "1.2.3" (ignores pre-release/build suffixes). Returns null if invalid. */
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(v || '').trim());
  return m ? [+m[1], +m[2], +m[3]] : null;
}

/** true if `latest` is a newer version than `current`. */
function isNewer(latest, current) {
  const a = parseVersion(latest), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** Turn a GitHub release JSON into { version, url }, or null if it isn't usable/trustworthy. */
function parseRelease(json) {
  if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
  const version = parseVersion(json.tag_name) && String(json.tag_name).replace(/^v/, '');
  const url = typeof json.html_url === 'string' && json.html_url.startsWith(RELEASES_PREFIX) ? json.html_url : null;
  if (!version || !url) return null;
  return { version, url };
}

function fetchLatest() {
  return new Promise((resolve, reject) => {
    const req = https.get(API_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'fivehour-update-check' },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
        if (body.length > 512 * 1024) req.destroy(new Error('response too large'));
      });
      res.on('end', () => {
        if (res.statusCode === 404) return resolve(null); // no releases yet
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(parseRelease(JSON.parse(body))); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Resolves to { version, url } when a newer release exists, otherwise null. */
async function checkForUpdate(currentVersion) {
  const latest = await fetchLatest();
  return latest && isNewer(latest.version, currentVersion) ? latest : null;
}

module.exports = { checkForUpdate, isNewer, parseVersion, parseRelease, RELEASES_PREFIX };
