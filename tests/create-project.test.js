'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createProjectInResolve, cameraColor } = require('../plugin/lib/create-project');

const PRESET_DIR = path.join(__dirname, '..', 'plugin', 'presets');
const FOLDERS = [{ id: 'Rushs', name: 'Rushs' }, { id: 'Exports', name: 'Exports' }];

// Faux Resolve : chutiers, imports, timelines et CST, avec compteurs pour les assertions.
function fakeResolve(overrides = {}) {
  const state = { saves: 0, timelines: [], imported: [], grades: [], syncs: [], multicams: [], colors: [], metadata: [], settings: [], inputSpaces: [], presets: [], calls: [], proxies: [], existing: overrides.existing || [] };
  const makeFolder = (name) => {
    const children = [];
    return { name, children, GetName: async () => name, GetSubFolderList: async () => children };
  };
  const root = makeFolder('root');
  const makeTimeline = (name, clips) => {
    const graph = { ApplyGradeFromDRX: overrides.applyGrade || (async (preset) => { state.grades.push(preset); return true; }) };
    return {
      GetName: async () => name,
      GetItemListInTrack: async () => clips.map((clip) => ({
        GetMediaPoolItem: async () => ({ GetClipProperty: async () => clip.path }),
        GetNodeGraph: async () => graph
      })),
      ApplyGradeFromDRX: async () => false
    };
  };
  const mediaPool = {
    GetRootFolder: async () => root,
    AddSubFolder: async (parent, name) => {
      const folder = makeFolder(name);
      parent.children.push(folder);
      return folder;
    },
    SetCurrentFolder: async (folder) => { state.current = folder; return true; },
    ImportMedia: overrides.importMedia || (async (paths) => {
      state.imported.push({ folder: state.current.name, paths });
      return paths.map((p) => ({ path: p, GetClipProperty: async () => p, LinkProxyMedia: async (proxy) => { const ok = overrides.linkProxy ? overrides.linkProxy(p) : true; if (ok) state.proxies.push({ path: p, proxy }); return ok; }, SetClipProperty: async (key, value) => { const ok = overrides.setClipProperty ? overrides.setClipProperty(p) : true; if (ok) state.inputSpaces.push({ path: p, key, value }); return ok; }, SetMetadata: async (data) => { const [key] = Object.keys(data); const ok = overrides.setMetadata ? overrides.setMetadata(key) : true; if (ok) state.metadata.push({ path: p, ...data }); return ok; }, SetClipColor: async (color) => { state.colors.push({ path: p, color }); return overrides.setClipColor ? overrides.setClipColor(color) : true; } }));
    }),
    ImportTimelineFromFile: async () => ({}),
    AutoSyncAudio: overrides.autoSyncAudio || (async (items, settings) => { state.syncs.push({ paths: items.map((i) => i.path), settings }); return true; }),
    CreateMulticamClip: overrides.createMulticam || (async (clips, options) => { state.multicams.push({ paths: clips.map((c) => c.path), options }); return [{}]; }),
    CreateTimelineFromClips: async (name, clips) => {
      const timeline = makeTimeline(name, clips.map((clip) => ({ path: clip.path })));
      state.timelines.push({ name, count: clips.length, paths: clips.map((clip) => clip.path), timeline });
      return timeline;
    }
  };
  const project = {
    GetMediaPool: async () => mediaPool,
    SetProjectSettingsPreset: async (name) => { state.calls.push('preset'); state.presets.push(name); return overrides.setPreset ? overrides.setPreset(name) : true; },
    SetSetting: async (key, value) => { state.calls.push('setting'); const ok = overrides.setSetting ? overrides.setSetting(key) : true; if (ok) state.settings.push([key, value]); return ok; },
    GetSetting: async (key) => ({ timelineFrameRate: '24', timelineResolutionWidth: '1920', timelineResolutionHeight: '1080' })[key],
    SetCurrentTimeline: async () => {},
    GetTimelineCount: async () => state.timelines.length,
    GetTimelineByIndex: async (i) => state.timelines[i - 1].timeline
  };
  const projectManager = {
    GetProjectListInCurrentFolder: async () => state.existing,
    GetCurrentProject: async () => null,
    SaveProject: async () => { state.saves += 1; return true; },
    CreateProject: overrides.createProject || (async () => project)
  };
  return { projectManager, state, root };
}

const file = (name, extra = {}) => ({
  id: name,
  name,
  filePath: `/src/${name}`,
  extension: '.mov',
  category: 'Rushs',
  cameraBrand: 'Sony',
  cameraModel: 'FX3',
  shootingDate: '2026-09-12',
  colorProfile: 'sony-slog3',
  include: true,
  ...extra
});

const baseOptions = { createTimeline: true, applyCst: true, cstOutput: 'rec709a', timelineResolution: 'auto', timelineFrameRate: 24 };

function run(fake, selected, options = baseOptions, extra = {}) {
  return createProjectInResolve({
    projectManager: fake.projectManager,
    name: 'Projet test',
    folders: FOLDERS,
    selected,
    totalCount: selected.length,
    options,
    presetDir: PRESET_DIR,
    logger: { warn: () => {} },
    ...extra
  });
}

test('crée l’arborescence marque / modèle / date et importe chaque rush dans son chutier', async () => {
  const fake = fakeResolve();
  const selected = [file('A001.mov'), file('A002.mov', { cameraModel: 'FX6', shootingDate: '2026-09-13' })];
  const result = await run(fake, selected, { ...baseOptions, createTimeline: false, applyCst: false });
  assert.equal(result.ok, true);
  assert.equal(result.importedCount, 2);
  assert.deepEqual(result.failedNames, []);
  const sony = fake.root.children.find((f) => f.name === 'Rushs');
  assert.ok(sony, 'chutier Rushs créé');
  const brand = sony.children[0];
  assert.equal(brand.name, 'Sony');
  assert.deepEqual(brand.children.map((f) => f.name), ['FX3', 'FX6']);
  assert.deepEqual(fake.state.imported.map((i) => i.folder), ['2026-09-12', '2026-09-13']);
  assert.ok(fake.state.saves >= 2, 'projet sauvegardé après imports et à la fin');
});

test('refuse un nom de projet déjà utilisé', async () => {
  const fake = fakeResolve({ existing: ['Projet test'] });
  await assert.rejects(run(fake, [file('A001.mov')]), /existe déjà/);
});

test('crée la timeline d’assemblage et applique le CST par profil', async () => {
  const fake = fakeResolve();
  const result = await run(fake, [file('A001.mov'), file('B001.mov', { colorProfile: 'none' }), file('C001.mov', { colorProfile: null, cameraBrand: 'Inconnu', cameraModel: '' })]);
  assert.equal(result.timelineName, 'Projet test — Assemblage');
  assert.equal(result.timelineFormat, '1920 × 1080 · 24 i/s');
  assert.equal(result.colorReport.applied, 1);
  assert.equal(result.colorReport.skipped, 1);
  assert.deepEqual(result.colorReport.unrecognized, ['C001.mov']);
  assert.equal(fake.state.grades.length, 1);
  assert.match(fake.state.grades[0], /sony-slog3_rec709a\.drx$/);
  assert.match(result.warning, /sans CST : caméra non reconnue/);
});

test('un import sans réponse de Resolve est signalé « à vérifier », sans bloquer', async () => {
  const fake = fakeResolve({ importMedia: () => new Promise(() => {}) });
  const started = Date.now();
  const result = await run(fake, [file('A001.mov'), file('A002.mov')], { ...baseOptions, createTimeline: false, applyCst: false }, { timeouts: { importMs: 30 } });
  assert.ok(Date.now() - started < 5000, 'la création ne reste pas figée');
  assert.match(result.warning, /2 média\(s\) à vérifier/);
});

test('un clip non reconnu après import est listé comme non importé', async () => {
  const fake = fakeResolve({
    importMedia: async (paths) => paths.slice(1).map((p) => ({ GetClipProperty: async () => p }))
  });
  const result = await run(fake, [file('A001.mov'), file('A002.mov')], { ...baseOptions, createTimeline: false, applyCst: false });
  assert.deepEqual(result.failedNames, ['A001.mov']);
  assert.equal(result.importedCount, 1);
  assert.match(result.warning, /1 média\(s\) n’ont pas été importés/);
});

test('une erreur après la création du projet indique qu’il est partiellement créé', async () => {
  const fake = fakeResolve();
  const mediaPool = await (await fake.projectManager.CreateProject()).GetMediaPool();
  mediaPool.SetCurrentFolder = async () => { throw new Error('Resolve a planté'); };
  await assert.rejects(run(fake, [file('A001.mov')]), (error) => {
    assert.match(error.message, /Resolve a planté/);
    assert.match(error.message, /partiellement créé/);
    return true;
  });
});

const wav = (name, extra = {}) => file(name, { extension: '.wav', category: 'Musiques', cameraBrand: '', cameraModel: '', colorProfile: '', ...extra });
const FOLDERS_WITH_AUDIO = [...FOLDERS, { id: 'Musiques', name: 'Musiques' }];

test('timeline d’assemblage dans l’ordre du timecode, toutes caméras confondues', async () => {
  const fake = fakeResolve();
  const selected = [
    file('A001.mov', { timecode: '15:00:00:00' }),
    file('A002.mov', { cameraModel: 'FX6', timecode: '09:30:00:00' }),
    file('A003.mov', { timecode: '11:00:00:00' })
  ];
  await run(fake, selected, { ...baseOptions, applyCst: false, timelineOrder: 'timecode' });
  assert.deepEqual(fake.state.timelines[0].paths, ['/src/A002.mov', '/src/A003.mov', '/src/A001.mov']);
});

test('synchronise le son direct jour par jour avec les constantes de Resolve', async () => {
  const fake = fakeResolve();
  const selected = [
    file('A001.mov'), file('A002.mov', { shootingDate: '2026-09-13' }),
    wav('SON_J1.wav'), wav('SON_J2.wav', { shootingDate: '2026-09-13' }), wav('SON_J3.wav', { shootingDate: '2026-09-14' }),
    wav('musique.mp3', { extension: '.mp3' })
  ];
  const constants = { AUDIO_SYNC_MODE: 'syncMode', AUDIO_SYNC_TIMECODE: 1, AUDIO_SYNC_RETAIN_EMBEDDED_AUDIO: 'retainEmbeddedAudio', AUDIO_SYNC_RETAIN_VIDEO_METADATA: 'retainVideoMetadata' };
  const result = await run(fake, selected, { ...baseOptions, applyCst: false, syncAudio: true, syncMode: 'timecode' }, { folders: FOLDERS_WITH_AUDIO, resolveConstants: constants });
  assert.deepEqual(fake.state.syncs.map((s) => s.paths), [['/src/A001.mov', '/src/SON_J1.wav'], ['/src/A002.mov', '/src/SON_J2.wav']]);
  assert.deepEqual(fake.state.syncs[0].settings, { syncMode: 1, retainEmbeddedAudio: true, retainVideoMetadata: true });
  assert.equal(result.syncReport.unmatchedAudio, 1);
  assert.deepEqual(result.syncReport.days.map((d) => d.ok), [true, true]);
  assert.equal(result.syncReport.mode, 'Timecode');
});

test('une synchro refusée par Resolve est signalée sans bloquer la création', async () => {
  const fake = fakeResolve({ autoSyncAudio: async () => false });
  const result = await run(fake, [file('A001.mov'), wav('SON.wav')], { ...baseOptions, applyCst: false, syncAudio: true }, { folders: FOLDERS_WITH_AUDIO });
  assert.equal(result.ok, true);
  assert.equal(result.timelineName, 'Projet test — Assemblage');
  assert.match(result.warning, /pas confirmé la synchro du son pour 2026-09-12/);
});

test('forme d’onde indisponible sans constante Resolve', async () => {
  const fake = fakeResolve();
  const result = await run(fake, [file('A001.mov'), wav('SON.wav')], { ...baseOptions, createTimeline: false, applyCst: false, syncAudio: true, syncMode: 'waveform' }, { folders: FOLDERS_WITH_AUDIO });
  assert.equal(fake.state.syncs.length, 0);
  assert.equal(result.syncReport.unavailable, true);
  assert.match(result.warning, /forme d’onde/);
});

const MULTICAM_CONSTANTS = { MULTICAM_ANGLE_SYNC_TIMECODE: 2, MULTICAM_ANGLE_SYNC_AUDIO: 3, MULTICAM_ANGLE_NAME_FILE: 4, MULTICAM_DETECT_NONE: 5 };

test('crée un clip multicam par jour avec au moins deux rushs', async () => {
  const fake = fakeResolve();
  const selected = [file('A001.mov'), file('B001.mov', { cameraModel: 'FX6' }), file('A002.mov', { shootingDate: '2026-09-13' })];
  const result = await run(fake, selected, { ...baseOptions, createTimeline: false, applyCst: false, createMulticam: true, syncMode: 'timecode' }, { resolveConstants: MULTICAM_CONSTANTS });
  assert.deepEqual(fake.state.multicams.map((m) => m.paths), [['/src/A001.mov', '/src/B001.mov']]);
  assert.deepEqual(fake.state.multicams[0].options, { name: '2026-09-12 — Multicam', createBinForSourceClips: false, angleSyncMode: 2, angleNameMode: 4, detectSameCameraClipsMode: 5 });
  assert.deepEqual(result.multicamReport.days, [{ day: '2026-09-12', ok: true, angles: 2 }]);
  assert.deepEqual(result.multicamReport.skipped, ['2026-09-13']);
});

test('multicam calé sur le son en mode forme d’onde', async () => {
  const fake = fakeResolve();
  await run(fake, [file('A001.mov'), file('B001.mov')], { ...baseOptions, createTimeline: false, applyCst: false, createMulticam: true, syncMode: 'waveform' }, { resolveConstants: MULTICAM_CONSTANTS });
  assert.equal(fake.state.multicams[0].options.angleSyncMode, 3);
});

test('un multicam refusé par Resolve est signalé sans bloquer la création', async () => {
  const fake = fakeResolve({ createMulticam: async () => [] });
  const result = await run(fake, [file('A001.mov'), file('B001.mov')], { ...baseOptions, applyCst: false, createMulticam: true });
  assert.equal(result.ok, true);
  assert.equal(result.timelineName, 'Projet test — Assemblage');
  assert.match(result.warning, /pas créé le clip multicam pour 2026-09-12/);
});

test('colore chaque rush selon sa caméra, de façon stable', async () => {
  assert.equal(cameraColor({ cameraBrand: 'Sony', cameraModel: 'FX3' }), cameraColor({ cameraBrand: ' sony', cameraModel: 'fx3 ' }));
  const fake = fakeResolve();
  const selected = [file('A001.mov'), file('A002.mov'), file('B001.mov', { cameraModel: 'FX6' }), file('X.mov', { cameraBrand: '', cameraModel: '' })];
  const result = await run(fake, selected, { ...baseOptions, createTimeline: false, applyCst: false, colorClips: true });
  assert.deepEqual(fake.state.colors.map((c) => c.path), ['/src/A001.mov', '/src/A002.mov', '/src/B001.mov']);
  assert.equal(fake.state.colors[0].color, fake.state.colors[1].color);
  assert.equal(result.clipColorReport.applied, 3);
  assert.deepEqual(result.clipColorReport.cameras.map((c) => c.camera), ['Sony FX3', 'Sony FX6']);
});

test('une couleur refusée par Resolve est signalée sans bloquer la création', async () => {
  const fake = fakeResolve({ setClipColor: () => false });
  const result = await run(fake, [file('A001.mov')], { ...baseOptions, applyCst: false, colorClips: true });
  assert.equal(result.ok, true);
  assert.match(result.warning, /couleur de clip à 1 plan/);
});

test('écrit les métadonnées standard de chaque rush', async () => {
  const fake = fakeResolve();
  const selected = [file('A001.mov'), file('B001.mov', { cameraModel: 'FX6', shootingDate: '2026-09-13' })];
  const result = await run(fake, selected, { ...baseOptions, createTimeline: false, applyCst: false, writeMetadata: true });
  const of = (path) => Object.assign({}, ...fake.state.metadata.filter((m) => m.path === path).map(({ path: _, ...rest }) => rest));
  assert.deepEqual(of('/src/A001.mov'), { 'Camera Type': 'Sony FX3', 'Camera #': '1', 'Date Recorded': '2026-09-12', Description: '/src' });
  assert.equal(of('/src/B001.mov')['Camera #'], '2');
  assert.equal(result.metadataReport.clips, 2);
  assert.equal(result.warning, '');
});

test('les métadonnées refusées par Resolve sont signalées', async () => {
  const fake = fakeResolve({ setMetadata: (key) => key !== 'Camera #' });
  const result = await run(fake, [file('A001.mov')], { ...baseOptions, applyCst: false, writeMetadata: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.metadataReport.refused, { 'Camera #': 1 });
  assert.match(result.warning, /« Camera # » \(1 plan/);
});

test('gestion couleur : mode du projet puis espace d’entrée de chaque clip, sans timeline ni CST', async () => {
  const fake = fakeResolve();
  const selected = [file('A001.mov'), file('B001.mov', { cameraBrand: 'Canon', cameraModel: 'C70', colorProfile: 'canon-clog2' }), file('C001.mov', { colorProfile: 'none' }), file('D001.mov', { colorProfile: '' })];
  const result = await run(fake, selected, { ...baseOptions, createTimeline: false, applyCst: true, colorMethod: 'managed', cstOutput: 'gamma24' });
  assert.deepEqual(fake.state.settings, [['colorScienceMode', 'davinciYRGBColorManagedv2'], ['colorSpaceTimeline', 'DaVinci WG/Intermediate'], ['colorSpaceOutput', 'Rec.709 Gamma 2.4']]);
  assert.deepEqual(fake.state.inputSpaces, [
    { path: '/src/A001.mov', key: 'Input Color Space', value: 'S-Gamut3.Cine/S-Log3' },
    { path: '/src/B001.mov', key: 'Input Color Space', value: 'Cinema Gamut/Canon Log 2' }
  ]);
  assert.equal(fake.state.grades.length, 0);
  assert.equal(result.colorReport.method, 'managed');
  assert.deepEqual([result.colorReport.applied, result.colorReport.skipped, result.colorReport.unrecognized], [2, 1, ['D001.mov']]);
});

test('gestion couleur : clips et réglages refusés signalés dans le rapport', async () => {
  const fake = fakeResolve({ setClipProperty: (p) => p !== '/src/A002.mov', setSetting: (key) => key !== 'colorSpaceOutput' });
  const result = await run(fake, [file('A001.mov'), file('A002.mov')], { ...baseOptions, createTimeline: false, colorMethod: 'managed' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.colorReport.failed, ['A002.mov']);
  assert.match(result.warning, /réglages de gestion couleur : colorSpaceOutput/);
  assert.match(result.warning, /l’espace d’entrée sur 1 plan\(s\) \(A002\.mov\)/);
});

test('la méthode CST reste le défaut et n’écrit pas de réglage couleur', async () => {
  const fake = fakeResolve();
  await run(fake, [file('A001.mov')], { ...baseOptions });
  assert.equal(fake.state.inputSpaces.length, 0);
  assert.equal(fake.state.grades.length, 1);
});

test('applique le preset de réglages avant les réglages de timeline', async () => {
  const fake = fakeResolve();
  await run(fake, [file('A001.mov')], { ...baseOptions, applyCst: false, settingsPreset: 'Mon preset' });
  assert.deepEqual(fake.state.presets, ['Mon preset']);
  assert.equal(fake.state.calls[0], 'preset');
  assert.ok(fake.state.calls.includes('setting'));
});

test('un preset refusé par Resolve est signalé sans bloquer la création', async () => {
  const fake = fakeResolve({ setPreset: () => false });
  const result = await run(fake, [file('A001.mov')], { ...baseOptions, applyCst: false, settingsPreset: 'Absent' });
  assert.equal(result.ok, true);
  assert.match(result.warning, /preset de réglages « Absent »/);
});

test('sans preset choisi, aucun preset n’est appliqué', async () => {
  const fake = fakeResolve();
  await run(fake, [file('A001.mov')], { ...baseOptions, applyCst: false, settingsPreset: '' });
  assert.equal(fake.state.presets.length, 0);
});

test('lie les proxies existants et compte ceux que Resolve refuse', async () => {
  const fake = fakeResolve({ linkProxy: (p) => p !== '/src/A002.mov' });
  const selected = [file('A001.mov', { proxyPath: '/src/proxy/A001.mov' }), file('A002.mov', { proxyPath: '/src/proxy/A002.mov' }), file('A003.mov')];
  const result = await run(fake, selected, { ...baseOptions, createTimeline: false, applyCst: false });
  assert.deepEqual(fake.state.proxies, [{ path: '/src/A001.mov', proxy: '/src/proxy/A001.mov' }]);
  assert.deepEqual(result.proxyReport, { linked: 1, failed: ['A002.mov'] });
  assert.match(result.warning, /pas lié le proxy de 1 plan/);
});

test('sans proxy existant, aucun rapport de proxies', async () => {
  const result = await run(fakeResolve(), [file('A001.mov')], { ...baseOptions, createTimeline: false, applyCst: false });
  assert.equal(result.proxyReport, null);
});

test('le résultat liste le statut de chaque fichier et les avertissements Resolve pour le rapport', async () => {
  const fake = fakeResolve({ setClipColor: () => { throw new Error('boom'); } });
  const result = await run(fake, [file('A001.mov')], { ...baseOptions, createTimeline: false, applyCst: false, colorClips: true }, { logger: console.warn && { warn: () => {} } });
  assert.deepEqual(result.files, [{ name: 'A001.mov', path: '/src/A001.mov', status: 'imported' }]);
  assert.ok(result.resolveWarnings.some((message) => /SetClipColor/.test(message) && /boom/.test(message)));
});
