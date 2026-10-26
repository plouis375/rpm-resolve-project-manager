'use strict';
// Retrouve les proxies déjà générés (par Blackmagic Proxy Generator ou Resolve) près des rushs :
// un sous-dossier « proxy » contenant un fichier du même nom, quelle que soit l'extension vidéo.
const path = require('node:path');
const fs = require('node:fs/promises');
const { VIDEO } = require('./media');

async function listProxyDir(directory, cache) {
  if (cache.has(directory)) return cache.get(directory);
  const index = new Map();
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!VIDEO.has(extension)) continue;
      const stem = path.basename(entry.name, extension).toLowerCase();
      if (!index.has(stem)) index.set(stem, path.join(directory, entry.name));
    }
  } catch (_) {}
  cache.set(directory, index);
  return index;
}

// Retourne le chemin du proxy du fichier, ou '' s'il n'y en a pas.
async function findProxy(filePath, cache = new Map()) {
  const directory = path.dirname(filePath);
  let proxyDirectory = '';
  try {
    const entry = (await fs.readdir(directory, { withFileTypes: true })).find((item) => item.isDirectory() && item.name.toLowerCase() === 'proxy');
    if (entry) proxyDirectory = path.join(directory, entry.name);
  } catch (_) {}
  if (!proxyDirectory) return '';
  const index = await listProxyDir(proxyDirectory, cache);
  const stem = path.basename(filePath, path.extname(filePath)).toLowerCase();
  const proxy = index.get(stem) || '';
  return proxy && proxy !== filePath ? proxy : '';
}

module.exports = { findProxy };
