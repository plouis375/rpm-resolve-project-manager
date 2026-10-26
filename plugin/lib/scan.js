'use strict';
// Analyse des médias : lecture ffprobe et Spotlight, parcours des dossiers, enrichissement et comparaison des doublons.
// Ne dépend ni d'Electron ni de Resolve : les dépendances (ffprobe, execFile, progression) sont injectées,
// ce qui permet de tester avec des sorties ffprobe enregistrées (tests/scan.test.js).

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const {
  VIDEO, SUPPORTED, SYNC_AUDIO, cleanText, categoryFor, normalizeBrand, normalizeDate, normalizeTime, localDate, localTime,
  sidecarCandidates, filterSidecars, parseSidecarXml
} = require('./media');
const { profileFromMetadata } = require('./cst');
const { findProxy } = require('./proxies');

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('Opération interrompue.');
    error.name = 'AbortError';
    throw error;
  }
}

async function readSidecar(filePath) {
  for (const candidate of sidecarCandidates(filePath)) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile() || stat.size > 1024 * 1024) continue;
      const parsed = parseSidecarXml(await fs.readFile(candidate, 'utf8'));
      if (parsed) return parsed;
    } catch (_) {}
  }
  return null;
}

function metadataValue(tags, candidates) {
  const entries = Object.entries(tags || {}).map(([key, value]) => [key.toLowerCase(), cleanText(value)]);
  for (const candidate of candidates) {
    const match = entries.find(([key, value]) => key === candidate.toLowerCase() && value);
    if (match) return match[1];
  }
  return '';
}

function cameraModel(tags) {
  return metadataValue(tags, [
    'com.blackmagic-design.camera.cameraModel', 'camera_model', 'cameraModel',
    'model_name', 'model', 'com.apple.quicktime.model'
  ]);
}

function cameraMake(tags) {
  return metadataValue(tags, [
    'com.blackmagic-design.camera.make', 'camera_make', 'make',
    'com.apple.quicktime.make', 'manufacturer'
  ]);
}

function frameRate(streams) {
  const stream = streams.find((item) => item.codec_type === 'video' && item.width && item.height);
  if (!stream) return null;
  const raw = stream.avg_frame_rate && stream.avg_frame_rate !== '0/0' ? stream.avg_frame_rate : stream.r_frame_rate;
  if (!raw) return { width: stream.width, height: stream.height, fps: null };
  const [numerator, denominator = '1'] = raw.split('/').map(Number);
  const fps = denominator ? numerator / denominator : numerator;
  return { width: stream.width, height: stream.height, fps: Number.isFinite(fps) ? Number(fps.toFixed(3)) : null };
}

// Métadonnées d'une sortie JSON de `ffprobe -show_format -show_streams` (fonction pure).
function parseFFprobe(data) {
  const streams = data.streams || [];
  const tags = Object.assign({}, data.format?.tags || {}, ...streams.map((stream) => stream.tags || {}));
  const duration = Number(data.format?.duration || streams.find((item) => item.duration)?.duration);
  const recorded = metadataValue(tags, ['creation_time', 'com.apple.quicktime.creationdate', 'date_recorded', 'date']);
  // WAV BWF : date et heure d'origine dans deux champs séparés.
  const origination = [metadataValue(tags, ['origination_date']), metadataValue(tags, ['origination_time'])].filter(Boolean).join(' ').replace(/^(\d{4}-\d{2}-\d{2}) (\d{2})[-:](\d{2})[-:](\d{2})$/, '$1 $2:$3:$4');
  return {
    cameraMake: cameraMake(tags),
    cameraModel: cameraModel(tags),
    date: normalizeDate(recorded || origination),
    time: normalizeTime(recorded || origination),
    timecode: metadataValue(tags, ['timecode']),
    colorTransfer: cleanText(streams.find((stream) => stream.codec_type === 'video')?.color_transfer),
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    format: frameRate(streams),
    verified: streams.length > 0
  };
}

async function probeWithFFprobe(filePath, signal, { findFFprobe, execFileAsync }) {
  const probe = await findFFprobe();
  if (!probe) return null;
  try {
    const { stdout } = await execFileAsync(probe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath], {
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
      signal
    });
    return parseFFprobe(JSON.parse(stdout));
  } catch (_) {
    throwIfAborted(signal);
    return { verified: false };
  }
}

const SPOTLIGHT_NAMES = ['kMDItemAcquisitionMake', 'kMDItemAcquisitionModel', 'kMDItemContentCreationDate', 'kMDItemDurationSeconds', 'kMDItemPixelWidth', 'kMDItemPixelHeight'];

// Métadonnées d'une sortie `mdls` (fonction pure).
function parseSpotlight(stdout) {
  const values = Object.fromEntries(String(stdout).split('\n').map((line) => {
    const index = line.indexOf(' = ');
    return index < 0 ? ['', ''] : [line.slice(0, index).trim(), line.slice(index + 3).trim().replace(/^"|"$/g, '')];
  }));
  const number = (key) => Number(values[key]);
  const width = number('kMDItemPixelWidth');
  const height = number('kMDItemPixelHeight');
  const duration = number('kMDItemDurationSeconds');
  return {
    cameraMake: cleanText(values.kMDItemAcquisitionMake),
    cameraModel: cleanText(values.kMDItemAcquisitionModel),
    date: normalizeDate(values.kMDItemContentCreationDate),
    time: normalizeTime(values.kMDItemContentCreationDate),
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    format: width && height ? { width, height, fps: null } : null,
    verified: Boolean(width || height || duration || values.kMDItemContentCreationDate)
  };
}

async function probeWithSpotlight(filePath, signal, { execFileAsync }) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/mdls', [...SPOTLIGHT_NAMES.flatMap((name) => ['-name', name]), filePath], { timeout: 8000, maxBuffer: 64 * 1024, signal });
    return parseSpotlight(stdout);
  } catch (_) {
    throwIfAborted(signal);
    return { verified: false };
  }
}

function isProxyDirectory(name) {
  return name.toLocaleLowerCase('en-US') === 'proxy';
}

async function scanDirectory(root, signal) {
  const resolved = await fs.realpath(root);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error(`Dossier source invalide : ${root}`);
  const files = [];
  const pending = [resolved];
  while (pending.length) {
    throwIfAborted(signal);
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    throwIfAborted(signal);
    entries.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
    for (const entry of entries) {
      throwIfAborted(signal);
      if (entry.name.startsWith('.')) continue;
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.endsWith('.app') && !entry.name.endsWith('.bundle') && !isProxyDirectory(entry.name)) pending.push(filePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (SUPPORTED.has(extension)) files.push({ filePath, extension, category: categoryFor(extension) });
    }
  }
  return filterSidecars(files);
}

// Analyse un fichier : métadonnées (ffprobe, sinon Spotlight), sidecar XML, proxy, profil couleur.
// deps : { findFFprobe, execFileAsync, proxyCache, randomUUID }
async function enrichFile(file, signal, deps) {
  throwIfAborted(signal);
  const stat = await fs.stat(file.filePath);
  const [probe, fallback] = await Promise.all([
    probeWithFFprobe(file.filePath, signal, deps),
    deps.findFFprobe().then((probePath) => probePath ? null : probeWithSpotlight(file.filePath, signal, deps))
  ]);
  throwIfAborted(signal);
  const metadata = { ...(probe || fallback || { verified: false }) };
  if (VIDEO.has(file.extension)) {
    const sidecar = await readSidecar(file.filePath);
    if (sidecar) {
      metadata.captureGamma = sidecar.captureGamma || '';
      metadata.cameraMake ||= sidecar.cameraMake;
      metadata.cameraModel ||= sidecar.cameraModel;
      if (!metadata.date && sidecar.date) {
        metadata.date = sidecar.date;
        metadata.time = sidecar.time;
      }
    }
  }
  throwIfAborted(signal);
  const rawMake = metadata.cameraMake || '';
  const rawModel = metadata.cameraModel || '';
  const shootingDate = metadata.date || localDate(stat.birthtime);
  // L'heure suit la source de la date : jamais une date des métadonnées avec l'heure du fichier.
  const shootingTime = metadata.date ? metadata.time || '' : localTime(stat.birthtime);
  const isVideo = VIDEO.has(file.extension);
  const isSyncAudio = SYNC_AUDIO.has(file.extension);
  const missingVideoMetadata = isVideo && (!rawMake || !rawModel);
  return {
    id: (deps.randomUUID || crypto.randomUUID)(),
    filePath: file.filePath,
    name: path.basename(file.filePath),
    sourceFolder: file.sourceFolder,
    extension: file.extension,
    category: file.category,
    size: stat.size,
    duration: metadata.duration || null,
    width: metadata.format?.width || null,
    height: metadata.format?.height || null,
    fps: metadata.format?.fps || null,
    cameraBrand: isVideo ? normalizeBrand(rawMake, rawModel) || '' : '',
    cameraModel: isVideo ? rawModel : '',
    proxyPath: isVideo ? await findProxy(file.filePath, deps.proxyCache) : '',
    captureGamma: isVideo ? metadata.captureGamma || '' : '',
    colorProfile: isVideo ? profileFromMetadata(normalizeBrand(rawMake, rawModel), rawModel, metadata.captureGamma, metadata.colorTransfer) || '' : '',
    // Son direct : date gardée pour synchroniser jour par jour (le timecode se répète d'un jour à l'autre).
    shootingDate: isVideo || isSyncAudio ? shootingDate : '',
    shootingTime: isVideo || isSyncAudio ? shootingTime : '',
    timecode: isVideo || isSyncAudio ? cleanText(metadata.timecode) : '',
    dateSource: isVideo ? (metadata.date ? 'metadata' : 'creation') : '',
    verified: metadata.verified,
    needsReview: stat.size === 0 || !metadata.verified || missingVideoMetadata,
    duplicateOf: null,
    include: true
  };
}

const PARTIAL_HASH_BYTES = 4 * 1024 * 1024;

// Empreinte rapide : taille + 4 Mo de début + 4 Mo de fin. Deux fichiers dont
// l’empreinte rapide diffère sont forcément différents ; sinon on lit tout.
async function partialHash(filePath, signal) {
  throwIfAborted(signal);
  const handle = await fs.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const hash = crypto.createHash('sha256').update(String(size));
    const length = Math.min(PARTIAL_HASH_BYTES, size);
    const head = Buffer.alloc(length);
    await handle.read(head, 0, length, 0);
    hash.update(head);
    if (size > PARTIAL_HASH_BYTES) {
      const tail = Buffer.alloc(length);
      await handle.read(tail, 0, length, size - length);
      hash.update(tail);
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

function hashFile(filePath, signal) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath, { signal });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Compare le contenu des groupes de doublons probables. `files` = fichiers du scan, modifiés sur place.
// `onProgress(current, total)` informe de l'avancement ; `selections` reprend les choix de l'utilisateur.
async function verifyDuplicateContents({ files, selections: selectionList, signal, onProgress = () => {} }) {
  const selections = new Map((selectionList || []).map((file) => [file.id, file]));
  for (const file of files) {
    const selection = selections.get(file.id);
    if (!selection) continue;
    file.include = selection.include !== false;
    if (selection.duplicateManuallyChanged) file.duplicateAutoExcluded = false;
  }
  const byId = new Map(files.map((file) => [file.id, file]));
  const groups = new Map();
  for (const file of files) {
    if (!file.duplicateOf) continue;
    const group = groups.get(file.duplicateOf) || [byId.get(file.duplicateOf)];
    group.push(file);
    groups.set(file.duplicateOf, group);
  }
  const jobs = [...groups.values()];
  const total = jobs.reduce((sum, group) => sum + group.length, 0);
  if (!total) return { identicalGroups: 0, distinctFiles: 0, unreadableGroups: 0 };
  let completed = 0;
  let identicalGroups = 0;
  let distinctFiles = 0;
  let unreadableGroups = 0;
  let cursor = 0;
  const originalFiles = files.map((file) => ({ ...file }));
  async function worker() {
    while (cursor < jobs.length) {
      throwIfAborted(signal);
      const group = jobs[cursor++];
      let processed = 0;
      try {
        const partials = [];
        for (const file of group) partials.push(await partialHash(file.filePath, signal));
        const partialCounts = partials.reduce((map, hash) => map.set(hash, (map.get(hash) || 0) + 1), new Map());
        const hashes = [];
        for (let index = 0; index < group.length; index += 1) {
          // Lecture complète uniquement si l’empreinte rapide est partagée.
          hashes.push(partialCounts.get(partials[index]) > 1 ? `full:${await hashFile(group[index].filePath, signal)}` : `partial:${partials[index]}`);
          processed += 1;
          completed += 1;
          onProgress(completed, total);
        }
        const clusters = new Map();
        group.forEach((file, index) => {
          const cluster = clusters.get(hashes[index]) || [];
          cluster.push(file);
          clusters.set(hashes[index], cluster);
        });
        for (const cluster of clusters.values()) {
          const primary = cluster[0];
          primary.duplicateOf = null;
          if (primary.duplicateAutoExcluded) {
            primary.include = true;
            distinctFiles += 1;
          }
          primary.duplicateAutoExcluded = false;
          for (const file of cluster.slice(1)) {
            file.duplicateOf = primary.id;
            file.duplicateVerification = 'identical';
          }
          if (cluster.length > 1) identicalGroups += 1;
        }
      } catch (_) {
        throwIfAborted(signal);
        for (const file of group.slice(1)) file.duplicateVerification = 'unreadable';
        unreadableGroups += 1;
        completed += group.length - processed;
        onProgress(completed, total);
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, worker));
  } catch (error) {
    if (signal?.aborted) originalFiles.forEach((file, index) => { files[index] = file; });
    throw error;
  }
  return { identicalGroups, distinctFiles, unreadableGroups };
}

module.exports = {
  throwIfAborted, readSidecar, metadataValue, cameraModel, cameraMake, frameRate, parseFFprobe, parseSpotlight,
  probeWithFFprobe, probeWithSpotlight, scanDirectory, enrichFile, partialHash, hashFile, verifyDuplicateContents
};
