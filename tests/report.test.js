'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTextReport, buildCsvReport } = require('../plugin/lib/report');

const result = {
  projectName: 'Campagne Nike 2026',
  importedCount: 2,
  excludedCount: 1,
  createdBins: ['Rushs', 'Son'],
  timelineName: 'Campagne — Assemblage',
  timelineFormat: '1920 × 1080 · 24 i/s',
  warning: 'Resolve n’a pas confirmé la synchro du son pour 2026-09-13.',
  files: [
    { name: 'A001.mov', path: '/src/A001.mov', status: 'imported' },
    { name: 'A;002.mov', path: '/src/A002.mov', status: 'failed' },
    { name: 'A003.mov', path: '/src/A003.mov', status: 'unverified' }
  ],
  colorReport: { method: 'cst', applied: 1, skipped: 0, unrecognized: ['X001.mov'], failed: ['A001.mov'], output: 'Rec.709-A' },
  syncReport: { mode: 'Timecode', unavailable: false, unmatchedAudio: 1, days: [{ day: '2026-09-12', ok: true, video: 2, audio: 1 }, { day: '2026-09-13', ok: false, video: 1, audio: 1 }] },
  resolveWarnings: ['[RPM] SetClipColor : Délai dépassé']
};

test('rapport texte : imports, plans sans CST, jours non synchronisés et avertissements Resolve', () => {
  const text = buildTextReport(result, new Date('2026-10-26T10:00:00Z'));
  assert.match(text, /Rapport RPM — Campagne Nike 2026/);
  assert.match(text, /\[Échec\] A;002\.mov/);
  assert.match(text, /\[À vérifier\] A003\.mov/);
  assert.match(text, /\[Profil non reconnu\] X001\.mov/);
  assert.match(text, /\[Non confirmé\] 2026-09-13/);
  assert.match(text, /\[Avertissement\] \[RPM\] SetClipColor/);
});

test('rapport CSV : BOM, séparateur point-virgule et guillemets', () => {
  const csv = buildCsvReport(result);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'Section;Statut;Détail');
  assert.ok(lines.some((line) => line.startsWith('Import;Échec;"A;002.mov · /src/A002.mov"')));
  assert.ok(lines.some((line) => line.startsWith('Synchro du son;Non confirmé;2026-09-13')));
});
