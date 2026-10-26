const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');

const { t } = require('./lib/t');

const execFileAsync = promisify(execFile);

async function isProcessRunning(executable) {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,command=']);
  return stdout.split('\n').some((line) => {
    const processInfo = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!processInfo || Number(processInfo[1]) === process.pid) return false;
    return processInfo[2] === executable || processInfo[2].startsWith(`${executable} `);
  });
}

async function addWatchFolders(settingsPath, sourcePaths) {
  if (!Array.isArray(sourcePaths) || !sourcePaths.length || sourcePaths.some((source) => typeof source !== 'string')) {
    throw new Error(t('Aucun dossier source valide à ajouter.'));
  }
  const folders = [];
  for (const source of sourcePaths) {
    const folder = await fs.realpath(path.resolve(source));
    if (!(await fs.stat(folder)).isDirectory()) throw new Error(t('Ce chemin n’est pas un dossier : {folder}', { folder }));
    if (!folders.includes(folder)) folders.push(folder);
  }

  const settingsDirectory = path.dirname(settingsPath);
  await fs.mkdir(settingsDirectory, { recursive: true });
  let settings = {};
  let mode = 0o600;
  try {
    const current = await fs.stat(settingsPath);
    mode = current.mode & 0o777;
    const { stdout } = await execFileAsync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', settingsPath]);
    settings = JSON.parse(stdout);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(t('Impossible de lire les préférences de Blackmagic Proxy Generator.'));
  }

  const watchFolders = settings.watchFolderList ?? [];
  if (!Array.isArray(watchFolders) || watchFolders.some((folder) => typeof folder !== 'string')) {
    throw new Error(t('La liste des dossiers surveillés de Blackmagic Proxy Generator est invalide.'));
  }
  const existing = new Set(watchFolders.map((folder) => path.resolve(folder)));
  const added = folders.filter((folder) => !existing.has(folder));
  if (!added.length) return 0;

  settings.watchFolderList = [...watchFolders, ...added];
  const temporaryJson = path.join(settingsDirectory, `.rpc-${process.pid}-${Date.now()}.json`);
  const temporaryPlist = path.join(settingsDirectory, `.rpc-${process.pid}-${Date.now()}.plist`);
  try {
    await fs.writeFile(temporaryJson, JSON.stringify(settings), { mode: 0o600 });
    await execFileAsync('/usr/bin/plutil', ['-convert', 'binary1', '-o', temporaryPlist, temporaryJson]);
    await fs.chmod(temporaryPlist, mode);
    await fs.rename(temporaryPlist, settingsPath);
  } finally {
    await fs.rm(temporaryJson, { force: true }).catch(() => {});
    await fs.rm(temporaryPlist, { force: true }).catch(() => {});
  }
  return added.length;
}

module.exports = { addWatchFolders, isProcessRunning };
