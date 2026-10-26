'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'plugin', name), 'utf8');

test('la version de package.json, du manifeste et du pied de page de l’interface concordent', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.match(read('manifest.xml'), new RegExp(`<Version>${version.replace(/\./g, '\\.')}</Version>`));
  assert.match(read('index.html'), new RegExp(`v${version.replace(/\./g, '\\.')} · <button class="link-button" id="uninstallPlugin"`));
});

test('le CHANGELOG commence par la version courante', () => {
  const version = JSON.parse(read('package.json')).version;
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, new RegExp(`^# Historique des versions\\n\\n## v${version.replace(/\./g, '\\.')}\\b`));
});
