'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkForUpdate, isNewer } = require('../plugin/lib/updates');

const release = (extra = {}) => ({ ok: true, json: async () => ({ tag_name: 'v0.40.0', html_url: 'https://github.com/plouis375/rpm-resolve-project-manager/releases/tag/v0.40.0', ...extra }) });

test('isNewer : compare les versions numériquement', () => {
  assert.equal(isNewer('v0.10.0', '0.9.5'), true);
  assert.equal(isNewer('0.31.0', '0.31.0'), false);
  assert.equal(isNewer('v0.30.1', '0.31.0'), false);
  assert.equal(isNewer('abc', '0.31.0'), false);
});

test('checkForUpdate : version plus récente', async () => {
  const update = await checkForUpdate('0.31.0', async () => release());
  assert.deepEqual(update, { version: '0.40.0', url: 'https://github.com/plouis375/rpm-resolve-project-manager/releases/tag/v0.40.0' });
});

test('checkForUpdate : silence si identique, brouillon, hors ligne ou réponse invalide', async () => {
  assert.equal(await checkForUpdate('0.40.0', async () => release()), null);
  assert.equal(await checkForUpdate('0.31.0', async () => release({ draft: true })), null);
  assert.equal(await checkForUpdate('0.31.0', async () => release({ prerelease: true })), null);
  assert.equal(await checkForUpdate('0.31.0', async () => { throw new Error('offline'); }), null);
  assert.equal(await checkForUpdate('0.31.0', async () => ({ ok: false })), null);
});

test('checkForUpdate : une URL hors du dépôt n’est pas proposée', async () => {
  const update = await checkForUpdate('0.31.0', async () => release({ html_url: 'https://evil.example/x' }));
  assert.deepEqual(update, { version: '0.40.0', url: '' });
});
