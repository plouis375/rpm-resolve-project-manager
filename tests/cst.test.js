'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const c = require('../plugin/lib/cst');

test('profileForCamera : caméras prises en charge', () => {
  assert.equal(c.profileForCamera('Sony', 'ILME-FX3'), 'sony-slog3');
  assert.equal(c.profileForCamera('Sony', 'ILME-FX6V'), 'sony-slog3');
  assert.equal(c.profileForCamera('Sony', 'PXW-FX9'), 'sony-slog3');
  assert.equal(c.profileForCamera('Sony', 'MPC-2610'), 'sony-slog3');
  assert.equal(c.profileForCamera('Sony', 'BURANO'), 'sony-slog3');
  assert.equal(c.profileForCamera('Canon', 'EOS C70'), 'canon-clog2');
  assert.equal(c.profileForCamera('Canon', 'EOS C50'), 'canon-clog2');
  assert.equal(c.profileForCamera('Canon', 'EOS R5'), 'canon-clog3');
});

test('profileForCamera : pas de faux positifs', () => {
  assert.equal(c.profileForCamera('Sony', 'ILCE-7M3'), null);
  assert.equal(c.profileForCamera('Canon', 'EOS C700'), null);
  assert.equal(c.profileForCamera('Canon', 'EOS R50'), null);
  assert.equal(c.profileForCamera('À identifier', 'À identifier'), null);
  assert.equal(c.profileForCamera('', ''), null);
});

test('presetFileName : tous les presets existent', () => {
  for (const profile of Object.keys(c.PROFILES).filter((key) => !c.MANAGED_ONLY.has(key))) {
    for (const output of Object.keys(c.OUTPUTS)) {
      const file = path.join(__dirname, '../plugin/presets', c.presetFileName(profile, output));
      assert.ok(fs.existsSync(file), file);
    }
  }
  assert.equal(c.presetFileName('inconnu', 'rec709a'), null);
});

test('profileFromMetadata : gamma Sony prioritaire', () => {
  assert.equal(c.profileFromMetadata('Sony', 'ILME-FX6V', 's-log3-cine'), 'sony-slog3');
  assert.equal(c.profileFromMetadata('Sony', 'ILME-FX3', 'rec709'), 'none');
  assert.equal(c.profileFromMetadata('Sony', 'ILME-FX3', 'hlg'), 'none');
  assert.equal(c.profileFromMetadata('Sony', 'ILME-FX3', 's-log2'), null);
  assert.equal(c.profileFromMetadata('Canon', 'EOS C70', ''), 'canon-clog2');
});

test('Sony : FX30, A7S III, A7 IV, A1 reçoivent S-Log3', () => {
  for (const model of ['ILME-FX30', 'ILCE-7SM3', 'ILCE-7M4', 'ILCE-1', 'ZV-E1']) assert.equal(c.profileForCamera('Sony', model), 'sony-slog3', model);
});

test('chaque profil a un espace d’entrée, et seuls les profils sans .drx sont réservés à la gestion couleur', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const key of Object.keys(c.PROFILES)) {
    assert.ok(c.INPUT_COLOR_SPACES[key], key);
    const hasPreset = fs.existsSync(path.join(__dirname, '..', 'plugin', 'presets', c.presetFileName(key, 'rec709a')));
    assert.equal(hasPreset, !c.MANAGED_ONLY.has(key), key);
  }
});

test('profileFromMetadata : gamma Canon et autres logs lus dans le XML', () => {
  assert.equal(c.profileFromMetadata('Canon', 'EOS C70', 'canon-log3'), 'canon-clog3');
  assert.equal(c.profileFromMetadata('Canon', 'EOS C70', 'Canon Log 2'), 'canon-clog2');
  assert.equal(c.profileFromMetadata('Canon', 'EOS C70', 'c-log3'), 'canon-clog3');
  assert.equal(c.profileFromMetadata('Canon', 'EOS C70', 'bt709'), 'none');
  assert.equal(c.profileFromMetadata('Panasonic', 'S1H', 'v-log'), 'panasonic-vlog');
  assert.equal(c.profileFromMetadata('Fujifilm', 'X-H2S', 'f-log2'), 'fujifilm-flog2');
  assert.equal(c.profileFromMetadata('Sony', 'ILME-FX3', 's-log2'), null);
});

test('profileFromMetadata : fonction de transfert ffprobe, sans écraser le XML ni se fier à bt709', () => {
  assert.equal(c.profileFromMetadata('Sony', 'ILME-FX3', '', 'arib-std-b67'), 'none');
  assert.equal(c.profileFromMetadata('Apple', 'iPhone 15 Pro', '', 'smpte2084'), 'none');
  assert.equal(c.profileFromMetadata('Sony', 'ILME-FX3', '', 'bt709'), 'sony-slog3');
  assert.equal(c.profileFromMetadata('Sony', 'ILME-FX3', 's-log3-cine', 'arib-std-b67'), 'sony-slog3');
  assert.equal(c.profileFromMetadata('Apple', 'iPhone 15 Pro', '', 'apple-log'), 'apple-log');
  assert.equal(c.profileFromMetadata('Nikon', 'Z9', '', 'bt709'), null);
});

test('profileFromMetadata : « canon-log » seul n’est pas pris pour N-Log', () => {
  assert.equal(c.profileFromMetadata('Canon', 'EOS C70', 'canon-log'), null);
});
