'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cloneCard, validateCloneFolders } = require('../plugin/lib/clone');

function fakeStorage(statuses, calls = []) {
  let index = 0;
  return {
    calls,
    SetCloneToolSettings: async (settings) => { calls.push(['settings', settings]); return true; },
    StartCloneMedia: async (source, targets) => { calls.push(['start', source, targets]); return true; },
    StopCloneMedia: async () => { calls.push(['stop']); return true; },
    GetCloneStatus: async () => statuses[Math.min(index++, statuses.length - 1)]
  };
}

test('copie : réglages, démarrage, progression puis dossiers copiés', async () => {
  const storage = fakeStorage([{ JobStatus: 'Cloning', CompletionPercentage: 40 }, { JobStatus: 'Complete', CompletionPercentage: 100 }]);
  const progress = [];
  const result = await cloneCard({ mediaStorage: storage, source: '/Volumes/CARTE_A', targets: ['/Volumes/RAID/J1', '/Volumes/BACKUP/J1'], checksum: 'sha256', constants: { CLONE_CHECKSUM_TYPE_SHA256: 4 }, onProgress: (p) => progress.push(p), pollMs: 1 });
  assert.deepEqual(storage.calls[0], ['settings', { PreserveFolderName: true, ChecksumType: 4 }]);
  assert.deepEqual(storage.calls[1], ['start', '/Volumes/CARTE_A', ['/Volumes/RAID/J1', '/Volumes/BACKUP/J1']]);
  assert.deepEqual(progress, [40, 100, 100]);
  assert.deepEqual(result.copiedPaths, [path.join('/Volumes/RAID/J1', 'CARTE_A'), path.join('/Volumes/BACKUP/J1', 'CARTE_A')]);
});

test('copie : échec Resolve, annulation dans Resolve et réglages refusés', async () => {
  await assert.rejects(cloneCard({ mediaStorage: fakeStorage([{ JobStatus: 'Failed', Error: 'disque plein' }]), source: '/a', targets: ['/b'], pollMs: 1 }), /disque plein/);
  await assert.rejects(cloneCard({ mediaStorage: fakeStorage([{ JobStatus: 'Cancelled' }]), source: '/a', targets: ['/b'], pollMs: 1 }), /annulée/);
  const refusing = { ...fakeStorage([]), SetCloneToolSettings: async () => false };
  await assert.rejects(cloneCard({ mediaStorage: refusing, source: '/a', targets: ['/b'] }), /réglages de copie/);
});

test('copie : interruption demandée par l’utilisateur arrête le job Resolve', async () => {
  const storage = fakeStorage([{ JobStatus: 'Cloning', CompletionPercentage: 10 }]);
  const controller = new AbortController();
  const promise = cloneCard({ mediaStorage: storage, source: '/a', targets: ['/b'], signal: controller.signal, pollMs: 5 });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(promise, { name: 'AbortError' });
  assert.ok(storage.calls.some(([name]) => name === 'stop'));
});

test('validation : chemins relatifs, doublons et dossiers imbriqués refusés', () => {
  assert.throws(() => validateCloneFolders('carte', ['/b']), /source/);
  assert.throws(() => validateCloneFolders('/a', ['b']), /destination/);
  assert.throws(() => validateCloneFolders('/a', ['/b', '/b']), /différents/);
  assert.throws(() => validateCloneFolders('/Volumes/CARTE', ['/Volumes/CARTE/copie']), /contenir la carte/);
  assert.throws(() => validateCloneFolders('/Volumes/RAID/carte', ['/Volumes/RAID']), /contenir la carte/);
  assert.deepEqual(validateCloneFolders('/Volumes/CARTE/', ['/Volumes/RAID']), { source: '/Volumes/CARTE', targets: ['/Volumes/RAID'] });
});
