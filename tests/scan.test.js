'use strict';
// Les sorties ffprobe et mdls de tests/fixtures sont des sorties enregistrées au format réel de ces outils.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const scan = require('../plugin/lib/scan');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const tempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test('parseFFprobe : iPhone (marque, modèle, HLG, format, timecode)', () => {
  process.env.TZ = 'Europe/Paris';
  const meta = scan.parseFFprobe(JSON.parse(fixture('ffprobe-iphone.json')));
  assert.equal(meta.cameraMake, 'Apple');
  assert.equal(meta.cameraModel, 'iPhone 15 Pro');
  assert.equal(meta.colorTransfer, 'arib-std-b67');
  assert.deepEqual(meta.format, { width: 3840, height: 2160, fps: 29.97 });
  assert.equal(meta.duration, 12.512);
  assert.equal(meta.timecode, '00:00:00:00');
  assert.equal(meta.date, '2026-09-12');
  assert.equal(meta.verified, true);
});

test('parseFFprobe : WAV BWF, date et heure d’origine', () => {
  const meta = scan.parseFFprobe(JSON.parse(fixture('ffprobe-bwf-wav.json')));
  assert.equal(meta.date, '2026-09-12');
  assert.equal(meta.time, '09:15:30');
  assert.equal(meta.timecode, '09:15:30:00');
  assert.equal(meta.format, null);
});

test('parseFFprobe : sortie sans flux = non vérifié', () => {
  assert.equal(scan.parseFFprobe({ streams: [], format: {} }).verified, false);
});

test('parseSpotlight : sortie mdls', () => {
  const meta = scan.parseSpotlight(fixture('mdls-clip.txt'));
  assert.equal(meta.cameraMake, 'Canon');
  assert.equal(meta.cameraModel, 'EOS C70');
  assert.deepEqual(meta.format, { width: 4096, height: 2160, fps: null });
  assert.equal(meta.duration, 42.5);
  assert.equal(meta.verified, true);
  assert.equal(scan.parseSpotlight('kMDItemDurationSeconds = (null)\n').verified, false);
});

test('probeWithFFprobe : ffprobe absent, en échec ou interrompu', async () => {
  assert.equal(await scan.probeWithFFprobe('/x.mov', null, { findFFprobe: async () => null }), null);
  const failing = { findFFprobe: async () => '/bin/ffprobe', execFileAsync: async () => { throw new Error('boom'); } };
  assert.deepEqual(await scan.probeWithFFprobe('/x.mov', null, failing), { verified: false });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(scan.probeWithFFprobe('/x.mov', controller.signal, failing), { name: 'AbortError' });
});

test('scanDirectory : médias reconnus, sans fichiers cachés, proxy, .app ni sidecar XML', async () => {
  const dir = tempDir('rpm-scan-');
  for (const p of ['A001.mov', 'A001M01.XML', 'B001.mxf', 'B001.XML', '.cache.mov', 'notes.txt', 'son/SON1.wav', 'proxy/A001.mov', 'Tool.app/Contents/x.mov', 'sub/C001.mp4']) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), 'x');
  }
  const files = await scan.scanDirectory(dir, null);
  const names = files.map((file) => path.relative(fs.realpathSync(dir), file.filePath)).sort();
  assert.deepEqual(names, ['A001.mov', 'B001.mxf', 'son/SON1.wav', 'sub/C001.mp4']);
  assert.equal(files.find((file) => file.filePath.endsWith('SON1.wav')).category, 'Son');
  await assert.rejects(scan.scanDirectory(path.join(dir, 'A001.mov'), null), /Dossier source invalide/);
});

test('enrichFile : ffprobe, sidecar XML Sony, proxy et profil couleur', async () => {
  const dir = tempDir('rpm-enrich-');
  fs.mkdirSync(path.join(dir, 'proxy'));
  fs.writeFileSync(path.join(dir, 'C0001.MP4'), 'video');
  fs.writeFileSync(path.join(dir, 'proxy', 'C0001.mov'), 'p');
  fs.writeFileSync(path.join(dir, 'C0001M01.XML'), '<NonRealTimeMeta><Device manufacturer="Sony" modelName="ILME-FX3"/><AcquisitionRecord><Group name="CameraUnitMetadataSet"><Item name="CaptureGammaEquation" value="s-log3-cine"/></Group></AcquisitionRecord></NonRealTimeMeta>');
  const deps = {
    findFFprobe: async () => '/bin/ffprobe',
    execFileAsync: async () => ({ stdout: JSON.stringify({ streams: [{ codec_type: 'video', width: 3840, height: 2160, avg_frame_rate: '24000/1001', duration: '5' }], format: { duration: '5', tags: { creation_time: '2026-09-12T08:00:00Z' } } }) }),
    proxyCache: new Map(),
    randomUUID: () => 'id-1'
  };
  const file = await scan.enrichFile({ filePath: path.join(dir, 'C0001.MP4'), extension: '.mp4', category: 'Rushs', sourceFolder: dir }, null, deps);
  assert.equal(file.id, 'id-1');
  assert.equal(file.cameraBrand, 'Sony');
  assert.equal(file.cameraModel, 'ILME-FX3');
  assert.equal(file.colorProfile, 'sony-slog3');
  assert.equal(file.captureGamma, 's-log3-cine');
  assert.equal(file.proxyPath, path.join(dir, 'proxy', 'C0001.mov'));
  assert.equal(file.fps, 23.976);
  assert.equal(file.dateSource, 'metadata');
  assert.equal(file.needsReview, false);
});

test('enrichFile : Spotlight en repli sans ffprobe, et fichier non lisible à vérifier', async () => {
  const dir = tempDir('rpm-spotlight-');
  fs.writeFileSync(path.join(dir, 'A001.mov'), 'video');
  fs.writeFileSync(path.join(dir, 'B001.mov'), 'video');
  const deps = (stdout) => ({
    findFFprobe: async () => null,
    execFileAsync: async () => { if (stdout instanceof Error) throw stdout; return { stdout }; },
    proxyCache: new Map()
  });
  const read = await scan.enrichFile({ filePath: path.join(dir, 'A001.mov'), extension: '.mov', category: 'Rushs' }, null, deps(fixture('mdls-clip.txt')));
  assert.equal(read.cameraBrand, 'Canon');
  assert.equal(read.verified, true);
  const unreadable = await scan.enrichFile({ filePath: path.join(dir, 'B001.mov'), extension: '.mov', category: 'Rushs' }, null, deps(new Error('mdls')));
  assert.equal(unreadable.verified, false);
  assert.equal(unreadable.needsReview, true);
});

test('verifyDuplicateContents : contenus identiques regroupés, fichiers distincts rétablis', async () => {
  const dir = tempDir('rpm-dup-');
  const write = (name, content) => { const filePath = path.join(dir, name); fs.writeFileSync(filePath, content); return filePath; };
  const files = [
    { id: 'a', filePath: write('a.mov', 'AAAA'), include: true, duplicateOf: null },
    { id: 'b', filePath: write('b.mov', 'AAAA'), include: false, duplicateOf: 'a', duplicateAutoExcluded: true },
    { id: 'c', filePath: write('c.mov', 'BBBB'), include: false, duplicateOf: 'a', duplicateAutoExcluded: true }
  ];
  const progress = [];
  const result = await scan.verifyDuplicateContents({ files, selections: files.map(({ id, include }) => ({ id, include })), onProgress: (current, total) => progress.push([current, total]) });
  assert.deepEqual(result, { identicalGroups: 1, distinctFiles: 1, unreadableGroups: 0 });
  const byId = Object.fromEntries(files.map((file) => [file.id, file]));
  assert.equal(byId.b.duplicateOf, 'a');
  assert.equal(byId.b.duplicateVerification, 'identical');
  assert.equal(byId.c.duplicateOf, null);
  assert.equal(byId.c.include, true);
  assert.deepEqual(progress.at(-1), [3, 3]);
});

test('verifyDuplicateContents : fichier illisible signalé, interruption restaure l’état', async () => {
  const dir = tempDir('rpm-dup2-');
  const a = path.join(dir, 'a.mov');
  fs.writeFileSync(a, 'AAAA');
  const files = [
    { id: 'a', filePath: a, include: true, duplicateOf: null },
    { id: 'b', filePath: path.join(dir, 'absent.mov'), include: false, duplicateOf: 'a', duplicateAutoExcluded: true }
  ];
  const result = await scan.verifyDuplicateContents({ files, selections: [] });
  assert.equal(result.unreadableGroups, 1);
  assert.equal(files[1].duplicateVerification, 'unreadable');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(scan.verifyDuplicateContents({ files, selections: [], signal: controller.signal }), { name: 'AbortError' });
});
