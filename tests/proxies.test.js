'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { findProxy } = require('../plugin/lib/proxies');

test('findProxy : proxy du même nom, extension et casse libres', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-proxy-'));
  fs.mkdirSync(path.join(dir, 'Proxy'));
  fs.writeFileSync(path.join(dir, 'A001.MXF'), '');
  fs.writeFileSync(path.join(dir, 'A002.MXF'), '');
  fs.writeFileSync(path.join(dir, 'Proxy', 'a001.mov'), '');
  fs.writeFileSync(path.join(dir, 'Proxy', 'A002.txt'), '');
  const cache = new Map();
  assert.equal(await findProxy(path.join(dir, 'A001.MXF'), cache), path.join(dir, 'Proxy', 'a001.mov'));
  assert.equal(await findProxy(path.join(dir, 'A002.MXF'), cache), '');
  assert.equal(await findProxy(path.join(dir, 'A009.MXF'), cache), '');
  assert.equal(cache.size, 1);
});

test('findProxy : sans dossier proxy', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-noproxy-'));
  assert.equal(await findProxy(path.join(dir, 'A001.mov')), '');
  assert.equal(await findProxy('/chemin/inexistant/A001.mov'), '');
});
