'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../plugin/lib/media');

test('normalizeBrand : mots entiers uniquement', () => {
  assert.equal(m.normalizeBrand('CANON', 'EOS C70'), 'Canon');
  assert.equal(m.normalizeBrand('RED Digital Cinema', 'KOMODO 6K'), 'RED');
  assert.equal(m.normalizeBrand('Shared Studio', 'Credo'), 'Shared Studio');
  assert.equal(m.normalizeBrand('', 'ILME-FX3'), 'Sony');
});

test('normalizeDate : UTC converti en heure locale', () => {
  process.env.TZ = 'Europe/Paris';
  // 22:30 UTC le 12 = 00:30 le 13 à Paris (été)
  assert.equal(m.normalizeDate('2026-09-12T22:30:00.000000Z'), '2026-09-13');
  assert.equal(m.normalizeDate('2026:09:12 23:10:00'), '2026-09-12');
  assert.equal(m.normalizeDate('20260912'), '2026-09-12');
  assert.equal(m.normalizeDate(''), '');
});

test('filterSidecars : Canon et Sony', () => {
  const f = (p) => ({ filePath: p, extension: require('node:path').extname(p).toLowerCase() });
  const out = m.filterSidecars([f('/a/A001.MXF'), f('/a/A001.XML'), f('/a/C0001.MP4'), f('/a/C0001M01.XML'), f('/a/montage.xml')]);
  assert.deepEqual(out.map((x) => x.filePath), ['/a/A001.MXF', '/a/C0001.MP4', '/a/montage.xml']);
});

test('parseSidecarXml : Canon, Sony, et refus des entités', () => {
  assert.deepEqual(m.parseSidecarXml('<Device><Manufacturer>CANON</Manufacturer><ModelName>EOS C70</ModelName></Device>'), { cameraMake: 'CANON', cameraModel: 'EOS C70', date: '', time: '', captureGamma: '', capturePrimaries: '' });
  const sony = m.parseSidecarXml('<NonRealTimeMeta><CreationDate value="2026-09-12T10:00:00+02:00"/><Device manufacturer="Sony" modelName="ILME-FX6V"/></NonRealTimeMeta>');
  assert.equal(sony.cameraModel, 'ILME-FX6V');
  assert.equal(sony.date, '2026-09-12');
  assert.equal(sony.time, '10:00:00');
  assert.equal(m.parseSidecarXml('<!DOCTYPE x [<!ENTITY a "b">]><Manufacturer>&a;</Manufacturer>'), null);
});

test('markDuplicates : images sans durée et fichiers vides', () => {
  const files = [
    { id: '1', name: 'IMG.JPG', size: 100, duration: null, include: true },
    { id: '2', name: 'img.jpg', size: 100, duration: null, include: true },
    { id: '3', name: 'vide.mov', size: 0, include: true },
    { id: '4', name: 'vide.mov', size: 0, include: true }
  ];
  m.markDuplicates(files);
  assert.equal(files[1].duplicateOf, '1');
  assert.equal(files[1].include, false);
  assert.equal(files[3].duplicateOf, undefined);
});

test('matchImported : association par chemin malgré un échec au milieu', () => {
  const batch = [{ filePath: '/r/a.mov' }, { filePath: '/r/b.mov' }, { filePath: '/r/c.mov' }];
  const { matched, failed } = m.matchImported(batch, ['/r/a.mov', '/r/c.mov']);
  assert.deepEqual(matched.map((x) => [x.file.filePath, x.index]), [['/r/a.mov', 0], ['/r/c.mov', 1]]);
  assert.deepEqual(failed.map((x) => x.filePath), ['/r/b.mov']);
});

test('dominantFormat et nearestFrameRate', () => {
  assert.equal(m.nearestFrameRate(23.98), 23.976);
  assert.equal(m.nearestFrameRate(119.9), 119.88);
  const d = m.dominantFormat([{ width: 3840, height: 2160, fps: 25 }, { width: 3840, height: 2160, fps: 25 }, { width: 1920, height: 1080, fps: 50 }]);
  assert.deepEqual([d.width, d.height, d.fps], [3840, 2160, 25]);
  assert.deepEqual(m.dominantFormat([]), { width: 1920, height: 1080, fps: 24 });
});

test('parseSidecarXml : gamma Sony', () => {
  const x = '<NonRealTimeMeta><Device manufacturer="Sony" modelName="ILME-FX3"/><AcquisitionRecord><Group name="CameraUnitMetadataSet"><Item name="CaptureGammaEquation" value="s-log3-cine"/><Item name="CaptureColorPrimaries" value="s-gamut3-cine"/></Group></AcquisitionRecord></NonRealTimeMeta>';
  const r = m.parseSidecarXml(x);
  assert.equal(r.captureGamma, 's-log3-cine');
  assert.equal(r.capturePrimaries, 's-gamut3-cine');
});

test('normalizeTime : heure locale, fuseau converti', () => {
  process.env.TZ = 'Europe/Paris';
  assert.equal(m.normalizeTime('2026-09-12T22:30:05.000000Z'), '00:30:05');
  assert.equal(m.normalizeTime('2026-09-12 12:30:00 +0000'), '14:30:00');
  assert.equal(m.normalizeTime('2026:09:12 23:10:00'), '23:10:00');
  assert.equal(m.normalizeTime('2026-09-12 09:41'), '09:41:00');
  assert.equal(m.normalizeTime('20260912'), '');
});

test('parseTimecode : non drop, drop frame et valeurs invalides', () => {
  assert.equal(m.parseTimecode('01:00:00:00', 25), 3600);
  assert.equal(m.parseTimecode('10:02:03;12', 29.97), 36123 + 12 / 29.97);
  assert.ok(m.parseTimecode('10:02:03:24', 25) < m.parseTimecode('10:02:04:00', 25));
  assert.ok(m.parseTimecode('10:02:03:59') < m.parseTimecode('10:02:04:00'), 'sans fréquence, les images restent sous la seconde');
  assert.equal(m.parseTimecode('25:00:00:00', 25), null);
  assert.equal(m.parseTimecode('', 25), null);
});

test('sortForTimeline : jour, puis timecode ou heure, puis nom', () => {
  const f = (name, shootingDate, timecode, shootingTime) => ({ name, shootingDate, timecode, shootingTime, fps: 25 });
  const files = [
    f('B_FX6.MP4', '2026-09-12', '14:00:00:00', '09:00:00'),
    f('A_C70.MXF', '2026-09-12', '10:00:00:00', '11:00:00'),
    f('SANS_TC.MOV', '2026-09-12', '', '12:00:00'),
    f('J2.MP4', '2026-09-13', '08:00:00:00', '08:00:00'),
    f('INCONNU.MOV', 'Date inconnue', '', '')
  ];
  const names = (order) => m.sortForTimeline(files, order).map((x) => x.name);
  assert.deepEqual(names('timecode'), ['A_C70.MXF', 'SANS_TC.MOV', 'B_FX6.MP4', 'J2.MP4', 'INCONNU.MOV']);
  assert.deepEqual(names('time'), ['B_FX6.MP4', 'A_C70.MXF', 'SANS_TC.MOV', 'J2.MP4', 'INCONNU.MOV']);
  assert.deepEqual(names('import'), files.map((x) => x.name));
  const wrapped = m.sortForTimeline(files.map((file) => ({ file })), 'timecode', (entry) => entry.file);
  assert.equal(wrapped[0].file.name, 'A_C70.MXF');
});

test('categoryFor : le son d’enregistreur va dans Son, les autres formats dans Musiques', () => {
  assert.equal(m.categoryFor('.wav'), 'Son');
  assert.equal(m.categoryFor('.aiff'), 'Son');
  assert.equal(m.categoryFor('.mp3'), 'Musiques');
  assert.equal(m.categoryFor('.mov'), 'Rushs');
});
