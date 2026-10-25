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
  assert.equal(c.profileForCamera('Sony', 'ILME-FX30'), null);
  assert.equal(c.profileForCamera('Canon', 'EOS C700'), null);
  assert.equal(c.profileForCamera('Canon', 'EOS R50'), null);
  assert.equal(c.profileForCamera('À identifier', 'À identifier'), null);
  assert.equal(c.profileForCamera('', ''), null);
});

test('presetFileName : tous les presets existent', () => {
  for (const profile of Object.keys(c.PROFILES)) {
    for (const output of Object.keys(c.OUTPUTS)) {
      const file = path.join(__dirname, '../plugin/presets', c.presetFileName(profile, output));
      assert.ok(fs.existsSync(file), file);
    }
  }
  assert.equal(c.presetFileName('inconnu', 'rec709a'), null);
});
