const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const WorkflowIntegration = require('./WorkflowIntegration.node');
const { addWatchFolders, isProcessRunning } = require('./proxy-settings');
const {
  VIDEO, SEQUENCE, SUPPORTED, FRAME_RATES, cleanText, categoryFor, normalizeBrand, normalizeDate, localDate,
  sidecarCandidates, filterSidecars, parseSidecarXml, markDuplicates, dominantFormat, nearestFrameRate, matchImported
} = require('./lib/media');
const { OUTPUTS, profileForCamera, presetFileName } = require('./lib/cst');

const execFileAsync = promisify(execFile);
const PLUGIN_ID = 'com.idolatry.resolveprojectcreationtool';
const BIN_NAMES = ['Rushs', 'Assets', 'Éléments', 'Séquences', 'Musiques', 'Exports'];
const PROBE_PATHS = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe'];
const PROXY_GENERATOR_APP = '/Applications/Blackmagic Proxy Generator.app';
const PROXY_GENERATOR_EXECUTABLE = `${PROXY_GENERATOR_APP}/Contents/MacOS/Blackmagic Proxy Generator`;

let mainWindow;
let resolveObj;
let projectManager;
let integrationReady = false;
let integrationError = '';
let creationInProgress = false;
let ffprobePath;
const scanSnapshots = new Map();
const operations = new Map();

function sendProgress(event, payload) {
  if (!event.sender.isDestroyed()) event.sender.send('tool:progress', payload);
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('Opération interrompue.');
    error.name = 'AbortError';
    throw error;
  }
}

function runOperation(event, operationId, task) {
  if (typeof operationId !== 'string' || !operationId) throw new Error('Identifiant d’opération invalide.');
  if (operations.has(operationId)) throw new Error('Cette opération est déjà en cours.');
  const controller = new AbortController();
  const onDestroyed = () => controller.abort();
  operations.set(operationId, controller);
  event.sender.once('destroyed', onDestroyed);
  return Promise.resolve().then(() => task(controller.signal)).catch((error) => {
    if (error?.name === 'AbortError') return { cancelled: true };
    throw error;
  }).finally(() => {
    event.sender.removeListener('destroyed', onDestroyed);
    operations.delete(operationId);
  });
}

async function connectResolve() {
  integrationReady = false;
  integrationError = '';
  try {
    const initialized = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!initialized) throw new Error('Resolve refuse la connexion au plugin.');
    resolveObj = await WorkflowIntegration.GetResolve();
    if (!resolveObj) throw new Error('Resolve API ne répond pas.');
    projectManager = await resolveObj.GetProjectManager();
    if (!projectManager) throw new Error('Gestionnaire de projets Resolve introuvable.');
    integrationReady = true;
  } catch (error) {
    integrationError = error.message || 'Connexion à Resolve impossible.';
    resolveObj = null;
    projectManager = null;
  }
  return integrationReady;
}

async function findFFprobe() {
  if (ffprobePath !== undefined) return ffprobePath;
  for (const candidate of [path.join(__dirname, 'ffprobe'), ...PROBE_PATHS, ...((process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, 'ffprobe')))]) {
    try {
      await fs.access(candidate);
      ffprobePath = candidate;
      return ffprobePath;
    } catch (_) {}
  }
  ffprobePath = null;
  return null;
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

async function probeWithFFprobe(filePath, signal) {
  const probe = await findFFprobe();
  if (!probe) return null;
  try {
    const { stdout } = await execFileAsync(probe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath], {
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
      signal
    });
    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const tags = Object.assign({}, data.format?.tags || {}, ...streams.map((stream) => stream.tags || {}));
    const duration = Number(data.format?.duration || streams.find((item) => item.duration)?.duration);
    return {
      cameraMake: cameraMake(tags),
      cameraModel: cameraModel(tags),
      date: normalizeDate(metadataValue(tags, ['creation_time', 'com.apple.quicktime.creationdate', 'date_recorded', 'date'])),
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      format: frameRate(streams),
      verified: streams.length > 0
    };
  } catch (_) {
    throwIfAborted(signal);
    return { verified: false };
  }
}

async function probeWithSpotlight(filePath, signal) {
  const names = ['kMDItemAcquisitionMake', 'kMDItemAcquisitionModel', 'kMDItemContentCreationDate', 'kMDItemDurationSeconds', 'kMDItemPixelWidth', 'kMDItemPixelHeight'];
  try {
    const { stdout } = await execFileAsync('/usr/bin/mdls', [...names.flatMap((name) => ['-name', name]), filePath], { timeout: 8000, maxBuffer: 64 * 1024, signal });
    const values = Object.fromEntries(stdout.split('\n').map((line) => {
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
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      format: width && height ? { width, height, fps: null } : null,
      verified: Boolean(width || height || duration || values.kMDItemContentCreationDate)
    };
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

async function enrichFile(file, signal) {
  throwIfAborted(signal);
  const stat = await fs.stat(file.filePath);
  const [probe, fallback] = await Promise.all([
    probeWithFFprobe(file.filePath, signal),
    findFFprobe().then((probePath) => probePath ? null : probeWithSpotlight(file.filePath, signal))
  ]);
  throwIfAborted(signal);
  const metadata = { ...(probe || fallback || { verified: false }) };
  if (VIDEO.has(file.extension) && (!metadata.cameraMake || !metadata.cameraModel || !metadata.date)) {
    const sidecar = await readSidecar(file.filePath);
    if (sidecar) {
      metadata.cameraMake ||= sidecar.cameraMake;
      metadata.cameraModel ||= sidecar.cameraModel;
      metadata.date ||= sidecar.date;
    }
  }
  throwIfAborted(signal);
  const rawMake = metadata.cameraMake || '';
  const rawModel = metadata.cameraModel || '';
  const shootingDate = metadata.date || localDate(stat.birthtime);
  const isVideo = VIDEO.has(file.extension);
  const missingVideoMetadata = isVideo && (!rawMake || !rawModel);
  return {
    id: crypto.randomUUID(),
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
    shootingDate: isVideo ? shootingDate : '',
    dateSource: isVideo ? (metadata.date ? 'metadata' : 'creation') : '',
    verified: metadata.verified,
    needsReview: stat.size === 0 || !metadata.verified || missingVideoMetadata,
    duplicateOf: null,
    include: true
  };
}

function bestSourceRoot(filePath, roots) {
  return roots
    .filter((root) => {
      const relative = path.relative(root.realPath || root.sourcePath || root, filePath);
      return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
    })
    .sort((a, b) => (b.realPath || b.sourcePath || b).length - (a.realPath || a.sourcePath || a).length)[0]?.sourcePath || '';
}

async function scanSources(event, paths, previousScanId, activePaths, previousFiles, forceRefresh, signal) {
  const roots = [...new Set((activePaths || paths || []).map((item) => path.resolve(item)))];
  const rootRecords = await Promise.all(roots.map(async (sourcePath) => ({
    sourcePath,
    realPath: await fs.realpath(sourcePath).catch(() => sourcePath)
  })));
  const previous = previousScanId ? scanSnapshots.get(previousScanId) : null;
  if (!roots.length) throw new Error('Choisis au moins un dossier source.');
  if (previousScanId && !previous) throw new Error('Analyse expirée. Reprends la sélection des dossiers.');
  const edits = new Map((Array.isArray(previousFiles) ? previousFiles : []).map((file) => [file.id, file]));
  const allFiles = [];
  const retained = (forceRefresh ? [] : previous || []).filter((file) => bestSourceRoot(file.filePath, rootRecords));
  const previousByPath = new Map((previous || []).map((file) => [path.resolve(file.filePath), file]));
  for (const file of retained) {
    const sourceFolder = bestSourceRoot(file.filePath, rootRecords);
    const edit = edits.get(file.id);
    const include = edit?.includeManuallyChanged ? edit.include !== false : file.duplicateAutoExcluded && !file.duplicateManuallyChanged ? true : file.include;
    allFiles.push({ ...file, sourceFolder, duplicateOf: null, duplicateVerification: undefined, duplicateAutoExcluded: false, include, includeManuallyChanged: Boolean(edit?.includeManuallyChanged), duplicateManuallyChanged: Boolean(edit?.duplicateManuallyChanged) });
  }
  const scanRoots = [...new Set((paths || []).map((item) => path.resolve(item)))];
  for (let index = 0; index < scanRoots.length; index += 1) {
    throwIfAborted(signal);
    const files = await scanDirectory(scanRoots[index], signal);
    allFiles.push(...files.map((file) => ({ ...file, sourceFolder: bestSourceRoot(file.filePath, rootRecords) || scanRoots[index] })));
  }
  throwIfAborted(signal);
  const seenPaths = new Set();
  const uniqueFiles = allFiles.filter((file) => {
    const key = path.resolve(file.filePath);
    if (seenPaths.has(key)) return false;
    seenPaths.add(key);
    return true;
  });
  if (!uniqueFiles.length && !previousScanId) throw new Error('Aucun média reconnu dans les dossiers choisis.');

  const newFiles = uniqueFiles.filter((file) => !file.id);
  const results = uniqueFiles.filter((file) => file.id);
  const enriched = new Array(newFiles.length);
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < newFiles.length) {
      throwIfAborted(signal);
      const index = cursor++;
      enriched[index] = await enrichFile(newFiles[index], signal);
      const old = previousByPath.get(path.resolve(newFiles[index].filePath));
      if (old) {
        const edit = edits.get(old.id);
        enriched[index].id = old.id;
        enriched[index].include = edit?.includeManuallyChanged ? edit.include !== false : old.duplicateAutoExcluded && !old.duplicateManuallyChanged ? true : old.include;
        enriched[index].includeManuallyChanged = Boolean(edit?.includeManuallyChanged);
        enriched[index].duplicateManuallyChanged = Boolean(edit?.duplicateManuallyChanged);
      }
      completed += 1;
      if (completed % 5 === 0 || completed === newFiles.length) {
        sendProgress(event, { stage: 'scan', current: completed, total: newFiles.length, label: forceRefresh ? 'Actualisation des médias' : 'Analyse des nouveaux médias' });
      }
    }
  }
  if (newFiles.length) await Promise.all(Array.from({ length: Math.min(4, newFiles.length) }, worker));
  throwIfAborted(signal);
  results.push(...enriched);
  markDuplicates(results);
  scanSnapshots.clear();
  const scanId = crypto.randomUUID();
  scanSnapshots.set(scanId, results);
  return {
    scanId,
    files: results,
    roots: roots.map((folder) => ({ path: folder, name: path.basename(folder) || folder })),
    ffprobeAvailable: Boolean(await findFFprobe())
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

async function verifyDuplicateContents(event, options, signal) {
  const scanId = options?.scanId;
  const files = scanSnapshots.get(scanId);
  if (!files) throw new Error('Analyse expirée. Reprends la sélection des dossiers.');
  const selections = new Map((options?.files || []).map((file) => [file.id, file]));
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
          sendProgress(event, { stage: 'duplicate-check', current: completed, total, label: 'Comparaison du contenu' });
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
        sendProgress(event, { stage: 'duplicate-check', current: completed, total, label: 'Comparaison du contenu' });
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

function normalizeProjectName(value) {
  const name = cleanText(value).trim();
  if (!name) throw new Error('Saisis un nom de projet.');
  if (name.length > 100) throw new Error('Le nom du projet doit contenir 100 caractères maximum.');
  if (/[\\/:\u0000-\u001f]/.test(name)) throw new Error('Le nom ne peut pas contenir « / », « \\ » ni « : ».');
  return name;
}

function safeBinName(value, fallback) {
  const name = cleanText(value).replace(/[\\/:\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (name || fallback).slice(0, 80);
}

function defaultBinConfig() {
  return BIN_NAMES.map((name) => ({ id: name, name }));
}

function binPreferencesPath() {
  return path.join(app.getPath('userData'), 'resolve-project-creation-tool-preferences.json');
}

async function loadBinPreferences() {
  try {
    const saved = JSON.parse(await fs.readFile(binPreferencesPath(), 'utf8'));
    return { folders: normalizeBinConfig(saved.folders), customized: true };
  } catch (error) {
    if (error.code === 'ENOENT') return { folders: defaultBinConfig(), customized: false };
    throw new Error('La structure préférée ne peut pas être lue.');
  }
}

async function saveBinPreferences(input) {
  const folders = normalizeBinConfig(input);
  const filePath = binPreferencesPath();
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify({ folders }), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
    return { folders, customized: true };
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    throw new Error('La structure préférée n’a pas pu être enregistrée.');
  }
}

async function resetBinPreferences() {
  try { await fs.unlink(binPreferencesPath()); } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('La structure préférée n’a pas pu être réinitialisée.');
  }
  return { folders: defaultBinConfig(), customized: false };
}

function normalizeBinConfig(input) {
  const folders = Array.isArray(input) ? input : BIN_NAMES.map((name) => ({ id: name, name }));
  if (folders.length > 60) throw new Error('Un projet ne peut pas contenir plus de 60 chutiers.');
  const ids = new Set();
  const names = new Set();
  return folders.map((folder) => {
    const id = cleanText(folder?.id).trim();
    const custom = /^custom-[0-9a-f-]{36}$/i.test(id);
    if (!BIN_NAMES.includes(id) && !custom) throw new Error('Identifiant de chutier invalide.');
    if (ids.has(id)) throw new Error('Deux chutiers ont le même identifiant.');
    ids.add(id);
    const name = cleanText(folder?.name).replace(/\s+/g, ' ').trim();
    if (!name || name.length > 80 || /[\\/:\u0000-\u001f]/.test(name)) throw new Error('Chaque chutier doit avoir un nom valide de 80 caractères maximum.');
    const normalizedName = name.toLocaleLowerCase('fr');
    if (names.has(normalizedName)) throw new Error(`Deux chutiers ne peuvent pas porter le nom « ${name} ».`);
    names.add(normalizedName);
    return { id, name };
  });
}

async function findOrCreateFolder(mediaPool, parent, name) {
  const children = await parent.GetSubFolderList();
  for (const folder of children || []) {
    if (await folder.GetName() === name) return folder;
  }
  const folder = await mediaPool.AddSubFolder(parent, name);
  if (!folder) throw new Error(`Impossible de créer le chutier « ${name} ».`);
  return folder;
}

const TIMELINE_RESOLUTIONS = new Set(['1280x720', '1920x1080', '2048x1080', '3840x2160', '4096x2160', '1080x1920', '1080x1080']);

function frameRateSetting(fps) {
  return Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/0+$/, '');
}

async function applyTimelineSettings(project, rushes, options) {
  const dominant = dominantFormat(rushes);
  const requestedResolution = TIMELINE_RESOLUTIONS.has(options.timelineResolution) ? options.timelineResolution : 'auto';
  const requestedFps = FRAME_RATES.includes(Number(options.timelineFrameRate)) ? Number(options.timelineFrameRate) : null;
  const [width, height] = requestedResolution === 'auto' ? [dominant.width, dominant.height] : requestedResolution.split('x').map(Number);
  const fps = requestedFps || nearestFrameRate(dominant.fps) || 24;
  // L’API Resolve expose SetSetting(nom, valeur), un réglage à la fois.
  const wanted = [
    ['timelineFrameRate', frameRateSetting(fps)],
    ['timelineResolutionWidth', String(width)],
    ['timelineResolutionHeight', String(height)]
  ];
  let allApplied = true;
  for (const [key, value] of wanted) {
    try { if (!(await project.SetSetting(key, value))) allApplied = false; } catch (_) { allApplied = false; }
  }
  let reported = { width, height, fps };
  try {
    reported = {
      width: Number(await project.GetSetting('timelineResolutionWidth')) || width,
      height: Number(await project.GetSetting('timelineResolutionHeight')) || height,
      fps: Number(await project.GetSetting('timelineFrameRate')) || fps
    };
  } catch (_) {}
  return {
    label: `${reported.width} × ${reported.height} · ${String(reported.fps).replace('.', ',')} i/s`,
    warning: allApplied ? '' : 'Resolve n’a pas confirmé tous les réglages de timeline. Vérifie le format dans Resolve.'
  };
}

// Applique un node Color Space Transform (preset .drx) à chaque plan de la timeline.
async function applyColorTransforms(project, timeline, importedRushes, output) {
  const report = { applied: 0, unrecognized: [], failed: [] };
  const outputKey = OUTPUTS[output] ? output : 'rec709a';
  try { await project.SetCurrentTimeline(timeline); } catch (_) {}
  let items = [];
  try { items = (await timeline.GetItemListInTrack('video', 1)) || []; } catch (_) {}
  // Associe chaque plan à son rush par chemin de fichier ; repli sur l’ordre.
  const byPath = new Map(importedRushes.map(({ file }) => [file.filePath, file]));
  const pairs = [];
  for (let index = 0; index < items.length; index += 1) {
    let file = null;
    try {
      const mediaItem = await items[index].GetMediaPoolItem();
      file = byPath.get(await mediaItem?.GetClipProperty('File Path')) || null;
    } catch (_) {}
    if (!file && items.length === importedRushes.length) file = importedRushes[index].file;
    pairs.push({ item: items[index], file });
  }
  const groups = new Map();
  for (const { item, file } of pairs) {
    const profile = file ? profileForCamera(file.cameraBrand, file.cameraModel) : null;
    if (!profile) { report.unrecognized.push(file?.name || 'Plan sans rush associé'); continue; }
    if (!groups.has(profile)) groups.set(profile, []);
    groups.get(profile).push({ item, file });
  }
  for (const [profile, entries] of groups) {
    const presetPath = path.join(__dirname, 'presets', presetFileName(profile, outputKey));
    try { await fs.access(presetPath); } catch (_) {
      report.failed.push(...entries.map(({ file }) => file.name));
      continue;
    }
    const pending = [];
    for (const entry of entries) {
      let ok = false;
      try {
        const graph = await entry.item.GetNodeGraph();
        if (graph) ok = Boolean(await graph.ApplyGradeFromDRX(presetPath, 0));
      } catch (_) {}
      if (ok) report.applied += 1; else pending.push(entry);
    }
    // Repli pour les versions de Resolve sans graph.ApplyGradeFromDRX.
    if (pending.length) {
      let ok = false;
      try { ok = Boolean(await timeline.ApplyGradeFromDRX(presetPath, 0, pending.map(({ item }) => item))); } catch (_) {}
      if (ok) report.applied += pending.length;
      else report.failed.push(...pending.map(({ file }) => file.name));
    }
  }
  return report;
}

async function createProject(event, options) {
  if (!integrationReady || !projectManager) throw new Error(integrationError || 'Connexion à Resolve indisponible.');
  if (creationInProgress) throw new Error('Création déjà en cours.');
  const name = normalizeProjectName(options?.projectName);
  const snapshot = scanSnapshots.get(options?.scanId);
  if (!snapshot) throw new Error('Analyse expirée. Reprends la sélection des dossiers.');
  const folders = normalizeBinConfig(options?.folders);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const edited = new Map((options.files || []).map((file) => [file.id, file]));
  const selected = snapshot.map((original) => {
    const edit = edited.get(original.id) || {};
    const category = folderIds.has(edit.category) ? edit.category : original.category;
    const include = edit.include !== false;
    return {
      ...original,
      category,
      include,
      cameraBrand: safeBinName(edit.cameraBrand, 'À identifier'),
      cameraModel: safeBinName(edit.cameraModel, 'À identifier'),
      shootingDate: /^\d{4}-\d{2}-\d{2}$/.test(edit.shootingDate || '') ? edit.shootingDate : original.shootingDate || 'Date inconnue'
    };
  }).filter((file) => file.include);
  if (!selected.length) throw new Error('Aucun média à importer.');
  if (selected.some((file) => !folderIds.has(file.category))) throw new Error('Un média retenu est associé à un chutier supprimé. Reclasse-le avant de créer le projet.');

  creationInProgress = true;
  let projectCreated = false;
  try {
    const projects = await projectManager.GetProjectListInCurrentFolder();
    if ((projects || []).includes(name)) throw new Error(`Un projet nommé « ${name} » existe déjà dans ce dossier Resolve.`);
    let currentProject = null;
    try { currentProject = await projectManager.GetCurrentProject(); } catch (_) {}
    let savedProject = '';
    if (currentProject) {
      savedProject = await currentProject.GetName();
      const saved = await projectManager.SaveProject();
      if (!saved) throw new Error(`Resolve n’a pas pu enregistrer le projet ouvert « ${savedProject} ».`);
    }

    sendProgress(event, { stage: 'project', current: 0, total: 1, label: 'Création du projet Resolve' });
    const project = await projectManager.CreateProject(name);
    if (!project) throw new Error(`Resolve n’a pas créé le projet « ${name} ». Vérifie la liste des projets.`);
    projectCreated = true;
    const mediaPool = await project.GetMediaPool();
    if (!mediaPool) throw new Error('Projet créé, mais chutier principal inaccessible.');
    const root = await mediaPool.GetRootFolder();
    if (!root) throw new Error('Projet créé, mais chutier principal inaccessible.');

    const bins = {};
    for (let index = 0; index < folders.length; index += 1) {
      const folder = folders[index];
      bins[folder.id] = await findOrCreateFolder(mediaPool, root, folder.name);
      sendProgress(event, { stage: 'bins', current: index + 1, total: folders.length, label: `Création du chutier ${folder.name}` });
    }

    // Le format de timeline doit être fixé AVANT l’import : Resolve verrouille la
    // fréquence d’images du projet dès que des clips ou une timeline existent.
    let timelineSettings = null;
    if (options.createTimeline) timelineSettings = await applyTimelineSettings(project, selected.filter((file) => file.category === 'Rushs'), options);

    const importable = selected.filter((file) => !SEQUENCE.has(file.extension));
    const sequenceFiles = selected.filter((file) => SEQUENCE.has(file.extension));
    const groupMap = new Map();
    for (const file of importable) {
      let destination = bins[file.category];
      let key = file.category;
      if (file.category === 'Rushs') {
        const brand = safeBinName(file.cameraBrand, 'À identifier');
        const model = safeBinName(file.cameraModel, 'À identifier');
        const date = /^\d{4}-\d{2}-\d{2}$/.test(file.shootingDate) ? file.shootingDate : 'Date inconnue';
        const brandBin = await findOrCreateFolder(mediaPool, bins.Rushs, brand);
        const modelBin = await findOrCreateFolder(mediaPool, brandBin, model);
        destination = await findOrCreateFolder(mediaPool, modelBin, date);
        key = `${brand}|${model}|${date}`;
      }
      if (!groupMap.has(key)) groupMap.set(key, { destination, files: [] });
      groupMap.get(key).files.push(file);
    }

    const importedRushes = [];
    const failures = [];
    const groups = [...groupMap.values()];
    const totalBatches = groups.reduce((total, group) => total + Math.ceil(group.files.length / 25), 0) + sequenceFiles.length;
    let completedBatches = 0;
    for (const group of groups) {
      const selectedFolder = await mediaPool.SetCurrentFolder(group.destination);
      if (!selectedFolder) throw new Error('Resolve n’a pas pu sélectionner un chutier.');
      for (let offset = 0; offset < group.files.length; offset += 25) {
        const batch = group.files.slice(offset, offset + 25);
        const result = await mediaPool.ImportMedia(batch.map((file) => file.filePath));
        const items = (Array.isArray(result) ? result : []).filter(Boolean);
        // Resolve ne renvoie que les clips importés : on associe par chemin, pas par position.
        const importedPaths = await Promise.all(items.map(async (item) => {
          try { return await item.GetClipProperty('File Path'); } catch (_) { return ''; }
        }));
        // Repli : si Resolve ne donne aucun chemin mais autant de clips que demandé, l'ordre fait foi.
        const pathsKnown = importedPaths.some(Boolean);
        const { matched, failed } = pathsKnown || items.length !== batch.length
          ? matchImported(batch, importedPaths)
          : { matched: batch.map((file, index) => ({ file, index })), failed: [] };
        failures.push(...failed.map((file) => file.name));
        for (const { file, index } of matched) {
          if (file.category === 'Rushs') importedRushes.push({ file, item: items[index] });
        }
        completedBatches += 1;
        sendProgress(event, { stage: 'import', current: completedBatches, total: Math.max(totalBatches, 1), label: 'Import des médias dans Resolve' });
      }
    }

    const sequenceFailures = [];
    if (sequenceFiles.length) {
      for (const file of sequenceFiles) {
        try {
          const selectedFolder = await mediaPool.SetCurrentFolder(bins[file.category]);
          if (!selectedFolder) throw new Error('Resolve n’a pas pu sélectionner le chutier de destination.');
          const timeline = await mediaPool.ImportTimelineFromFile(file.filePath);
          if (!timeline) sequenceFailures.push(file.name);
        } catch (_) {
          sequenceFailures.push(file.name);
        }
        completedBatches += 1;
        sendProgress(event, { stage: 'import', current: completedBatches, total: Math.max(totalBatches, 1), label: 'Import des séquences' });
      }
    }

    let timelineName = '';
    let timelineFormat = '';
    let timelineWarning = timelineSettings?.warning || '';
    let colorReport = null;
    if (options.createTimeline && importedRushes.length) {
      const selectedFolder = await mediaPool.SetCurrentFolder(bins.Séquences || root);
      if (!selectedFolder) throw new Error('Resolve n’a pas pu sélectionner le chutier Séquences.');
      timelineName = `${name} — Assemblage`;
      const timeline = await mediaPool.CreateTimelineFromClips(timelineName, importedRushes.map(({ item }) => item));
      if (!timeline) {
        timelineName = '';
        timelineWarning = 'Resolve n’a pas créé la timeline. Le projet et les médias sont conservés.';
      } else {
        timelineFormat = timelineSettings.label;
        if (options.applyCst) {
          sendProgress(event, { stage: 'grade', current: 0, total: 1, label: 'Application des Color Space Transform' });
          colorReport = await applyColorTransforms(project, timeline, importedRushes, options.cstOutput);
          colorReport.output = OUTPUTS[options.cstOutput] || OUTPUTS.rec709a;
          sendProgress(event, { stage: 'grade', current: 1, total: 1, label: 'Application des Color Space Transform' });
        }
      }
    } else if (options.createTimeline) {
      timelineWarning = 'Aucun rush vidéo retenu. La timeline d’assemblage n’a pas été créée.';
    }

    const saved = await projectManager.SaveProject();
    if (!saved) timelineWarning = [timelineWarning, 'Le projet a été créé, mais Resolve n’a pas confirmé son enregistrement.'].filter(Boolean).join(' ');
    scanSnapshots.delete(options.scanId);
    return {
      ok: true,
      projectName: name,
      importedCount: selected.length - failures.length - sequenceFailures.length,
      excludedCount: snapshot.length - selected.length,
      failedNames: [...failures, ...sequenceFailures],
      createdBins: folders.map((folder) => folder.name),
      timelineName,
      timelineFormat,
      colorReport,
      warning: [timelineWarning,
        colorReport?.unrecognized.length ? `${colorReport.unrecognized.length} plan(s) sans CST : caméra non reconnue.` : '',
        colorReport?.failed.length ? `Resolve n’a pas appliqué le CST sur ${colorReport.failed.length} plan(s).` : '', failures.length ? `${failures.length} média(s) n’ont pas été importés.` : '', sequenceFailures.length ? `${sequenceFailures.length} séquence(s) n’ont pas été importées.` : ''].filter(Boolean).join(' '),
      savedProject
    };
  } catch (error) {
    if (projectCreated && projectManager) {
      try { await projectManager.SaveProject(); } catch (_) {}
      throw new Error(`${error.message} Le projet « ${name} » peut être partiellement créé. Vérifie-le dans Resolve avant de relancer l’assistant.`);
    }
    throw error;
  } finally {
    creationInProgress = false;
  }
}

function registerHandlers() {
  ipcMain.handle('tool:load-bin-preferences', loadBinPreferences);
  ipcMain.handle('tool:save-bin-preferences', (_event, folders) => saveBinPreferences(folders));
  ipcMain.handle('tool:reset-bin-preferences', resetBinPreferences);
  ipcMain.handle('tool:status', async () => {
    let currentProject = '';
    if (integrationReady && projectManager) {
      try {
        const current = await projectManager.GetCurrentProject();
        if (current) currentProject = await current.GetName();
      } catch (_) {}
    }
    return { connected: integrationReady, error: integrationError, currentProject, ffprobeAvailable: Boolean(await findFFprobe()) };
  });
  ipcMain.handle('tool:reconnect', connectResolve);
  ipcMain.handle('tool:choose-sources', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisir les dossiers de médias',
      buttonLabel: 'Analyser les dossiers',
      properties: ['openDirectory', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('tool:scan-sources', (event, operationId, paths, previousScanId, activePaths, previousFiles, forceRefresh) => runOperation(event, operationId, (signal) => scanSources(event, paths, previousScanId, activePaths, previousFiles, forceRefresh, signal)));
  ipcMain.handle('tool:verify-duplicates', (event, operationId, options) => runOperation(event, operationId, (signal) => verifyDuplicateContents(event, options, signal)));
  ipcMain.handle('tool:cancel-operation', (_event, operationId) => {
    const controller = operations.get(operationId);
    if (!controller) return false;
    controller.abort();
    return true;
  });
  ipcMain.handle('tool:create-project', (event, options) => createProject(event, options));
  ipcMain.handle('tool:open-proxy-generator', async (_event, sourcePaths) => {
    try {
      await fs.access(PROXY_GENERATOR_APP);
      if (await isProcessRunning(PROXY_GENERATOR_EXECUTABLE)) {
        throw new Error('Ferme Blackmagic Proxy Generator puis réessaie. Il doit être fermé pour actualiser sa liste de dossiers surveillés.');
      }
      const settingsPath = path.join(app.getPath('home'), 'Library', 'Preferences', 'Blackmagic Design', 'Blackmagic Proxy Generator', 'ProxyGeneratorSettings.plist');
      const added = await addWatchFolders(settingsPath, sourcePaths);
      await execFileAsync('/usr/bin/open', ['-a', PROXY_GENERATOR_APP]);
      return { added };
    } catch (error) {
      throw new Error(error.message || 'Impossible d’ajouter les dossiers ou d’ouvrir Blackmagic Proxy Generator.');
    }
  });
  ipcMain.handle('tool:finish', async () => {
    if (integrationReady && resolveObj) {
      try { await resolveObj.OpenPage('edit'); } catch (_) {}
    }
    mainWindow?.close();
    return true;
  });
  ipcMain.handle('tool:close', () => mainWindow?.close());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 960,
    minWidth: 1050,
    minHeight: 720,
    title: 'RPM - Resolve Project Manager',
    backgroundColor: '#d6d0c6',
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (creationInProgress) {
      event.preventDefault();
      mainWindow.webContents.send('tool:progress', { stage: 'error', label: 'Attends la fin de la création avant de fermer.' });
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  registerHandlers();
  await connectResolve();
  createWindow();
});

app.on('before-quit', () => {
  if (integrationReady) WorkflowIntegration.CleanUp();
});

app.on('window-all-closed', () => app.quit());
