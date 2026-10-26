'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../plugin/i18n');
const en = require('../plugin/i18n/en');

const root = path.join(__dirname, '..', 'plugin');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

// Décode un littéral JS entre apostrophes tel qu'il est écrit dans le source.
const unescape = (literal) => literal.replace(/\\\\/g, '\\').replace(/\\'/g, "'");

test('traducteur : français inchangé, variables, pluriels et repli', () => {
  const fr = i18n.create('fr', { en });
  assert.equal(fr('Bonjour {name}', { name: 'Léa' }), 'Bonjour Léa');
  assert.equal(fr.plural(0, '{n} média', '{n} médias'), '0 média');
  assert.equal(fr.plural(2, '{n} média', '{n} médias'), '2 médias');
  const english = i18n.create('en-GB', { en });
  assert.equal(english.language, 'en');
  assert.equal(english.plural(0, '{n} média', '{n} médias'), '0 clips');
  assert.equal(english.plural(1, '{n} média', '{n} médias'), '1 clip');
  assert.equal(english('Texte sans traduction'), 'Texte sans traduction');
  assert.equal(english('Désinstaller'), 'Uninstall');
  assert.equal(i18n.normalizeLocale('de-DE'), 'en');
  assert.equal(i18n.normalizeLocale('fr-CA'), 'fr');
});

test('tout texte t(…) du code a une traduction anglaise', () => {
  const files = ['renderer.js', 'main.js', 'proxy-settings.js', ...fs.readdirSync(path.join(root, 'lib')).filter((f) => f.endsWith('.js')).map((f) => `lib/${f}`)];
  const literal = "'((?:[^'\\\\]|\\\\.)*)'";
  const missing = [];
  for (const file of files) {
    const source = read(file);
    const keys = [...source.matchAll(new RegExp(`\\bt\\(${literal}`, 'g'))].map((m) => m[1]);
    for (const m of source.matchAll(new RegExp(`t\\.plural\\([^,]+,\\s*${literal},\\s*${literal}`, 'g'))) keys.push(m[1], m[2]);
    for (const key of keys.map(unescape)) if (!(key in en)) missing.push(`${file}: ${key}`);
  }
  assert.deepEqual(missing, []);
});

test('tout texte visible de index.html a une traduction anglaise', () => {
  const html = read('index.html').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  const SAME = new Set(['RPM - Resolve Project Manager', 'HD · 1280 × 720', 'Full HD · 1920 × 1080', '2K DCI · 2048 × 1080', 'Ultra HD · 3840 × 2160', '4K DCI · 4096 × 2160', 'proxy', 'Français', 'English', 'Sources', 'MD5', 'SHA-256', 'xxHash 64']);
  const texts = [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter((text) => /[A-Za-zÀ-ÿ]{2}/.test(text) && !/^v\d/.test(text));
  const attrs = [...html.matchAll(/\b(?:placeholder|aria-label|title)="([^"]+)"/g)].map((m) => m[1].trim());
  const missing = [...texts, ...attrs].filter((text) => !SAME.has(text) && !(text in en));
  assert.deepEqual([...new Set(missing)], []);
});

test('anglais : aucune valeur vide et mêmes variables que la clé', () => {
  const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim(), key);
    assert.equal(vars(value), vars(key), key);
  }
});

test('rapports et avertissements suivent la langue choisie', () => {
  const { setLocale } = require('../plugin/lib/t');
  const { buildTextReport, buildCsvReport } = require('../plugin/lib/report');
  setLocale('en');
  const result = { projectName: 'Nike', importedCount: 2, excludedCount: 0, createdBins: ['Rushes'], timelineName: '', files: [{ name: 'A.mov', path: '/A.mov', status: 'failed' }], warning: '', syncReport: { mode: 'Timecode', days: [{ day: '2026-09-12', ok: false, video: 1, audio: 1 }], unmatchedAudio: 0 } };
  const text = buildTextReport(result, new Date('2026-10-26T10:00:00Z'));
  assert.match(text, /RPM report — Nike/);
  assert.match(text, /Media imported: 2/);
  assert.match(text, /\[Failed\] A\.mov/);
  assert.match(text, /\[Not confirmed\] 2026-09-12 · 1 picture\(s\), 1 audio file\(s\) · Timecode/);
  assert.match(buildCsvReport(result), /Section;Status;Detail/);
  setLocale('fr');
  assert.match(buildTextReport(result), /Rapport RPM — Nike/);
});
