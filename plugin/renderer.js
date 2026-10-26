const DEFAULT_FOLDERS = ['Rushs', 'Son', 'Assets', 'Éléments', 'Séquences', 'Musiques', 'Exports'].map((name) => ({ id: name, name, core: true }));
const PAGE_SIZE = 160;
const state = {
  step: 1,
  connected: false,
  currentProject: '',
  sourcePaths: [],
  scanId: '',
  files: [],
  folders: DEFAULT_FOLDERS.map((folder) => ({ ...folder })),
  folderPreferencesLoaded: false,
  folderPreferenceBusy: false,
  preferredFoldersCustomized: false,
  binPreferenceStatus: '',
  cameraSuggestions: [],
  filter: '',
  reviewFilter: '',
  page: 0,
  scanning: false,
  refreshing: false,
  scanOperationId: '',
  creating: false,
  ffprobeAvailable: false,
  duplicateCheckBusy: false,
  duplicateOperationId: '',
  toastTimer: null
};

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function bytesLabel(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(1).replace('.', ',')} ${units[index]}`;
}

function durationLabel(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function categoryColor(category) {
  return category === 'Rushs' ? 'MOV' : category === 'Musiques' || category === 'Son' ? 'AUD' : category === 'Séquences' ? 'SEQ' : 'IMG';
}

function destinationText(file) {
  if (file.category !== 'Rushs') return folderName(file.category);
  return `${folderName('Rushs')} › ${file.cameraBrand || 'À identifier'} › ${file.cameraModel || 'À identifier'} › ${file.shootingDate || 'Date inconnue'}`;
}

function folderName(id) {
  return state.folders.find((folder) => folder.id === id)?.name || id;
}

function includedFiles() {
  return state.files.filter((file) => file.include);
}

function formatSummary() {
  const files = includedFiles();
  const size = files.reduce((total, file) => total + file.size, 0);
  $('mediaSummary').textContent = state.files.length
    ? `${files.length} média${files.length > 1 ? 's' : ''} retenu${files.length > 1 ? 's' : ''} · ${bytesLabel(size)} · ${state.files.length - files.length} ignoré${state.files.length - files.length > 1 ? 's' : ''}`
    : state.sourcePaths.length ? 'Aucun média détecté dans les dossiers sélectionnés' : 'Aucun dossier sélectionné';
  $('toOptions').disabled = !state.files.length || !files.length || !state.scanId || state.scanning || state.duplicateCheckBusy || !state.connected || !state.folderPreferencesLoaded;
}

function setStep(step) {
  if (step > 1 && (!state.connected || !state.folderPreferencesLoaded)) return;
  if ((state.scanning || state.duplicateCheckBusy) && step !== 2) return;
  if (step > 2 && !state.files.length) return;
  state.step = step;
  for (let index = 1; index <= 4; index += 1) {
    $(`view${index}`).hidden = index !== step;
    const stepButton = document.querySelector(`.step[data-step="${index}"]`);
    stepButton.classList.toggle('active', index === step);
    stepButton.classList.toggle('complete', index < step);
    if (index === step) stepButton.setAttribute('aria-current', 'step');
    else stepButton.removeAttribute('aria-current');
  }
  document.querySelectorAll('.step-line').forEach((line, index) => line.classList.toggle('done', index < step - 1));
  if (step === 3) prepareOptionsView();
  if (step === 2) renderSources();
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 5200);
}

function renderBins() {
  $('binPreview').innerHTML = state.folders.map(({ name }) => `<span class="bin-chip"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5h5l1.6 1.7h8.4v7.3H2.5z"/><path d="M2.5 5.5V4h5l1.6 1.7"/></svg>${escapeHTML(name)}</span>`).join('');
}

function cameraFolderName(value) {
  return String(value || '').replace(/[\\/:\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'À identifier';
}

function renderStructurePreview() {
  const tree = [$('projectName').value.trim() || 'Nouveau projet'];
  const files = includedFiles();
  const sortNames = (values) => [...values].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
  const addNode = (label, ancestors, last) => {
    const prefix = ancestors.map((isLast) => isLast ? '   ' : '│  ').join('');
    tree.push(`${prefix}${last ? '└── ' : '├── '}${label}`);
  };
  state.folders.forEach((folder, rootIndex) => {
    const lastRoot = rootIndex === state.folders.length - 1;
    const matching = files.filter((file) => file.category === folder.id);
    addNode(`${folder.name} (${matching.length || 'vide'})`, [], lastRoot);
    if (folder.id !== 'Rushs' || !matching.length) return;
    const brands = new Map();
    for (const file of matching) {
      const brand = cameraFolderName(file.cameraBrand);
      const model = cameraFolderName(file.cameraModel);
      const date = cameraFolderName(file.shootingDate || 'Date inconnue');
      if (!brands.has(brand)) brands.set(brand, new Map());
      const models = brands.get(brand);
      if (!models.has(model)) models.set(model, new Map());
      const dates = models.get(model);
      dates.set(date, (dates.get(date) || 0) + 1);
    }
    const brandNames = sortNames(brands.keys());
    brandNames.forEach((brand, brandIndex) => {
      const brandLast = brandIndex === brandNames.length - 1;
      const models = brands.get(brand);
      const brandCount = [...models.values()].reduce((sum, dates) => sum + [...dates.values()].reduce((subtotal, count) => subtotal + count, 0), 0);
      addNode(`${brand} (${brandCount})`, [lastRoot], brandLast);
      const modelNames = sortNames(models.keys());
      modelNames.forEach((model, modelIndex) => {
        const modelLast = modelIndex === modelNames.length - 1;
        const dates = models.get(model);
        const modelCount = [...dates.values()].reduce((sum, count) => sum + count, 0);
        addNode(`${model} (${modelCount})`, [lastRoot, brandLast], modelLast);
        const dateNames = sortNames(dates.keys());
        dateNames.forEach((date, dateIndex) => addNode(`${date} (${dates.get(date)})`, [lastRoot, brandLast, modelLast], dateIndex === dateNames.length - 1));
      });
    });
  });
  $('structureTree').textContent = tree.join('\n');
}

function normalizedCameraName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/[^a-z0-9]/g, '');
}

function closeCameraName(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1 || Math.min(left.length, right.length) < 5) return false;
  let i = 0;
  let j = 0;
  let differences = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue; }
    if (++differences > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else { i += 1; j += 1; }
  }
  return true;
}

function findCameraNameSuggestions(files, property, contextKey = '') {
  const contexts = new Map();
  for (const file of files) {
    const context = contextKey ? normalizedCameraName(file.cameraBrand) || 'unknown' : '';
    if (contextKey && context !== contextKey) continue;
    const value = String(file[property] || '').trim();
    if (!value || value === 'À identifier') continue;
    if (!contexts.has(context)) contexts.set(context, new Map());
    const variants = contexts.get(context);
    variants.set(value, (variants.get(value) || 0) + 1);
  }
  const suggestions = [];
  for (const [context, values] of contexts) {
    const variants = [...values].map(([value, count]) => ({ value, count, normalized: normalizedCameraName(value) }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr', { sensitivity: 'base' }));
    const canonicalNames = [];
    for (const variant of variants) {
      const canonical = canonicalNames.find((item) => closeCameraName(item.normalized, variant.normalized));
      if (!canonical) {
        canonicalNames.push(variant);
        continue;
      }
      if (canonical.value === variant.value) continue;
      suggestions.push({
        property,
        from: variant.value,
        to: canonical.value,
        context,
        count: variant.count
      });
    }
  }
  return suggestions;
}

function getCameraNameSuggestions() {
  const rushes = includedFiles().filter((file) => file.category === 'Rushs');
  const suggestions = findCameraNameSuggestions(rushes, 'cameraBrand');
  const brands = [...new Set(rushes.map((file) => normalizedCameraName(file.cameraBrand)).filter(Boolean))];
  for (const brand of brands) {
    const brandName = rushes.find((file) => normalizedCameraName(file.cameraBrand) === brand)?.cameraBrand || brand;
    suggestions.push(...findCameraNameSuggestions(rushes, 'cameraModel', brand).map((item) => ({ ...item, brand: brandName })));
  }
  return suggestions;
}

function renderCameraSuggestions() {
  state.cameraSuggestions = getCameraNameSuggestions();
  $('cameraMerge').hidden = !state.cameraSuggestions.length;
  $('cameraMergeList').innerHTML = state.cameraSuggestions.map((item, index) => {
    const type = item.property === 'cameraBrand' ? 'Marque' : `Modèle · ${item.brand || item.context}`;
    return `<div class="camera-merge-row"><div class="camera-merge-copy"><span>${escapeHTML(type)}</span><strong>${escapeHTML(item.from)}</strong><span aria-hidden="true">→</span><strong>${escapeHTML(item.to)}</strong><small>${item.count} média${item.count === 1 ? '' : 's'} concernés</small></div><button class="button secondary compact" type="button" data-camera-merge="${index}" aria-label="Regrouper ${escapeHTML(item.from)} sous ${escapeHTML(item.to)}">Regrouper</button></div>`;
  }).join('');
}

function applyCameraMerge(suggestion) {
  for (const file of state.files) {
    if (file.category !== 'Rushs' || file[suggestion.property] !== suggestion.from) continue;
    if (suggestion.property === 'cameraModel' && normalizedCameraName(file.cameraBrand) !== suggestion.context) continue;
    file[suggestion.property] = suggestion.to;
  }
  renderTable();
  renderProjectPreview();
  showToast(`${suggestion.from} regroupé sous ${suggestion.to}.`);
}

function renderProjectPreview() {
  renderStructurePreview();
  renderCameraSuggestions();
}

// Fichiers d’enregistreur (WAV, AIFF) : leur date sert à la synchro du son jour par jour.
function isSyncAudioFile(file) {
  return /\.(wav|aiff?)$/i.test(file.name || '');
}

function matchesBaseBins() {
  return state.folders.length === DEFAULT_FOLDERS.length && state.folders.every((folder, index) => folder.id === DEFAULT_FOLDERS[index].id && folder.name === DEFAULT_FOLDERS[index].name);
}

async function loadBinPreferences() {
  try {
    const result = await window.projectTool.loadBinPreferences();
    state.folders = result.folders.map((folder) => ({ ...folder, core: DEFAULT_FOLDERS.some((item) => item.id === folder.id) }));
    state.preferredFoldersCustomized = result.customized;
    state.binPreferenceStatus = result.customized ? 'Structure préférée chargée. Enregistre les changements pour les garder.' : '';
  } catch (error) {
    state.folders = DEFAULT_FOLDERS.map((folder) => ({ ...folder }));
    state.binPreferenceStatus = '';
    showToast(error.message || 'La structure préférée est indisponible; le modèle de base est chargé.');
  } finally {
    state.folderPreferencesLoaded = true;
    renderBins();
    renderBinEditor();
    renderTable();
    refreshStatus();
  }
}

async function savePreferredBins() {
  if (state.folderPreferenceBusy) return;
  state.folderPreferenceBusy = true;
  renderBinEditor();
  try {
    const result = await window.projectTool.saveBinPreferences(state.folders.map(({ id, name }) => ({ id, name })));
    state.folders = result.folders.map((folder) => ({ ...folder, core: DEFAULT_FOLDERS.some((item) => item.id === folder.id) }));
    state.preferredFoldersCustomized = true;
    state.binPreferenceStatus = 'Structure préférée enregistrée pour les prochains projets.';
    showToast('Structure préférée enregistrée pour les prochains projets.');
  } catch (error) {
    showToast(error.message || 'Impossible d’enregistrer la structure préférée.');
  } finally {
    state.folderPreferenceBusy = false;
    renderBins();
    renderBinEditor();
    renderTable();
    renderProjectPreview();
  }
}

async function resetPreferredBins() {
  if (state.folderPreferenceBusy) return;
  const baseIds = new Set(DEFAULT_FOLDERS.map((folder) => folder.id));
  if (state.files.some((file) => !baseIds.has(file.category))) {
    showToast('Reclasse les médias des chutiers ajoutés avant de revenir au modèle de base.');
    return;
  }
  state.folderPreferenceBusy = true;
  renderBinEditor();
  try {
    const result = await window.projectTool.resetBinPreferences();
    state.folders = result.folders.map((folder) => ({ ...folder, core: true }));
    state.preferredFoldersCustomized = false;
    state.binPreferenceStatus = '';
    showToast('Modèle de base rétabli pour ce projet et les suivants.');
  } catch (error) {
    showToast(error.message || 'Impossible de réinitialiser la structure préférée.');
  } finally {
    state.folderPreferenceBusy = false;
    renderBins();
    renderBinEditor();
    renderTable();
    renderProjectPreview();
  }
}

function renderBinEditor() {
  $('binEditorList').innerHTML = state.folders.map((folder) => {
    const used = state.files.filter((file) => file.category === folder.id).length;
    return `<div class="bin-edit-row"><input data-bin-name="${escapeHTML(folder.id)}" value="${escapeHTML(folder.name)}" maxlength="80" aria-label="Nom du chutier" ${state.folderPreferenceBusy ? 'disabled' : ''}><span>${used} média${used === 1 ? '' : 's'}</span><button type="button" data-remove-bin="${escapeHTML(folder.id)}" aria-label="Retirer le chutier ${escapeHTML(folder.name)}" title="${used ? 'Reclasse d’abord ses médias' : 'Retirer ce chutier'}" ${used || state.folderPreferenceBusy ? 'disabled' : ''}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>`;
  }).join('');
  $('addBin').disabled = state.scanning || state.duplicateCheckBusy || state.folderPreferenceBusy || state.folders.length >= 60;
  $('saveBinPreferences').disabled = state.folderPreferenceBusy || state.scanning || state.duplicateCheckBusy;
  $('resetBinPreferences').disabled = state.folderPreferenceBusy || state.scanning || state.duplicateCheckBusy || (!state.preferredFoldersCustomized && matchesBaseBins());
  $('binPreferenceStatus').hidden = !state.binPreferenceStatus;
  $('binPreferenceStatus').textContent = state.binPreferenceStatus;
  document.querySelectorAll('[data-bin-name]').forEach((input) => input.addEventListener('change', () => {
    const folder = state.folders.find((item) => item.id === input.dataset.binName);
    if (!folder) return;
    const name = input.value.replace(/[\\/:\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    const duplicate = state.folders.some((item) => item.id !== folder.id && item.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
    if (!name || name.length > 80 || duplicate) {
      showToast(!name ? 'Le nom du chutier ne peut pas être vide.' : duplicate ? 'Un chutier porte déjà ce nom.' : 'Le nom du chutier est limité à 80 caractères.');
      renderBinEditor();
      return;
    }
    folder.name = name;
    renderBins();
    renderTable();
    renderProjectPreview();
    renderBinEditor();
  }));
  document.querySelectorAll('[data-remove-bin]').forEach((button) => button.addEventListener('click', () => {
    const folder = state.folders.find((item) => item.id === button.dataset.removeBin);
    if (!folder || state.files.some((file) => file.category === folder.id)) return;
    state.folders = state.folders.filter((item) => item.id !== folder.id);
    renderBinEditor();
    renderBins();
    renderTable();
    renderProjectPreview();
  }));
  syncCreateButton();
}

function addCustomBin() {
  if (state.folders.length >= 60) return showToast('Un projet ne peut pas contenir plus de 60 chutiers.');
  let name = 'Nouveau chutier';
  let suffix = 2;
  while (state.folders.some((folder) => folder.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) name = `Nouveau chutier ${suffix++}`;
  const folder = { id: `custom-${crypto.randomUUID()}`, name, core: false };
  state.folders.push(folder);
  renderBins();
  renderBinEditor();
  renderTable();
  renderProjectPreview();
  const input = [...document.querySelectorAll('[data-bin-name]')].find((item) => item.dataset.binName === folder.id);
  input?.focus();
  input?.select();
}

function renderSources() {
  $('chooseSources').disabled = state.scanning || state.duplicateCheckBusy;
  $('chooseSources').querySelector('span').textContent = state.scanning && !state.refreshing ? 'Analyse…' : state.sourcePaths.length && !state.files.length ? 'Analyser' : 'Ajouter';
  $('refreshSources').disabled = !state.scanId || state.scanning || state.duplicateCheckBusy;
  $('refreshSources').querySelector('span').textContent = state.refreshing ? 'Lecture…' : 'Actualiser';
  if (!state.sourcePaths.length) {
    $('sourceList').innerHTML = '<div class="source-empty">Ajoute les dossiers qui contiennent tes rushs, musiques et éléments.</div>';
    return;
  }
  $('sourceList').innerHTML = state.sourcePaths.map((source) => {
    const count = state.files.filter((file) => file.sourceFolder === source).length;
    const bytes = state.files.filter((file) => file.sourceFolder === source).reduce((sum, file) => sum + file.size, 0);
    return `<div class="source-card"><span class="folder-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5h7l2 2H21v9H3z"/><path d="M3 7.5V6h7l2 2"/></svg></span><div class="source-info"><div class="source-name" title="${escapeHTML(source)}">${escapeHTML(source)}</div><div class="source-meta">${count} média${count > 1 ? 's' : ''}${count ? ` · ${bytesLabel(bytes)}` : ''}</div></div><button class="source-remove" data-remove-source="${escapeHTML(source)}" aria-label="Retirer ce dossier" ${state.scanning || state.duplicateCheckBusy ? 'disabled' : ''}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>`;
  }).join('');
  document.querySelectorAll('[data-remove-source]').forEach((button) => {
    button.addEventListener('click', () => {
      const previousState = { sourcePaths: [...state.sourcePaths], scanId: state.scanId, files: state.files };
      state.sourcePaths = state.sourcePaths.filter((source) => source !== button.dataset.removeSource);
      if (!state.sourcePaths.length) {
        state.scanId = '';
        state.files = [];
        $('duplicateCheckStatus').textContent = '';
        renderSources();
        renderTable();
        formatSummary();
        return;
      }
      scanSelectedSources([], previousState);
    });
  });
}

// Profils couleur (à garder synchronisé avec plugin/lib/cst.js).
const COLOR_PROFILES = [
  ['', 'Non reconnu · aucun CST'],
  ['sony-slog3', 'S-Log3 · S-Gamut3.Cine'],
  ['canon-clog2', 'Canon Log 2'],
  ['canon-clog3', 'Canon Log 3'],
  ['panasonic-vlog', 'V-Log · gestion couleur seulement'],
  ['fujifilm-flog', 'F-Log · gestion couleur seulement'],
  ['fujifilm-flog2', 'F-Log2 · gestion couleur seulement'],
  ['nikon-nlog', 'N-Log · gestion couleur seulement'],
  ['dji-dlog', 'D-Log · gestion couleur seulement'],
  ['apple-log', 'Apple Log · gestion couleur seulement'],
  ['arri-logc3', 'ARRI LogC3 · gestion couleur seulement'],
  ['arri-logc4', 'ARRI LogC4 · gestion couleur seulement'],
  ['red-log3g10', 'RED Log3G10 · gestion couleur seulement'],
  ['bmd-filmgen5', 'Blackmagic Film Gen 5 · gestion couleur seulement'],
  ['none', 'Aucun CST · déjà en Rec.709']
];
const CAMERA_PROFILES = [
  [/\bFX3\b|\bFX30\b|\bFX6V?\b|\bFX9\b|\bBURANO\b|\bMPC-2610\b|\bILCE-(?:7SM3|7M4|1|7RM5)\b|\bA7S ?III\b|\bA7 ?IV\b|\bZV-E1\b|\bFR7\b/i, 'sony-slog3'],
  [/\bC50\b|\bC70\b/i, 'canon-clog2'],
  [/\bR5(?:\s?C)?\b/i, 'canon-clog3']
];
function autoColorProfile(file) {
  const gamma = String(file.captureGamma || '').toLowerCase();
  if (gamma) return /s-?log3/.test(gamma) ? 'sony-slog3' : /log/.test(gamma) ? '' : 'none';
  const input = `${file.cameraBrand || ''} ${file.cameraModel || ''}`;
  return CAMERA_PROFILES.find(([pattern]) => pattern.test(input))?.[1] || '';
}

function reviewReasons(file) {
  const reasons = [];
  if (file.size === 0) reasons.push({ id: 'empty', label: 'Fichier vide' });
  if (file.size > 0 && !file.verified) reasons.push({ id: 'analysis', label: 'Analyse technique indisponible' });
  if (file.category === 'Rushs' && (!file.cameraBrand || !file.cameraModel || file.cameraBrand === 'À identifier' || file.cameraModel === 'À identifier')) reasons.push({ id: 'camera', label: 'Caméra à identifier' });
  if (file.category === 'Rushs' && file.dateSource === 'creation') reasons.push({ id: 'date', label: 'Date de création utilisée' });
  if (file.duplicateOf) reasons.push({ id: 'duplicate', label: file.duplicateVerification === 'identical' ? 'Contenu identique' : file.duplicateVerification === 'unreadable' ? 'Doublon probable · comparaison impossible' : 'Doublon probable' });
  return reasons;
}

function renderTable() {
  const hasFiles = state.files.length > 0;
  $('tableWrap').hidden = !hasFiles;
  $('tableTools').hidden = !hasFiles;
  $('reviewCount').hidden = !hasFiles;
  if (!hasFiles) {
    $('mediaRows').innerHTML = '';
    $('reviewLabel').textContent = '0 élément à vérifier';
    $('reviewFilters').hidden = true;
    $('reviewExplanation').hidden = true;
    updateDuplicateTools();
    formatSummary();
    return;
  }

  const query = state.filter.toLocaleLowerCase('fr').trim();
  const filtered = state.files.filter((file) => {
    if ($('hideDuplicates').checked && file.duplicateOf && state.reviewFilter !== 'duplicate') return false;
    if (state.reviewFilter && !reviewReasons(file).some((reason) => reason.id === state.reviewFilter)) return false;
    return !query || file.name.toLocaleLowerCase('fr').includes(query) || file.filePath.toLocaleLowerCase('fr').includes(query) || folderName(file.category).toLocaleLowerCase('fr').includes(query);
  });
  const start = state.page * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (state.page >= pageCount) state.page = pageCount - 1;
  const reviewCount = state.files.filter((file) => reviewReasons(file).length).length;
  $('reviewLabel').textContent = `${reviewCount} élément${reviewCount > 1 ? 's' : ''} à vérifier`;
  $('reviewExplanation').hidden = !reviewCount;
  updateDuplicateTools();
  renderReviewFilters();

  if (!visible.length) {
    $('mediaRows').innerHTML = '<tr><td class="empty-filter" colspan="7">Aucun média ne correspond à cette recherche.</td></tr>';
  } else {
    $('mediaRows').innerHTML = visible.map((file) => {
      const badges = reviewReasons(file).map((reason) => `<span class="review-mark ${reason.id}-mark">${escapeHTML(reason.label)}</span>`).join('');
      const destination = file.category === 'Rushs'
        ? `<div class="destination-edit"><input data-edit="cameraBrand" data-file="${file.id}" value="${escapeHTML(file.cameraBrand)}" placeholder="Marque" aria-label="Marque de caméra pour ${escapeHTML(file.name)}"><input data-edit="cameraModel" data-file="${file.id}" value="${escapeHTML(file.cameraModel)}" placeholder="Modèle" aria-label="Modèle de caméra pour ${escapeHTML(file.name)}"><input type="date" data-edit="shootingDate" data-file="${file.id}" value="${escapeHTML(file.shootingDate)}" aria-label="Date de tournage pour ${escapeHTML(file.name)}"></div>`
        : isSyncAudioFile(file)
          ? `<div class="destination-edit"><span class="destination-path" title="${escapeHTML(folderName(file.category))}">${escapeHTML(folderName(file.category))}</span><input type="date" data-edit="shootingDate" data-file="${file.id}" value="${escapeHTML(/^\d{4}-\d{2}-\d{2}$/.test(file.shootingDate || '') ? file.shootingDate : '')}" title="Date du son direct, utilisée pour la synchro jour par jour" aria-label="Date du son pour ${escapeHTML(file.name)}"></div>`
          : `<span class="destination-path" title="${escapeHTML(folderName(file.category))}">${escapeHTML(folderName(file.category))}</span>`;
      const profileCell = file.category === 'Rushs'
        ? `<select class="type-select profile-select${file.colorProfile ? '' : ' profile-unknown'}" data-profile="${file.id}" aria-label="Profil couleur de ${escapeHTML(file.name)}" title="${file.colorProfileManual ? 'Choisi à la main' : 'Détecté automatiquement'}">${COLOR_PROFILES.map(([value, label]) => `<option value="${value}"${(file.colorProfile || '') === value ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select>`
        : '<span class="profile-none">—</span>';
      return `<tr data-row="${file.id}" class="${file.duplicateOf ? 'duplicate-row' : ''}"><td><div class="file-cell"><span class="file-symbol">${categoryColor(file.category)}</span><div class="file-copy"><div class="file-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</div><div class="file-path" title="${escapeHTML(file.filePath)}">${escapeHTML(file.filePath)}</div><div class="review-marks">${badges}</div></div></div></td><td><select class="type-select" data-category="${file.id}" aria-label="Type de ${escapeHTML(file.name)}">${state.folders.map((folder) => `<option value="${escapeHTML(folder.id)}"${file.category === folder.id ? ' selected' : ''}>${escapeHTML(folder.name)}</option>`).join('')}</select></td><td><div class="destination-cell"><span class="folder-icon"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5.5h6l1.4 1.6H18v8.9H2z"/><path d="M2 5.5V4h6l1.4 1.6"/></svg></span>${destination}</div></td><td>${profileCell}</td><td class="size-cell">${bytesLabel(file.size)}</td><td class="duration-cell">${durationLabel(file.duration)}${file.timecode ? `<div class="timecode-label" title="Timecode de début">TC ${escapeHTML(file.timecode)}</div>` : ''}</td><td><input class="row-toggle" type="checkbox" data-include="${file.id}" ${file.include ? 'checked' : ''} aria-label="Inclure ${escapeHTML(file.name)}"></td></tr>`;
    }).join('');
  }

  updateReviewCount();
  if (pageCount > 1) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="7" class="page-row"><button class="button secondary compact" id="previousPage" ${state.page === 0 ? 'disabled' : ''}>Précédent</button><span>Page ${state.page + 1} sur ${pageCount} · ${filtered.length} médias affichés</span><button class="button secondary compact" id="nextPage" ${state.page + 1 === pageCount ? 'disabled' : ''}>Suivante</button></td>`;
    $('mediaRows').append(row);
    $('previousPage').addEventListener('click', () => { state.page -= 1; renderTable(); });
    $('nextPage').addEventListener('click', () => { state.page += 1; renderTable(); });
  }

  document.querySelectorAll('[data-category]').forEach((select) => {
    select.addEventListener('change', () => {
      const file = state.files.find((item) => item.id === select.dataset.category);
      if (file) file.category = select.value;
      renderTable();
      renderProjectPreview();
    });
  });
  document.querySelectorAll('[data-profile]').forEach((select) => {
    select.addEventListener('change', () => {
      const file = state.files.find((item) => item.id === select.dataset.profile);
      if (!file) return;
      file.colorProfile = select.value;
      file.colorProfileManual = select.value !== autoColorProfile(file);
      select.classList.toggle('profile-unknown', !select.value);
    });
  });
  document.querySelectorAll('[data-edit]').forEach((input) => {
    input.addEventListener('input', () => {
      const file = state.files.find((item) => item.id === input.dataset.file);
      if (file) file[input.dataset.edit] = input.value;
    });
    input.addEventListener('change', () => {
      const file = state.files.find((item) => item.id === input.dataset.file);
      if (file) file[input.dataset.edit] = input.value;
      if (file && !file.colorProfileManual && (input.dataset.edit === 'cameraBrand' || input.dataset.edit === 'cameraModel')) file.colorProfile = autoColorProfile(file);
      renderTable();
      renderProjectPreview();
    });
  });
  document.querySelectorAll('[data-include]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const file = state.files.find((item) => item.id === checkbox.dataset.include);
      if (file) {
        file.include = checkbox.checked;
        file.includeManuallyChanged = true;
        if (file.duplicateOf) file.duplicateManuallyChanged = true;
      }
      checkbox.closest('tr').classList.toggle('excluded-row', !checkbox.checked);
      formatSummary();
      renderProjectPreview();
    });
  });
  formatSummary();
}

function updateDuplicateTools() {
  $('chooseSources').disabled = state.scanning || state.duplicateCheckBusy;
  $('refreshSources').disabled = !state.scanId || state.scanning || state.duplicateCheckBusy;
  document.querySelectorAll('[data-remove-source]').forEach((button) => { button.disabled = state.scanning || state.duplicateCheckBusy; });
  const count = state.files.filter((file) => file.duplicateOf).length;
  $('duplicateTools').hidden = !count && !$('duplicateCheckStatus').textContent;
  $('verifyDuplicates').hidden = !count;
  $('duplicateCheckHint').hidden = !count;
  $('verifyDuplicates').disabled = state.duplicateCheckBusy || !count;
  $('verifyDuplicates').textContent = state.duplicateCheckBusy ? 'Comparaison en cours…' : 'Comparer le contenu des doublons probables';
  $('cancelDuplicateCheck').hidden = !state.duplicateCheckBusy;
  $('cancelDuplicateCheck').disabled = false;
  $('cancelDuplicateCheck').textContent = 'Arrêter';
  formatSummary();
}

function updateReviewCount() {
  const count = state.files.filter((file) => reviewReasons(file).length).length;
  $('reviewLabel').textContent = `${count} élément${count > 1 ? 's' : ''} à vérifier`;
}

function renderReviewFilters() {
  const counts = new Map();
  for (const file of state.files) {
    for (const reason of reviewReasons(file)) counts.set(reason.id, (counts.get(reason.id) || 0) + 1);
  }
  const labels = { empty: 'Fichiers vides', analysis: 'Analyse à confirmer', camera: 'Caméra à identifier', date: 'Date de repli', duplicate: 'Doublons probables' };
  const filters = [...counts].map(([id, count]) => `<button class="review-filter${state.reviewFilter === id ? ' active' : ''}" data-review-filter="${id}" aria-pressed="${state.reviewFilter === id}">${labels[id]} <span>${count}</span></button>`).join('');
  $('reviewFilters').innerHTML = filters;
  $('reviewFilters').hidden = !filters;
  document.querySelectorAll('[data-review-filter]').forEach((button) => button.addEventListener('click', () => {
    state.reviewFilter = state.reviewFilter === button.dataset.reviewFilter ? '' : button.dataset.reviewFilter;
    state.page = 0;
    renderTable();
  }));
}

function setScanProgress(progress) {
  const bar = $('progressBar');
  const text = $('progressText');
  if (progress.stage !== 'scan') return;
  const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  bar.style.width = `${percent}%`;
  text.textContent = `${progress.label} · ${progress.current} / ${progress.total}`;
}

async function scanSelectedSources(pathsToScan = state.sourcePaths, previousState = null, forceRefresh = false) {
  if (!state.sourcePaths.length) return;
  state.scanOperationId = crypto.randomUUID();
  state.reviewFilter = '';
  state.scanning = true;
  state.refreshing = forceRefresh;
  $('scanProgress').hidden = false;
  $('toOptions').disabled = true;
  $('chooseSources').disabled = true;
  renderSources();
  $('progressBar').style.width = '0%';
  $('progressText').textContent = 'Préparation de l’analyse…';
  try {
    const result = await window.projectTool.scanSources(
      state.scanOperationId,
      pathsToScan,
      previousState?.scanId || '',
      state.sourcePaths,
      previousState?.files.map(({ id, include, includeManuallyChanged, duplicateManuallyChanged }) => ({ id, include, includeManuallyChanged, duplicateManuallyChanged })) || [],
      forceRefresh
    );
    if (result.cancelled) {
      if (previousState) Object.assign(state, previousState);
      else { state.scanId = ''; state.files = []; }
      renderSources();
      renderTable();
      showToast(previousState ? forceRefresh ? 'Actualisation interrompue. Les résultats précédents sont conservés.' : 'Mise à jour interrompue. Les résultats précédents sont conservés.' : 'Analyse interrompue. Tu peux la relancer ou retirer un dossier.');
      return;
    }
    state.scanId = result.scanId;
    const previousFiles = new Map((previousState?.files || []).map((file) => [file.id, file]));
    const fallbackCategory = state.folders.find((folder) => folder.id === 'Assets')?.id || state.folders[0]?.id || '';
    // Une structure préférée enregistrée avant le chutier « Son » n’en a pas : le son direct retombe dans Musiques.
    const audioFallback = state.folders.find((folder) => folder.id === 'Musiques')?.id || fallbackCategory;
    state.files = result.files.map((file) => {
      const old = previousFiles.get(file.id);
      const category = old && state.folders.some((folder) => folder.id === old.category)
        ? old.category
        : state.folders.some((folder) => folder.id === file.category) ? file.category : file.category === 'Son' ? audioFallback : fallbackCategory;
      return old ? {
        ...file,
        category,
        cameraBrand: old.cameraBrand,
        cameraModel: old.cameraModel,
        shootingDate: old.shootingDate,
        colorProfile: old.colorProfile,
        colorProfileManual: old.colorProfileManual,
        dateSource: old.dateSource,
        include: old.includeManuallyChanged ? old.include : file.include,
        includeManuallyChanged: old.includeManuallyChanged,
        duplicateManuallyChanged: old.duplicateManuallyChanged
      } : { ...file, category };
    });
    $('duplicateCheckStatus').textContent = '';
    state.ffprobeAvailable = result.ffprobeAvailable;
    $('probeWarning').hidden = result.ffprobeAvailable;
    $('tableWrap').scrollTop = 0;
    state.page = 0;
    renderSources();
    renderTable();
    if (previousState) showToast(`${forceRefresh ? 'Médias actualisés' : 'Dossiers mis à jour'}. L’analyse des doublons a été réinitialisée.`);
  } catch (error) {
    showToast(error.message || 'Analyse des dossiers impossible.');
    if (previousState) Object.assign(state, previousState);
    else { state.files = []; state.scanId = ''; }
    renderTable();
  } finally {
    state.scanning = false;
    state.refreshing = false;
    state.scanOperationId = '';
    $('scanProgress').hidden = true;
    $('chooseSources').disabled = false;
    $('cancelScan').disabled = false;
    $('cancelScan').textContent = 'Arrêter';
    renderSources();
    formatSummary();
  }
}

async function chooseSources() {
  if (state.scanning || state.duplicateCheckBusy) return;
  if (state.sourcePaths.length && !state.files.length) {
    if (state.scanId) await refreshSources();
    else await scanSelectedSources();
    return;
  }
  try {
    const paths = await window.projectTool.chooseSources();
    if (!paths.length) return;
    const next = [...new Set([...state.sourcePaths, ...paths])];
    if (next.length === state.sourcePaths.length) return;
    const previousState = { sourcePaths: [...state.sourcePaths], scanId: state.scanId, files: state.files };
    const added = next.filter((source) => !state.sourcePaths.includes(source));
    state.sourcePaths = next;
    renderSources();
    renderTable();
    await scanSelectedSources(added, previousState.scanId ? previousState : null);
  } catch (error) {
    showToast(error.message || 'Impossible de choisir les dossiers.');
  }
}

async function refreshSources() {
  if (!state.scanId || state.scanning || state.duplicateCheckBusy) return;
  const previousState = { sourcePaths: [...state.sourcePaths], scanId: state.scanId, files: state.files };
  await scanSelectedSources(state.sourcePaths, previousState, true);
}

function prepareOptionsView() {
  renderBins();
  renderBinEditor();
  renderProjectPreview();
  const files = includedFiles();
  const size = files.reduce((sum, file) => sum + file.size, 0);
  const rushes = files.filter((file) => file.category === 'Rushs');
  const reviews = files.filter((file) => reviewReasons(file).length).length;
  const summary = [
    ['project', $('projectName').value.trim(), 'Projet Resolve'],
    ['media', `${files.length}`, 'Médias retenus'],
    ['size', bytesLabel(size), 'Taille totale'],
    ['formats', `${new Set(files.map((file) => file.extension)).size}`, 'Formats détectés'],
    ['cameras', `${new Set(rushes.filter((file) => file.cameraBrand && file.cameraModel && file.cameraBrand !== 'À identifier' && file.cameraModel !== 'À identifier').map((file) => `${file.cameraBrand}|${file.cameraModel}`)).size}`, 'Caméras identifiées'],
    ['review', `${reviews}`, 'À vérifier']
  ];
  $('creationSummary').innerHTML = summary.map(([, value, label]) => `<div class="summary-item"><div class="summary-value">${escapeHTML(value)}</div><div class="summary-label">${escapeHTML(label)}</div></div>`).join('');
  $('finalMediaSummary').textContent = `${rushes.length} rush${rushes.length > 1 ? 's' : ''} · ${files.length - rushes.length} autre${files.length - rushes.length === 1 ? '' : 's'} média${files.length - rushes.length === 1 ? '' : 's'}`;
  $('openProjectNote').hidden = !state.currentProject;
  $('openProjectText').textContent = state.currentProject
    ? `Le projet ouvert « ${state.currentProject} » sera enregistré avant la création.`
    : 'Aucun autre projet ouvert dans Resolve.';
  syncCreateButton();
}

function syncCreateButton() {
  const files = includedFiles();
  const missingFolder = files.some((file) => !state.folders.some((folder) => folder.id === file.category));
  $('createNow').disabled = !state.connected || state.creating || state.folderPreferenceBusy || !files.length || missingFolder;
}

function updateCreateProgress(progress) {
  if (!state.creating || progress.stage === 'scan') return;
  const bar = $('createProgressBar');
  const text = $('createProgressText');
  const fraction = progress.total ? progress.current / progress.total : 0;
  const stageBase = progress.stage === 'project' ? 0 : progress.stage === 'bins' ? .08 : progress.stage === 'import' ? .25 : progress.stage === 'sync' ? .82 : progress.stage === 'grade' ? .9 : 1;
  const stageWeight = progress.stage === 'project' ? .08 : progress.stage === 'bins' ? .17 : progress.stage === 'import' ? .57 : progress.stage === 'sync' ? .08 : progress.stage === 'grade' ? .09 : 0;
  bar.style.width = `${Math.min(99, Math.round((stageBase + stageWeight * fraction) * 100))}%`;
  text.textContent = progress.label || 'Préparation dans Resolve…';
}

function renderCompletion(result) {
  setStep(4);
  const hasWarning = Boolean(result.warning || result.failedNames?.length);
  $('completionMark').classList.toggle('warning-mark', hasWarning);
  $('completionTitle').textContent = hasWarning ? 'Projet créé avec des points à vérifier' : 'Projet prêt';
  $('completionSubtitle').textContent = `« ${result.projectName} » est ouvert dans DaVinci Resolve.`;
  const rows = [
    ['Médias importés', `${result.importedCount}`],
    ['Doublons ignorés', `${result.excludedCount}`],
    ['Chutiers créés', result.createdBins.join(' · ')],
    ['Timeline', result.timelineName ? `${result.timelineName} · ${result.timelineFormat}` : 'Aucune timeline créée']
  ];
  if (result.syncReport) {
    const { days, mode, audioCount, unmatchedAudio } = result.syncReport;
    const synced = days.filter((day) => day.ok).length;
    rows.push(['Synchro du son', days.length
      ? `${synced} / ${days.length} jour(s) · ${mode}${unmatchedAudio ? ` · ${unmatchedAudio} fichier(s) son sans image le même jour` : ''}`
      : audioCount ? 'Aucun jour avec image et son' : 'Aucun son direct importé']);
  }
  if (result.extraTimelines?.length) rows.push(['Timelines supplémentaires', result.extraTimelines.map((n) => n.split(' — ').pop()).join(' · ')]);
  if (result.colorReport) {
    const { applied, unrecognized, failed, output } = result.colorReport;
    const skipped = result.colorReport.skipped || 0;
    const total = applied + skipped + unrecognized.length + failed.length;
    rows.push([result.colorReport.method === 'managed' ? 'Gestion couleur' : 'Color Space Transform', `${applied} / ${total} plan(s) · sortie ${output}${skipped ? ` · ${skipped} déjà en Rec.709` : ''}`]);
    if (unrecognized.length) rows.push(['Caméra non reconnue', unrecognized.slice(0, 4).join(', ') + (unrecognized.length > 4 ? ` et ${unrecognized.length - 4} autre(s)` : '')]);
  }
  $('completionReport').innerHTML = rows.map(([label, value]) => `<div class="report-row"><span>${escapeHTML(label)}</span><span>${escapeHTML(value)}</span></div>`).join('');
  const warningParts = [result.warning, result.failedNames?.length ? `À vérifier : ${result.failedNames.slice(0, 6).join(', ')}${result.failedNames.length > 6 ? ` et ${result.failedNames.length - 6} autre(s)` : ''}.` : ''];
  $('completionWarning').textContent = warningParts.filter(Boolean).join(' ');
  $('completionWarning').hidden = !hasWarning;
  const showProxyGuide = $('prepareProxies').checked;
  $('proxyGuide').hidden = !showProxyGuide;
  $('proxySourceList').innerHTML = state.sourcePaths.map((source) => `<li>${escapeHTML(source)}</li>`).join('');
}

async function createProjectNow() {
  const name = $('projectName').value.trim();
  if (!name) return showToast('Saisis un nom de projet.');
  if (/[\\/:\u0000-\u001f]/.test(name)) return showToast('Le nom ne peut pas contenir de barre oblique.');
  if (name.length > 100) return showToast('Le nom du projet doit contenir 100 caractères maximum.');
  if (includedFiles().some((file) => !state.folders.some((folder) => folder.id === file.category))) return showToast('Un média est classé dans un chutier supprimé. Reclasse-le à l’étape Sources.');
  state.creating = true;
  $('createProgress').hidden = false;
  $('createProgressBar').style.width = '0%';
  $('createNow').disabled = true;
  $('createNow').textContent = 'Création…';
  try {
    const result = await window.projectTool.createProject({
      projectName: name,
      scanId: state.scanId,
      createTimeline: $('createTimeline').checked,
      timelineResolution: $('timelineResolution').value,
      timelineFrameRate: $('timelineFrameRate').value,
      applyCst: $('applyCst').checked,
      timelinePerCamera: $('timelinePerCamera').checked,
      timelinePerDay: $('timelinePerDay').checked,
      cstOutput: $('cstOutput').value,
      colorMethod: $('colorMethod').value,
      settingsPreset: $('settingsPreset').value,
      timelineOrder: $('timelineOrder').value,
      syncAudio: $('syncAudio').checked,
      syncMode: $('syncMode').value,
      createMulticam: $('createMulticam').checked,
      colorClips: $('colorClips').checked,
      writeMetadata: $('writeMetadata').checked,
      folders: state.folders.map(({ id, name }) => ({ id, name })),
      files: state.files.map(({ id, category, cameraBrand, cameraModel, shootingDate, colorProfile, include }) => ({ id, category, cameraBrand, cameraModel, shootingDate, colorProfile: colorProfile || '', include }))
    });
    renderCompletion(result);
  } catch (error) {
    showToast(error.message || 'Création du projet impossible.');
  } finally {
    state.creating = false;
    $('createProgress').hidden = true;
    $('createNow').textContent = 'Créer le projet';
    $('createNow').disabled = false;
  }
}

// Presets de réglages de projet de l’utilisateur (Resolve), mémorisés par nom.
async function loadSettingsPresets() {
  try {
    const names = await window.projectTool.listSettingsPresets();
    const select = $('settingsPreset');
    const previous = select.value || localStorage.getItem('rpm.settingsPreset') || '';
    select.length = 1;
    names.forEach((name) => select.add(new Option(name, name)));
    select.value = names.includes(previous) ? previous : '';
    $('presetControls').hidden = !names.length;
  } catch (_) { $('presetControls').hidden = true; }
}
$('settingsPreset').addEventListener('change', (event) => {
  try { localStorage.setItem('rpm.settingsPreset', event.target.value); } catch (_) {}
});

async function refreshStatus() {
  try {
    const result = await window.projectTool.getStatus();
    state.connected = result.connected;
    state.currentProject = result.currentProject || '';
    const label = result.connected
      ? (state.currentProject ? `Projet ouvert : ${state.currentProject}` : 'Connecté à Resolve')
      : `Connexion à Resolve indisponible · ${result.error || ''}`;
    $('connectionState').textContent = label;
    $('retryConnection').hidden = result.connected;
    if (result.connected) loadSettingsPresets();
    $('toSources').disabled = !result.connected || !state.folderPreferencesLoaded;
    formatSummary();
  } catch (_) {
    state.connected = false;
    $('connectionState').textContent = 'Connexion à Resolve indisponible';
    $('retryConnection').hidden = false;
    $('toSources').disabled = true;
  }
}

document.querySelectorAll('.step').forEach((button) => button.addEventListener('click', () => {
  const target = Number(button.dataset.step);
  if (target < state.step && target < 4) setStep(target);
}));
$('closeTop').addEventListener('click', () => window.projectTool.close());
$('finish').addEventListener('click', () => window.projectTool.finish());
$('openProxyGenerator').addEventListener('click', async () => {
  const button = $('openProxyGenerator');
  button.disabled = true;
  try {
    const result = await window.projectTool.openProxyGenerator(state.sourcePaths);
    showToast(result.added ? `${result.added} dossier(s) ajouté(s) à la surveillance.` : 'Tous les dossiers sont déjà surveillés.');
  } catch (error) {
    showToast(error.message || 'Impossible d’ouvrir Blackmagic Proxy Generator.');
  } finally {
    button.disabled = false;
  }
});
$('toSources').addEventListener('click', () => setStep(2));
$('backToProject').addEventListener('click', () => setStep(1));
$('toOptions').addEventListener('click', () => setStep(3));
$('addBin').addEventListener('click', addCustomBin);
$('saveBinPreferences').addEventListener('click', savePreferredBins);
$('resetBinPreferences').addEventListener('click', resetPreferredBins);
$('cameraMergeList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-camera-merge]');
  const suggestion = state.cameraSuggestions[Number(button?.dataset.cameraMerge)];
  if (suggestion) applyCameraMerge(suggestion);
});
$('projectName').addEventListener('input', renderStructurePreview);
$('createTimeline').addEventListener('change', (event) => {
  $('timelineControls').hidden = !event.target.checked;
});
const updateColorControls = () => {
  const on = $('applyCst').checked;
  $('cstOutputField').hidden = !on;
  $('cstMethodField').hidden = !on;
  $('colorMethodNote').hidden = !(on && $('colorMethod').value === 'managed');
};
$('colorMethod').addEventListener('change', (event) => {
  updateColorControls();
  try { localStorage.setItem('rpm.colorMethod', event.target.value); } catch (_) {}
});
$('applyCst').addEventListener('change', (event) => {
  updateColorControls();
  try { localStorage.setItem('rpm.applyCst', event.target.checked ? '1' : '0'); } catch (_) {}
});
$('cstOutput').addEventListener('change', (event) => {
  try { localStorage.setItem('rpm.cstOutput', event.target.value); } catch (_) {}
});
try {
  const savedCst = localStorage.getItem('rpm.applyCst');
  if (savedCst !== null) $('applyCst').checked = savedCst === '1';
  const savedOutput = localStorage.getItem('rpm.cstOutput');
  if (savedOutput && [...$('cstOutput').options].some((option) => option.value === savedOutput)) $('cstOutput').value = savedOutput;
  const savedMethod = localStorage.getItem('rpm.colorMethod');
  if (savedMethod && [...$('colorMethod').options].some((option) => option.value === savedMethod)) $('colorMethod').value = savedMethod;
  updateColorControls();
} catch (_) {}
// Ordre des plans et synchro : réglages mémorisés d’un projet à l’autre.
[['timelineOrder', 'rpm.timelineOrder'], ['syncMode', 'rpm.syncMode']].forEach(([id, key]) => {
  $(id).addEventListener('change', (event) => { try { localStorage.setItem(key, event.target.value); } catch (_) {} });
  try {
    const saved = localStorage.getItem(key);
    if (saved && [...$(id).options].some((option) => option.value === saved)) $(id).value = saved;
  } catch (_) {}
});
const updateSyncControls = () => { $('syncControls').hidden = !($('syncAudio').checked || $('createMulticam').checked); };
$('syncAudio').addEventListener('change', (event) => {
  updateSyncControls();
  try { localStorage.setItem('rpm.syncAudio', event.target.checked ? '1' : '0'); } catch (_) {}
});
try {
  $('syncAudio').checked = localStorage.getItem('rpm.syncAudio') === '1';
  updateSyncControls();
} catch (_) {}
$('createMulticam').addEventListener('change', (event) => {
  updateSyncControls();
  try { localStorage.setItem('rpm.createMulticam', event.target.checked ? '1' : '0'); } catch (_) {}
});
try { $('createMulticam').checked = localStorage.getItem('rpm.createMulticam') === '1'; } catch (_) {}
updateSyncControls();
$('writeMetadata').addEventListener('change', (event) => {
  try { localStorage.setItem('rpm.writeMetadata', event.target.checked ? '1' : '0'); } catch (_) {}
});
try { $('writeMetadata').checked = localStorage.getItem('rpm.writeMetadata') === '1'; } catch (_) {}
$('colorClips').addEventListener('change', (event) => {
  try { localStorage.setItem('rpm.colorClips', event.target.checked ? '1' : '0'); } catch (_) {}
});
try { $('colorClips').checked = localStorage.getItem('rpm.colorClips') === '1'; } catch (_) {}
$('backToSources').addEventListener('click', () => setStep(2));
$('uninstallPlugin').addEventListener('click', async () => {
  try { await window.projectTool.uninstall(); } catch (error) { showToast(error.message); }
});
$('chooseSources').addEventListener('click', chooseSources);
$('refreshSources').addEventListener('click', refreshSources);
$('createNow').addEventListener('click', createProjectNow);
$('cancelScan').addEventListener('click', async () => {
  if (!state.scanOperationId) return;
  $('cancelScan').disabled = true;
  $('cancelScan').textContent = 'Arrêt…';
  try { await window.projectTool.cancelOperation(state.scanOperationId); } catch (_) {
    $('cancelScan').disabled = false;
    $('cancelScan').textContent = 'Arrêter';
  }
});
$('filterInput').addEventListener('input', (event) => { state.filter = event.target.value; state.page = 0; renderTable(); });
$('hideDuplicates').addEventListener('change', (event) => {
  if (event.target.checked) state.files.filter((file) => file.duplicateOf).forEach((file) => { file.include = false; file.includeManuallyChanged = true; file.duplicateAutoExcluded = false; file.duplicateManuallyChanged = true; });
  else state.files.filter((file) => file.duplicateOf).forEach((file) => { file.include = true; file.includeManuallyChanged = true; file.duplicateAutoExcluded = false; file.duplicateManuallyChanged = true; });
  renderTable();
  renderProjectPreview();
});
$('verifyDuplicates').addEventListener('click', async () => {
  state.duplicateOperationId = crypto.randomUUID();
  state.duplicateCheckBusy = true;
  $('duplicateCheckStatus').textContent = 'Préparation…';
  updateDuplicateTools();
  try {
    const result = await window.projectTool.verifyDuplicates(state.duplicateOperationId, {
      scanId: state.scanId,
      files: state.files.map((file) => ({ id: file.id, include: file.include, duplicateManuallyChanged: file.duplicateManuallyChanged }))
    });
    if (result.cancelled) {
      $('duplicateCheckStatus').textContent = 'Comparaison interrompue. Les résultats précédents sont conservés.';
      return;
    }
    const messages = [];
    if (result.identicalGroups) messages.push(`${result.identicalGroups} groupe(s) confirmé(s)`);
    if (result.distinctFiles) messages.push(`${result.distinctFiles} fichier(s) distinct(s) réintégré(s)`);
    if (result.unreadableGroups) messages.push(`${result.unreadableGroups} groupe(s) non vérifiable(s)`);
    $('duplicateCheckStatus').textContent = messages.join(' · ') || 'Aucun doublon à confirmer.';
    renderTable();
    renderProjectPreview();
  } catch (error) {
    $('duplicateCheckStatus').textContent = 'La comparaison a échoué.';
    showToast(error.message || 'Comparaison impossible.');
  } finally {
    state.duplicateCheckBusy = false;
    state.duplicateOperationId = '';
    updateDuplicateTools();
  }
});
$('cancelDuplicateCheck').addEventListener('click', async () => {
  if (!state.duplicateOperationId) return;
  $('cancelDuplicateCheck').disabled = true;
  $('cancelDuplicateCheck').textContent = 'Arrêt…';
  $('duplicateCheckStatus').textContent = 'Arrêt de la comparaison…';
  try { await window.projectTool.cancelOperation(state.duplicateOperationId); } catch (_) {
    $('cancelDuplicateCheck').disabled = false;
    $('cancelDuplicateCheck').textContent = 'Arrêter';
    $('duplicateCheckStatus').textContent = 'Impossible d’arrêter la comparaison.';
  }
});
$('retryConnection').addEventListener('click', async () => {
  $('retryConnection').disabled = true;
  try { await window.projectTool.reconnect(); } finally { $('retryConnection').disabled = false; await refreshStatus(); }
});
window.projectTool.onProgress((progress) => {
  if (progress.stage === 'scan') setScanProgress(progress);
  else if (progress.stage === 'duplicate-check') $('duplicateCheckStatus').textContent = `${progress.label} · ${progress.current} / ${progress.total}`;
  else updateCreateProgress(progress);
  if (progress.stage === 'error') showToast(progress.label);
});

renderBins();
renderSources();
renderTable();
loadBinPreferences();
