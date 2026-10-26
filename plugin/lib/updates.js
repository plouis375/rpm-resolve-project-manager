'use strict';
// Vérification discrète de la dernière version publiée sur GitHub.

const LATEST_RELEASE_URL = 'https://api.github.com/repos/plouis375/rpm-resolve-project-manager/releases/latest';
const RELEASE_PAGE_PREFIX = 'https://github.com/plouis375/rpm-resolve-project-manager/';

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)(?:\.(\d+))?/i);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
}

function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index];
  return false;
}

// Retourne { version, url } si une version plus récente existe, sinon null. Ne lève jamais : hors ligne, silence.
async function checkForUpdate(currentVersion, fetchImpl = globalThis.fetch, timeoutMs = 5000) {
  try {
    const response = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'rpm-resolve-project-manager' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return null;
    const release = await response.json();
    if (release.draft || release.prerelease || !isNewer(release.tag_name, currentVersion)) return null;
    const url = typeof release.html_url === 'string' && release.html_url.startsWith(RELEASE_PAGE_PREFIX) ? release.html_url : '';
    return { version: String(release.tag_name).replace(/^v/i, ''), url };
  } catch (_) {
    return null;
  }
}

module.exports = { checkForUpdate, isNewer, parseVersion, RELEASE_PAGE_PREFIX };
