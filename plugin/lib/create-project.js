'use strict';
// Création du projet dans Resolve : chutiers, imports, timelines et CST.
// Ne dépend ni d’Electron ni du module Workflow Integration : tout passe par les objets injectés,
// ce qui permet de la tester avec un faux Resolve (tests/create-project.test.js).

const path = require('node:path');
const fs = require('node:fs/promises');
const { SEQUENCE, FRAME_RATES, cleanText, dominantFormat, nearestFrameRate, matchImported } = require('./media');
const { PROFILES, OUTPUTS, presetFileName } = require('./cst');

const DEFAULT_TIMEOUTS = { importMs: 120000, cstMs: 20000 };
const IMPORT_BATCH_SIZE = 25;
const TIMELINE_RESOLUTIONS = new Set(['1280x720', '1920x1080', '2048x1080', '3840x2160', '4096x2160', '1080x1920', '1080x1080']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function safeBinName(value, fallback) {
  const name = cleanText(value).replace(/[\\/:\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (name || fallback).slice(0, 80);
}

// Un appel Resolve bloqué ne doit pas bloquer la création : on rend la main après le délai.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Délai dépassé')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Journalise un échec Resolve non bloquant : le flux continue, mais la cause reste visible dans la console.
function warnResolve(step, error, logger = console) {
  logger.warn(`[RPM] ${step} :`, error?.message || error);
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

function frameRateSetting(fps) {
  return Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/0+$/, '');
}

async function applyTimelineSettings(project, rushes, options, logger) {
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
    try { if (!(await project.SetSetting(key, value))) allApplied = false; } catch (error) { warnResolve(`SetSetting ${key}`, error, logger); allApplied = false; }
  }
  let reported = { width, height, fps };
  try {
    reported = {
      width: Number(await project.GetSetting('timelineResolutionWidth')) || width,
      height: Number(await project.GetSetting('timelineResolutionHeight')) || height,
      fps: Number(await project.GetSetting('timelineFrameRate')) || fps
    };
  } catch (error) { warnResolve('GetSetting (timeline)', error, logger); }
  return {
    label: `${reported.width} × ${reported.height} · ${String(reported.fps).replace('.', ',')} i/s`,
    warning: allApplied ? '' : 'Resolve n’a pas confirmé tous les réglages de timeline. Vérifie le format dans Resolve.'
  };
}

// Applique un node Color Space Transform (preset .drx) à chaque plan de la timeline.
async function applyColorTransforms({ project, timeline, importedRushes, output, presetDir, logger, cstMs }) {
  const report = { applied: 0, skipped: 0, unrecognized: [], failed: [] };
  const outputKey = OUTPUTS[output] ? output : 'rec709a';
  try { await project.SetCurrentTimeline(timeline); } catch (error) { warnResolve('SetCurrentTimeline (CST)', error, logger); }
  let items = [];
  try { items = (await timeline.GetItemListInTrack('video', 1)) || []; } catch (error) { warnResolve('GetItemListInTrack (CST)', error, logger); }
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
    const profile = file?.colorProfile || null;
    if (profile === 'none') { report.skipped += 1; continue; }
    if (!PROFILES[profile]) { report.unrecognized.push(file?.name || 'Plan sans rush associé'); continue; }
    if (!groups.has(profile)) groups.set(profile, []);
    groups.get(profile).push({ item, file });
  }
  for (const [profile, entries] of groups) {
    const presetPath = path.join(presetDir, presetFileName(profile, outputKey));
    try { await fs.access(presetPath); } catch (_) {
      report.failed.push(...entries.map(({ file }) => file.name));
      continue;
    }
    const pending = [];
    for (const entry of entries) {
      let ok = false;
      try {
        const graph = await withTimeout(entry.item.GetNodeGraph(), cstMs);
        if (graph) ok = Boolean(await withTimeout(graph.ApplyGradeFromDRX(presetPath, 0), cstMs));
      } catch (error) { warnResolve('ApplyGradeFromDRX (plan)', error, logger); }
      if (ok) report.applied += 1; else pending.push(entry);
    }
    // Repli pour les versions de Resolve sans graph.ApplyGradeFromDRX.
    if (pending.length) {
      let ok = false;
      try { ok = Boolean(await withTimeout(timeline.ApplyGradeFromDRX(presetPath, 0, pending.map(({ item }) => item)), cstMs * pending.length)); } catch (error) { warnResolve('ApplyGradeFromDRX (repli timeline)', error, logger); }
      if (ok) report.applied += pending.length;
      else report.failed.push(...pending.map(({ file }) => file.name));
    }
  }
  return report;
}

// Groupe les fichiers retenus par chutier de destination (rushs : marque / modèle / date).
async function groupByDestination(mediaPool, bins, importable) {
  const groupMap = new Map();
  for (const file of importable) {
    let destination = bins[file.category];
    let key = file.category;
    if (file.category === 'Rushs') {
      const brand = safeBinName(file.cameraBrand, 'À identifier');
      const model = safeBinName(file.cameraModel, 'À identifier');
      const date = DATE_PATTERN.test(file.shootingDate) ? file.shootingDate : 'Date inconnue';
      const brandBin = await findOrCreateFolder(mediaPool, bins.Rushs, brand);
      const modelBin = await findOrCreateFolder(mediaPool, brandBin, model);
      destination = await findOrCreateFolder(mediaPool, modelBin, date);
      key = `${brand}|${model}|${date}`;
    }
    if (!groupMap.has(key)) groupMap.set(key, { destination, files: [] });
    groupMap.get(key).files.push(file);
  }
  return [...groupMap.values()];
}

// Importe par lots ; associe les clips par chemin, jamais par position seule.
async function importGroups({ mediaPool, groups, totalBatches, progress, logger, importMs }) {
  const importedRushes = [];
  const failures = [];
  // Lots pour lesquels Resolve ne dit ni quels clips sont importés ni où : on ne peut pas trancher.
  const unverified = [];
  let completedBatches = 0;
  for (const group of groups) {
    const selectedFolder = await mediaPool.SetCurrentFolder(group.destination);
    if (!selectedFolder) throw new Error('Resolve n’a pas pu sélectionner un chutier.');
    for (let offset = 0; offset < group.files.length; offset += IMPORT_BATCH_SIZE) {
      const batch = group.files.slice(offset, offset + IMPORT_BATCH_SIZE);
      let result = null;
      try {
        result = await withTimeout(mediaPool.ImportMedia(batch.map((file) => file.filePath)), importMs);
      } catch (error) {
        // Resolve ne répond plus : le lot est signalé « à vérifier » au lieu de bloquer la création.
        warnResolve('ImportMedia', error, logger);
      }
      if (result === null) {
        unverified.push(...batch.map((file) => file.name));
        completedBatches += 1;
        progress('import', completedBatches, Math.max(totalBatches, 1), 'Import des médias dans Resolve');
        continue;
      }
      const items = (Array.isArray(result) ? result : []).filter(Boolean);
      // Resolve ne renvoie que les clips importés : on associe par chemin, pas par position.
      const importedPaths = await Promise.all(items.map(async (item) => {
        try { return await item.GetClipProperty('File Path'); } catch (_) { return ''; }
      }));
      // Repli : si Resolve ne donne aucun chemin mais autant de clips que demandé, l'ordre fait foi.
      // Sans chemin et avec un nombre différent, rien ne permet d'associer : les fichiers restent à vérifier.
      const pathsKnown = importedPaths.some(Boolean);
      let matched;
      let failed = [];
      if (pathsKnown) {
        ({ matched, failed } = matchImported(batch, importedPaths));
      } else if (items.length === batch.length) {
        matched = batch.map((file, index) => ({ file, index }));
      } else {
        matched = [];
        unverified.push(...batch.map((file) => file.name));
      }
      failures.push(...failed.map((file) => file.name));
      for (const { file, index } of matched) {
        if (file.category === 'Rushs') importedRushes.push({ file, item: items[index] });
      }
      completedBatches += 1;
      progress('import', completedBatches, Math.max(totalBatches, 1), 'Import des médias dans Resolve');
    }
  }
  return { importedRushes, failures, unverified, completedBatches };
}

async function importSequences({ mediaPool, sequenceFiles, bins, startCount, totalBatches, progress }) {
  const sequenceFailures = [];
  let completedBatches = startCount;
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
    progress('import', completedBatches, Math.max(totalBatches, 1), 'Import des séquences');
  }
  return sequenceFailures;
}

// Crée la timeline d’assemblage principale puis, si demandé, une timeline par caméra et/ou par jour.
async function buildTimelines({ project, mediaPool, bins, root, name, importedRushes, options, timelineSettings, progress, presetDir, logger, checkpoint, cstMs }) {
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
      await checkpoint();
      if (options.applyCst) {
        progress('grade', 0, 1, 'Application des Color Space Transform');
        colorReport = await applyColorTransforms({ project, timeline, importedRushes, output: options.cstOutput, presetDir, logger, cstMs });
        colorReport.output = OUTPUTS[options.cstOutput] || OUTPUTS.rec709a;
        progress('grade', 1, 1, 'Application des Color Space Transform');
      }
    }
  } else if (options.createTimeline) {
    timelineWarning = 'Aucun rush vidéo retenu. La timeline d’assemblage n’a pas été créée.';
  }

  // Timelines supplémentaires : une par caméra et/ou une par jour de tournage.
  const extraTimelines = [];
  if (options.createTimeline && importedRushes.length && (options.timelinePerCamera || options.timelinePerDay)) {
    const groupings = [];
    if (options.timelinePerCamera) groupings.push((file) => `${safeBinName(file.cameraBrand, 'À identifier')} ${safeBinName(file.cameraModel, '')}`.trim());
    if (options.timelinePerDay) groupings.push((file) => DATE_PATTERN.test(file.shootingDate) ? file.shootingDate : 'Date inconnue');
    const plans = [];
    for (const keyOf of groupings) {
      const byKey = new Map();
      for (const entry of importedRushes) {
        const key = keyOf(entry.file);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(entry);
      }
      if (byKey.size > 1) for (const [key, entries] of [...byKey].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }))) plans.push({ key, entries });
    }
    let extraFailed = 0;
    let extraCstFailed = 0;
    for (let index = 0; index < plans.length; index += 1) {
      const { key, entries } = plans[index];
      progress('grade', index, plans.length, `Timeline ${key}`);
      try {
        await mediaPool.SetCurrentFolder(bins.Séquences || root);
        const extraName = `${name} — ${key}`;
        const extra = await mediaPool.CreateTimelineFromClips(extraName, entries.map(({ item }) => item));
        if (!extra) { extraFailed += 1; continue; }
        extraTimelines.push(extraName);
        if (options.applyCst) {
          const extraColor = await applyColorTransforms({ project, timeline: extra, importedRushes: entries, output: options.cstOutput, presetDir, logger, cstMs });
          extraCstFailed += extraColor.failed.length;
        }
      } catch (_) { extraFailed += 1; }
    }
    if (extraFailed) timelineWarning = [timelineWarning, `${extraFailed} timeline(s) par caméra ou par jour n’ont pas été créées.`].filter(Boolean).join(' ');
    if (extraCstFailed) timelineWarning = [timelineWarning, `Resolve n’a pas appliqué le CST sur ${extraCstFailed} plan(s) des timelines par caméra ou par jour.`].filter(Boolean).join(' ');
    // Revient sur l’assemblage principal.
    try {
      const count = await project.GetTimelineCount();
      for (let i = 1; i <= count; i += 1) {
        const candidate = await project.GetTimelineByIndex(i);
        if (candidate && await candidate.GetName() === timelineName) { await project.SetCurrentTimeline(candidate); break; }
      }
    } catch (error) { warnResolve('Retour sur la timeline principale', error, logger); }
  }
  return { timelineName, timelineFormat, timelineWarning, colorReport, extraTimelines };
}

// Crée le projet et renvoie le rapport. `selected` = fichiers retenus, `folders` = chutiers validés.
async function createProjectInResolve({ projectManager, name, folders, selected, totalCount, options, progress = () => {}, presetDir, logger = console, timeouts = {} }) {
  const { importMs, cstMs } = { ...DEFAULT_TIMEOUTS, ...timeouts };
  const checkpoint = async () => {
    try { await projectManager.SaveProject(); } catch (error) { warnResolve('SaveProject (checkpoint)', error, logger); }
  };
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

    progress('project', 0, 1, 'Création du projet Resolve');
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
      progress('bins', index + 1, folders.length, `Création du chutier ${folder.name}`);
    }

    // Le format de timeline doit être fixé AVANT l’import : Resolve verrouille la
    // fréquence d’images du projet dès que des clips ou une timeline existent.
    let timelineSettings = null;
    if (options.createTimeline) timelineSettings = await applyTimelineSettings(project, selected.filter((file) => file.category === 'Rushs'), options, logger);

    const importable = selected.filter((file) => !SEQUENCE.has(file.extension));
    const sequenceFiles = selected.filter((file) => SEQUENCE.has(file.extension));
    const groups = await groupByDestination(mediaPool, bins, importable);
    const totalBatches = groups.reduce((total, group) => total + Math.ceil(group.files.length / IMPORT_BATCH_SIZE), 0) + sequenceFiles.length;

    const imported = await importGroups({ mediaPool, groups, totalBatches, progress, logger, importMs });
    await checkpoint();
    const sequenceFailures = await importSequences({ mediaPool, sequenceFiles, bins, startCount: imported.completedBatches, totalBatches, progress });

    const timelines = await buildTimelines({ project, mediaPool, bins, root, name, importedRushes: imported.importedRushes, options, timelineSettings, progress, presetDir, logger, checkpoint, cstMs });
    const { timelineName, timelineFormat, colorReport, extraTimelines } = timelines;
    let timelineWarning = timelines.timelineWarning;

    const saved = await projectManager.SaveProject();
    if (!saved) timelineWarning = [timelineWarning, 'Le projet a été créé, mais Resolve n’a pas confirmé son enregistrement.'].filter(Boolean).join(' ');
    const { failures, unverified } = imported;
    return {
      ok: true,
      projectName: name,
      importedCount: selected.length - failures.length - sequenceFailures.length,
      excludedCount: totalCount - selected.length,
      failedNames: [...failures, ...sequenceFailures],
      createdBins: folders.map((folder) => folder.name),
      timelineName,
      timelineFormat,
      extraTimelines,
      colorReport,
      warning: [timelineWarning,
        colorReport?.unrecognized.length ? `${colorReport.unrecognized.length} plan(s) sans CST : caméra non reconnue.` : '',
        colorReport?.failed.length ? `Resolve n’a pas appliqué le CST sur ${colorReport.failed.length} plan(s).` : '',
        failures.length ? `${failures.length} média(s) n’ont pas été importés.` : '',
        unverified.length ? `${unverified.length} média(s) à vérifier : Resolve n’a pas confirmé leur import (${unverified.slice(0, 6).join(', ')}${unverified.length > 6 ? '…' : ''}).` : '',
        sequenceFailures.length ? `${sequenceFailures.length} séquence(s) n’ont pas été importées.` : ''].filter(Boolean).join(' '),
      savedProject
    };
  } catch (error) {
    if (projectCreated) {
      try { await projectManager.SaveProject(); } catch (_) {}
      throw new Error(`${error.message} Le projet « ${name} » peut être partiellement créé. Vérifie-le dans Resolve avant de relancer l’assistant.`);
    }
    throw error;
  }
}

module.exports = { createProjectInResolve, safeBinName, DEFAULT_TIMEOUTS };
