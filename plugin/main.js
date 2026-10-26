const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const WorkflowIntegration = require('./WorkflowIntegration.node');
const { checkForUpdate, RELEASE_PAGE_PREFIX } = require('./lib/updates');
const { buildTextReport, buildCsvReport } = require('./lib/report');
const { throwIfAborted, scanDirectory, enrichFile, verifyDuplicateContents: compareDuplicateContents } = require('./lib/scan');
const { addWatchFolders, isProcessRunning } = require('./proxy-settings');
const { t, setLocale } = require('./lib/t');
const { cloneCard, CHECKSUMS } = require('./lib/clone');
const { cleanText, markDuplicates } = require('./lib/media');
const { PROFILES } = require('./lib/cst');
const { createProjectInResolve, safeBinName } = require('./lib/create-project');

const execFileAsync = promisify(execFile);
const PLUGIN_ID = 'com.idolatry.resolveprojectcreationtool';
const BIN_NAMES = ['Rushs', 'Son', 'Assets', 'Éléments', 'Séquences', 'Musiques', 'Exports'];
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


function runOperation(event, operationId, task) {
  if (typeof operationId !== 'string' || !operationId) throw new Error(t('Identifiant d’opération invalide.'));
  if (operations.has(operationId)) throw new Error(t('Cette opération est déjà en cours.'));
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

const AUDIO_SYNC_CONSTANTS = [
  'AUDIO_SYNC_MODE', 'AUDIO_SYNC_CHANNEL_NUMBER', 'AUDIO_SYNC_RETAIN_EMBEDDED_AUDIO', 'AUDIO_SYNC_RETAIN_VIDEO_METADATA',
  'AUDIO_SYNC_WAVEFORM', 'AUDIO_SYNC_TIMECODE', 'AUDIO_SYNC_CHANNEL_AUTOMATIC',
  ...Object.values(CHECKSUMS),
  'MULTICAM_ANGLE_SYNC_TIMECODE', 'MULTICAM_ANGLE_SYNC_AUDIO', 'MULTICAM_ANGLE_NAME_FILE', 'MULTICAM_DETECT_NONE'
];

// Constantes resolve.AUDIO_SYNC_* pour MediaPool.AutoSyncAudio ; absentes sur les versions qui ne les exposent pas.
async function readResolveConstants() {
  const constants = {};
  for (const name of AUDIO_SYNC_CONSTANTS) {
    try {
      const value = await resolveObj?.[name];
      if (value !== undefined && value !== null && typeof value !== 'function') constants[name] = value;
    } catch (_) {}
  }
  return constants;
}

async function connectResolve() {
  integrationReady = false;
  integrationError = '';
  try {
    const initialized = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!initialized) throw new Error(t('Resolve refuse la connexion au plugin.'));
    resolveObj = await WorkflowIntegration.GetResolve();
    if (!resolveObj) throw new Error(t('Resolve API ne répond pas.'));
    projectManager = await resolveObj.GetProjectManager();
    if (!projectManager) throw new Error(t('Gestionnaire de projets Resolve introuvable.'));
    integrationReady = true;
  } catch (error) {
    integrationError = error.message || t('Connexion à Resolve impossible.');
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






// Liste des sous-dossiers « proxy » déjà lus pendant l’analyse (un seul readdir par dossier).
const proxyCache = new Map();
const scanDeps = { findFFprobe, execFileAsync, proxyCache };


function bestSourceRoot(filePath, roots) {
  return roots
    .filter((root) => {
      const relative = path.relative(root.realPath || root.sourcePath || root, filePath);
      return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
    })
    .sort((a, b) => (b.realPath || b.sourcePath || b).length - (a.realPath || a.sourcePath || a).length)[0]?.sourcePath || '';
}

async function scanSources(event, paths, previousScanId, activePaths, previousFiles, forceRefresh, signal) {
  proxyCache.clear();
  const roots = [...new Set((activePaths || paths || []).map((item) => path.resolve(item)))];
  const rootRecords = await Promise.all(roots.map(async (sourcePath) => ({
    sourcePath,
    realPath: await fs.realpath(sourcePath).catch(() => sourcePath)
  })));
  const previous = previousScanId ? scanSnapshots.get(previousScanId) : null;
  if (!roots.length) throw new Error(t('Choisis au moins un dossier source.'));
  if (previousScanId && !previous) throw new Error(t('Analyse expirée. Reprends la sélection des dossiers.'));
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
  if (!uniqueFiles.length && !previousScanId) throw new Error(t('Aucun média reconnu dans les dossiers choisis.'));

  const newFiles = uniqueFiles.filter((file) => !file.id);
  const results = uniqueFiles.filter((file) => file.id);
  const enriched = new Array(newFiles.length);
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < newFiles.length) {
      throwIfAborted(signal);
      const index = cursor++;
      enriched[index] = await enrichFile(newFiles[index], signal, scanDeps);
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
        sendProgress(event, { stage: 'scan', current: completed, total: newFiles.length, label: forceRefresh ? t('Actualisation des médias') : t('Analyse des nouveaux médias') });
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


function verifyDuplicateContents(event, options, signal) {
  const files = scanSnapshots.get(options?.scanId);
  if (!files) throw new Error(t('Analyse expirée. Reprends la sélection des dossiers.'));
  return compareDuplicateContents({
    files,
    selections: options?.files,
    signal,
    onProgress: (current, total) => sendProgress(event, { stage: 'duplicate-check', current, total, label: t('Comparaison du contenu') })
  });
}

function normalizeProjectName(value) {
  const name = cleanText(value).trim();
  if (!name) throw new Error(t('Saisis un nom de projet.'));
  if (name.length > 100) throw new Error(t('Le nom du projet doit contenir 100 caractères maximum.'));
  if (/[\\/:\u0000-\u001f]/.test(name)) throw new Error(t('Le nom ne peut pas contenir « / », « \\ » ni « : ».'));
  return name;
}

function defaultBinConfig() {
  return BIN_NAMES.map((name) => ({ id: name, name: t(name) }));
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
    throw new Error(t('La structure préférée ne peut pas être lue.'));
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
    throw new Error(t('La structure préférée n’a pas pu être enregistrée.'));
  }
}

async function resetBinPreferences() {
  try { await fs.unlink(binPreferencesPath()); } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(t('La structure préférée n’a pas pu être réinitialisée.'));
  }
  return { folders: defaultBinConfig(), customized: false };
}

function normalizeBinConfig(input) {
  const folders = Array.isArray(input) ? input : defaultBinConfig();
  if (folders.length > 60) throw new Error(t('Un projet ne peut pas contenir plus de 60 chutiers.'));
  const ids = new Set();
  const names = new Set();
  return folders.map((folder) => {
    const id = cleanText(folder?.id).trim();
    const custom = /^custom-[0-9a-f-]{36}$/i.test(id);
    if (!BIN_NAMES.includes(id) && !custom) throw new Error(t('Identifiant de chutier invalide.'));
    if (ids.has(id)) throw new Error(t('Deux chutiers ont le même identifiant.'));
    ids.add(id);
    const name = cleanText(folder?.name).replace(/\s+/g, ' ').trim();
    if (!name || name.length > 80 || /[\\/:\u0000-\u001f]/.test(name)) throw new Error(t('Chaque chutier doit avoir un nom valide de 80 caractères maximum.'));
    const normalizedName = name.toLocaleLowerCase('fr');
    if (names.has(normalizedName)) throw new Error(t('Deux chutiers ne peuvent pas porter le nom « {name} ».', { name }));
    names.add(normalizedName);
    return { id, name };
  });
}

async function createProject(event, options) {
  if (!integrationReady || !projectManager) throw new Error(integrationError || t('Connexion à Resolve indisponible.'));
  if (creationInProgress) throw new Error(t('Création déjà en cours.'));
  const name = normalizeProjectName(options?.projectName);
  const snapshot = scanSnapshots.get(options?.scanId);
  if (!snapshot) throw new Error(t('Analyse expirée. Reprends la sélection des dossiers.'));
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
      cameraBrand: safeBinName(edit.cameraBrand, t('À identifier')),
      cameraModel: safeBinName(edit.cameraModel, t('À identifier')),
      shootingDate: /^\d{4}-\d{2}-\d{2}$/.test(edit.shootingDate || '') ? edit.shootingDate : original.shootingDate || t('Date inconnue'),
      colorProfile: typeof edit.colorProfile === 'string' && (edit.colorProfile === 'none' || edit.colorProfile === '' || PROFILES[edit.colorProfile]) ? edit.colorProfile : original.colorProfile || ''
    };
  }).filter((file) => file.include);
  if (!selected.length) throw new Error(t('Aucun média à importer.'));
  if (selected.some((file) => !folderIds.has(file.category))) throw new Error(t('Un média retenu est associé à un chutier supprimé. Reclasse-le avant de créer le projet.'));

  creationInProgress = true;
  try {
    const result = await createProjectInResolve({
      projectManager,
      name,
      folders,
      selected,
      totalCount: snapshot.length,
      options,
      progress: (stage, current, total, label) => sendProgress(event, { stage, current, total, label }),
      presetDir: path.join(__dirname, 'presets'),
      resolveConstants: (options.syncAudio || options.createMulticam) ? await readResolveConstants() : {}
    });
    scanSnapshots.delete(options.scanId);
    return result;
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
  ipcMain.handle('tool:list-settings-presets', async () => {
    if (!integrationReady || !projectManager) return [];
    try {
      const current = await projectManager.GetCurrentProject();
      const presets = (await current?.GetProjectSettingsPresetList()) || [];
      return presets.map((preset) => cleanText(preset?.Name)).filter(Boolean);
    } catch (_) { return []; }
  });
  ipcMain.handle('tool:export-report', async (_event, result) => {
    if (!result || typeof result !== 'object' || typeof result.projectName !== 'string') throw new Error(t('Rapport indisponible.'));
    const safeName = safeBinName(result.projectName, t('Projet'));
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: t('Exporter le rapport'),
      defaultPath: path.join(app.getPath('documents'), `${t('Rapport RPM — {name}', { name: safeName })}.txt`),
      filters: [{ name: t('Texte'), extensions: ['txt'] }, { name: 'CSV (Excel)', extensions: ['csv'] }]
    });
    if (choice.canceled || !choice.filePath) return null;
    const csv = path.extname(choice.filePath).toLowerCase() === '.csv';
    await fs.writeFile(choice.filePath, csv ? buildCsvReport(result) : buildTextReport(result), 'utf8');
    return choice.filePath;
  });
  ipcMain.handle('tool:check-update', () => checkForUpdate(require('./package.json').version));
  ipcMain.handle('tool:open-release', async (_event, url) => {
    if (typeof url === 'string' && url.startsWith(RELEASE_PAGE_PREFIX)) await shell.openExternal(url);
  });
  ipcMain.on('tool:locale', (event) => { event.returnValue = app.getLocale(); });
  ipcMain.handle('tool:set-locale', (_event, locale) => { setLocale(locale); return true; });
  ipcMain.handle('tool:choose-clone-folders', async (_event, withBackup) => {
    const source = await dialog.showOpenDialog(mainWindow, { title: t('Choisir la carte à copier'), buttonLabel: t('Choisir la carte'), properties: ['openDirectory'] });
    if (source.canceled || !source.filePaths.length) return null;
    const targets = [];
    for (let index = 0; index < (withBackup ? 2 : 1); index += 1) {
      const target = await dialog.showOpenDialog(mainWindow, {
        title: index === 0 ? t('Choisir le dossier de destination') : t('Choisir le dossier de la seconde copie'),
        buttonLabel: t('Copier ici'),
        properties: ['openDirectory', 'createDirectory']
      });
      if (target.canceled || !target.filePaths.length) return null;
      targets.push(target.filePaths[0]);
    }
    return { source: source.filePaths[0], targets };
  });
  ipcMain.handle('tool:clone-card', (event, operationId, options) => runOperation(event, operationId, async (signal) => {
    if (!integrationReady || !resolveObj) throw new Error(integrationError || t('Connexion à Resolve indisponible.'));
    const mediaStorage = await resolveObj.GetMediaStorage();
    if (!mediaStorage) throw new Error(t('Resolve n’expose pas le stockage de médias.'));
    const result = await cloneCard({
      mediaStorage,
      source: options?.source,
      targets: options?.targets,
      checksum: options?.checksum,
      constants: await readResolveConstants(),
      signal,
      onProgress: (percent) => sendProgress(event, { stage: 'clone', current: Math.round(percent), total: 100, label: t('Copie de la carte vérifiée') })
    });
    return result;
  }));
  ipcMain.handle('tool:reconnect', connectResolve);
  ipcMain.handle('tool:choose-sources', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('Choisir les dossiers de médias'),
      buttonLabel: t('Analyser les dossiers'),
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
        throw new Error(t('Ferme Blackmagic Proxy Generator puis réessaie. Il doit être fermé pour actualiser sa liste de dossiers surveillés.'));
      }
      const settingsPath = path.join(app.getPath('home'), 'Library', 'Preferences', 'Blackmagic Design', 'Blackmagic Proxy Generator', 'ProxyGeneratorSettings.plist');
      const added = await addWatchFolders(settingsPath, sourcePaths);
      await execFileAsync('/usr/bin/open', ['-a', PROXY_GENERATOR_APP]);
      return { added };
    } catch (error) {
      throw new Error(error.message || t('Impossible d’ajouter les dossiers ou d’ouvrir Blackmagic Proxy Generator.'));
    }
  });
  ipcMain.handle('tool:finish', async () => {
    if (integrationReady && resolveObj) {
      try { await resolveObj.OpenPage('edit'); } catch (error) { console.warn('Ouverture de la page Edit impossible :', error?.message || error); }
    }
    mainWindow?.close();
    return true;
  });
  ipcMain.handle('tool:close', () => mainWindow?.close());
  ipcMain.handle('tool:uninstall', async () => {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: [t('Désinstaller'), t('Annuler')],
      defaultId: 1,
      cancelId: 1,
      message: t('Désinstaller RPM - Resolve Project Manager ?'),
      detail: t('Le plugin sera retiré de Resolve. Tes projets, tes médias et tes proxies ne sont pas touchés. macOS va te demander ton mot de passe.')
    });
    if (choice.response !== 0) return { ok: false, cancelled: true };
    const pluginDir = path.resolve(__dirname);
    // Garde-fou : on ne supprime que le dossier du plugin, dans le dossier des intégrations Resolve.
    if (path.basename(pluginDir) !== PLUGIN_ID || !pluginDir.includes('/Workflow Integration Plugins/')) {
      throw new Error(t('Emplacement du plugin inattendu : désinstallation annulée.'));
    }
    // Le chemin est passé en argument à osascript (jamais concaténé au script) et quoté par « quoted form of ».
    const script = [
      'on run argv',
      'do shell script "rm -rf " & quoted form of (item 1 of argv) with administrator privileges',
      'end run'
    ];
    try {
      await execFileAsync('/usr/bin/osascript', [...script.flatMap((line) => ['-e', line]), pluginDir]);
    } catch (error) {
      if (/-128|annul|cancel/i.test(String(error.stderr || error.message))) return { ok: false, cancelled: true };
      throw new Error(t('La désinstallation a échoué. Réessaie, ou supprime le dossier du plugin à la main.'));
    }
    await dialog.showMessageBox(mainWindow, { type: 'info', buttons: ['OK'], message: t('Plugin désinstallé'), detail: t('Redémarre DaVinci Resolve pour qu’il disparaisse du menu Workflow Integrations.') });
    setTimeout(() => mainWindow?.close(), 100);
    return { ok: true };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 960,
    minWidth: 1050,
    minHeight: 720,
    title: 'RPM - Resolve Project Manager',
    backgroundColor: '#1b1b1b',
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
      mainWindow.webContents.send('tool:progress', { stage: 'error', label: t('Attends la fin de la création avant de fermer.') });
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  setLocale(app.getLocale());
  registerHandlers();
  await connectResolve();
  createWindow();
});

app.on('before-quit', () => {
  if (integrationReady) WorkflowIntegration.CleanUp();
});

app.on('window-all-closed', () => app.quit());
