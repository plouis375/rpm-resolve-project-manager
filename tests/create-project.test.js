'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createProjectInResolve } = require('../plugin/lib/create-project');

const PRESET_DIR = path.join(__dirname, '..', 'plugin', 'presets');
const FOLDERS = [{ id: 'Rushs', name: 'Rushs' }, { id: 'Exports', name: 'Exports' }];

// Faux Resolve : chutiers, imports, timelines et CST, avec compteurs pour les assertions.
function fakeResolve(overrides = {}) {
  const state = { saves: 0, timelines: [], imported: [], grades: [], existing: overrides.existing || [] };
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
      return paths.map((p) => ({ path: p, GetClipProperty: async () => p }));
    }),
    ImportTimelineFromFile: async () => ({}),
    CreateTimelineFromClips: async (name, clips) => {
      const timeline = makeTimeline(name, clips.map((clip) => ({ path: clip.path })));
      state.timelines.push({ name, count: clips.length, timeline });
      return timeline;
    }
  };
  const project = {
    GetMediaPool: async () => mediaPool,
    SetSetting: async () => true,
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
