'use strict';
// Copie d'une carte mémoire avec vérification, par le Clone Tool de Resolve (MediaStorage.StartCloneMedia).
// Ne dépend ni d'Electron ni de Resolve : l'objet MediaStorage est injecté (tests/clone.test.js).
const path = require('node:path');
const { t } = require('./t');

const CHECKSUMS = { md5: 'CLONE_CHECKSUM_TYPE_MD5', sha256: 'CLONE_CHECKSUM_TYPE_SHA256', xxh64: 'CLONE_CHECKSUM_TYPE_XXH_64', size: 'CLONE_CHECKSUM_TYPE_FILESIZE' };

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// Refuse les cas dangereux avant tout appel Resolve : dossiers relatifs, identiques ou imbriqués.
function validateCloneFolders(source, targets) {
  if (typeof source !== 'string' || !path.isAbsolute(source)) throw new Error(t('Dossier source de la carte invalide.'));
  if (!Array.isArray(targets) || !targets.length || targets.some((target) => typeof target !== 'string' || !path.isAbsolute(target))) throw new Error(t('Dossier de destination invalide.'));
  const resolvedSource = path.resolve(source);
  const resolved = targets.map((target) => path.resolve(target));
  if (new Set(resolved).size !== resolved.length) throw new Error(t('Les dossiers de destination doivent être différents.'));
  for (const target of resolved) {
    if (isInside(target, resolvedSource) || isInside(resolvedSource, target)) throw new Error(t('La destination ne peut pas contenir la carte ni être dans la carte.'));
  }
  return { source: resolvedSource, targets: resolved };
}

// Lance la copie puis suit son avancement. Retourne les dossiers copiés (PreserveFolderName : destination/nom de la carte).
async function cloneCard({ mediaStorage, source, targets, checksum = 'md5', constants = {}, onProgress = () => {}, signal, pollMs = 500 }) {
  const folders = validateCloneFolders(source, targets);
  const checksumKey = CHECKSUMS[checksum] ? checksum : 'md5';
  const settings = { PreserveFolderName: true };
  if (constants[CHECKSUMS[checksumKey]] !== undefined) settings.ChecksumType = constants[CHECKSUMS[checksumKey]];
  if (!(await mediaStorage.SetCloneToolSettings(settings))) throw new Error(t('Resolve n’a pas accepté les réglages de copie.'));
  if (!(await mediaStorage.StartCloneMedia(folders.source, folders.targets))) throw new Error(t('Resolve n’a pas pu démarrer la copie de la carte.'));
  for (;;) {
    if (signal?.aborted) {
      try { await mediaStorage.StopCloneMedia(); } catch (_) {}
      const error = new Error(t('Opération interrompue.'));
      error.name = 'AbortError';
      throw error;
    }
    const status = (await mediaStorage.GetCloneStatus()) || {};
    onProgress(Math.max(0, Math.min(100, Number(status.CompletionPercentage) || 0)));
    if (status.JobStatus === 'Complete') break;
    if (status.JobStatus === 'Failed') throw new Error(t('La copie a échoué : {error}', { error: status.Error || t('erreur inconnue') }));
    if (status.JobStatus === 'Cancelled') throw new Error(t('La copie a été annulée dans Resolve.'));
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  onProgress(100);
  return { copiedPaths: folders.targets.map((target) => path.join(target, path.basename(folders.source))), checksum: checksumKey };
}

module.exports = { cloneCard, validateCloneFolders, CHECKSUMS };
