'use strict';
// Logique pure (sans Electron ni Resolve) : testable avec `node --test`.
const path = require('node:path');

const VIDEO = new Set(['.mov', '.mp4', '.m4v', '.mxf', '.avi', '.mpg', '.mpeg', '.mkv', '.mts', '.m2ts', '.braw', '.r3d', '.ari', '.crm', '.3gp', '.webm']);
const AUDIO = new Set(['.wav', '.aif', '.aiff', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma']);
const STILL = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp', '.heic', '.heif', '.exr', '.dpx', '.dng', '.arw', '.cr2', '.cr3', '.nef', '.raf']);
const GRAPHIC = new Set(['.psd', '.ai', '.eps', '.svg', '.pdf']);
const SEQUENCE = new Set(['.fcpxml', '.edl', '.aaf', '.drt', '.otio', '.xml']);
// Formats des enregistreurs son (son direct) : seuls candidats à la synchro avec l'image.
const SYNC_AUDIO = new Set(['.wav', '.aif', '.aiff']);
const SUPPORTED = new Set([...VIDEO, ...AUDIO, ...STILL, ...GRAPHIC, ...SEQUENCE]);
const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 47.952, 48, 50, 59.94, 60, 100, 119.88, 120];

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u001f]/g, '').trim();
}

function categoryFor(extension) {
  if (VIDEO.has(extension)) return 'Rushs';
  if (AUDIO.has(extension)) return 'Musiques';
  if (SEQUENCE.has(extension)) return 'Séquences';
  if (GRAPHIC.has(extension)) return 'Assets';
  if (STILL.has(extension)) return 'Éléments';
  return null;
}

const BRANDS = [
  [/\bsony\b|\b(ilce|ilme|pxw|fx[0-9]|fx30)\b/i, 'Sony'],
  [/\bcanon\b|\beos\b/i, 'Canon'],
  [/\bred\b|\bred digital cinema\b|\b(komodo|v-raptor|monstro|helium|gemini)\b/i, 'RED'],
  [/\barri\b|\balexa\b|\bamira\b/i, 'ARRI'],
  [/\bblackmagic\b|\bbmpcc\b|\bursa\b/i, 'Blackmagic'],
  [/\bpanasonic\b|\blumix\b|\b(dc-|ag-|au-)/i, 'Panasonic'],
  [/\bfujifilm\b|\bfuji\b/i, 'Fujifilm'],
  [/\bnikon\b/i, 'Nikon'],
  [/\bgopro\b|\bhero ?\d+/i, 'GoPro'],
  [/\bdji\b|\b(mavic|osmo|ronin)\b/i, 'DJI'],
  [/\bapple\b|\biphone\b|\bipad\b/i, 'Apple']
];

// Reconnaît une marque à partir de mots entiers (évite « red » dans « Shared »).
function normalizeBrand(make, model = '') {
  const input = `${cleanText(make)} ${cleanText(model)}`;
  return BRANDS.find(([pattern]) => pattern.test(input))?.[1] || cleanText(make);
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Retourne AAAA-MM-JJ en heure locale. Une date avec heure et fuseau (ex. creation_time
// ffprobe en UTC « 2026-09-12T22:30:00Z ») est convertie dans le fuseau du Mac.
function normalizeDate(value) {
  const input = cleanText(value);
  if (!input) return '';
  const exif = input.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (exif) return `${exif[1]}-${exif[2]}-${exif[3]}`; // EXIF : déjà en heure locale caméra
  if (/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(input) && /(Z|[+-]\d{2}:?\d{2})$/.test(input)) {
    const date = new Date(input.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (!Number.isNaN(date.getTime())) return localDate(date);
  }
  const match = input.match(/(?<!\d)(\d{4})-?(\d{2})-?(\d{2})(?!\d)/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '' : localDate(date);
}

function localTime(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

// Heure d'enregistrement HH:MM:SS, avec les mêmes règles de fuseau que normalizeDate.
function normalizeTime(value) {
  const input = cleanText(value);
  if (!input) return '';
  const exif = input.match(/^\d{4}:\d{2}:\d{2}[ T](\d{2}):(\d{2}):(\d{2})/);
  if (exif) return `${exif[1]}:${exif[2]}:${exif[3]}`;
  const iso = input.match(/^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!iso) return '';
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(input)) {
    const date = new Date(input.replace(' ', 'T').replace(/ ?([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (!Number.isNaN(date.getTime())) return localTime(date);
  }
  return `${iso[1]}:${iso[2]}:${iso[3] || '00'}`;
}

// Timecode HH:MM:SS:FF (ou ; en drop frame) → secondes depuis minuit. null si absent ou invalide.
function parseTimecode(value, fps) {
  const match = cleanText(value).match(/^(\d{1,2})[:;.](\d{2})[:;.](\d{2})[:;.](\d{2,3})$/);
  if (!match) return null;
  const [hours, minutes, seconds, frames] = match.slice(1).map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  // Seul l'ordre compte : les images restent sous la seconde, même sans fréquence connue.
  const base = Number.isFinite(fps) && fps > frames ? fps : frames + 1;
  return hours * 3600 + minutes * 60 + seconds + frames / base;
}

function secondsOfDay(time) {
  const match = cleanText(time).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

// Ordre des plans dans les timelines : par jour, puis timecode ou heure d'enregistrement, puis nom.
// 'timecode' se replie sur l'heure quand un plan n'a pas de timecode (et inversement pour 'time').
// 'import' garde l'ordre reçu (chutier par chutier).
function sortForTimeline(entries, order = 'timecode', fileOf = (entry) => entry) {
  if (order !== 'timecode' && order !== 'time') return [...entries];
  const keyed = entries.map((entry, index) => {
    const file = fileOf(entry) || {};
    const timecode = parseTimecode(file.timecode, file.fps);
    const time = secondsOfDay(file.shootingTime);
    return {
      entry,
      index,
      date: /^\d{4}-\d{2}-\d{2}$/.test(file.shootingDate || '') ? file.shootingDate : '9999-99-99',
      seconds: order === 'timecode' ? timecode ?? time : time ?? timecode,
      name: String(file.name || '')
    };
  });
  keyed.sort((a, b) => a.date.localeCompare(b.date)
    || (a.seconds ?? Infinity) - (b.seconds ?? Infinity)
    || a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' })
    || a.index - b.index);
  return keyed.map(({ entry }) => entry);
}

// Chemins possibles d'un sidecar XML de métadonnées pour un fichier vidéo.
// Canon : CLIP.MXF -> CLIP.XML ; Sony : C0001.MP4 -> C0001M01.XML
function sidecarCandidates(videoPath) {
  const base = videoPath.slice(0, -path.extname(videoPath).length);
  return [`${base}.XML`, `${base}.xml`, `${base}M01.XML`, `${base}M01.xml`];
}

// Retire des fichiers scannés les XML qui sont des sidecars de vidéos présentes.
function filterSidecars(files) {
  const videos = new Set(files.filter((f) => VIDEO.has(f.extension)).map((f) => f.filePath.slice(0, -f.extension.length).toLowerCase()));
  return files.filter((file) => {
    if (file.extension !== '.xml') return true;
    const base = file.filePath.slice(0, -file.extension.length).toLowerCase();
    return !(videos.has(base) || (base.endsWith('m01') && videos.has(base.slice(0, -3))));
  });
}

function parseSidecarXml(xml) {
  if (typeof xml !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const leaf = (name) => {
    const match = xml.match(new RegExp(`<${name}\\b[^>]*>([^<]*)<\\/${name}\\s*>`, 'i'));
    return match ? cleanText(decode(match[1])) : '';
  };
  const attr = (tag, name) => {
    const match = xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`, 'i'));
    return match ? cleanText(decode(match[1])) : '';
  };
  // Canon : <Manufacturer>/<ModelName> ; Sony (NonRealTimeMeta) : <Device manufacturer=".." modelName="..">
  const make = leaf('Manufacturer') || attr('Device', 'manufacturer');
  const model = leaf('ModelName') || attr('Device', 'modelName');
  const date = attr('CreationDate', 'value');
  // Sony : <Item name="CaptureGammaEquation" value="s-log3-cine"/>
  const item = (name) => {
    const match = xml.match(new RegExp(`<Item\\b[^>]*\\bname="${name}"[^>]*\\bvalue="([^"]*)"`, 'i'));
    return match ? cleanText(decode(match[1])) : '';
  };
  const captureGamma = item('CaptureGammaEquation');
  const capturePrimaries = item('CaptureColorPrimaries');
  return make || model || date || captureGamma
    ? { cameraMake: make, cameraModel: model, date: normalizeDate(date), time: normalizeTime(date), captureGamma, capturePrimaries }
    : null;
}

// Doublons probables : nom + taille, + durée quand elle est connue.
function duplicateFingerprint(file) {
  if (!file.size) return null; // fichiers vides : signalés à part
  const duration = file.duration ? file.duration.toFixed(2) : 'nd';
  return `${String(file.name).toLocaleLowerCase('fr')}|${file.size}|${duration}`;
}

function markDuplicates(files) {
  const first = new Map();
  for (const file of files) {
    const key = duplicateFingerprint(file);
    if (!key) continue;
    const original = first.get(key);
    if (!original) { first.set(key, file); continue; }
    file.duplicateOf = original.id;
    if (!file.duplicateManuallyChanged && !file.includeManuallyChanged) {
      file.include = false;
      file.duplicateAutoExcluded = true;
    }
  }
  return files;
}

function nearestFrameRate(fps) {
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return FRAME_RATES.reduce((best, rate) => (Math.abs(rate - fps) < Math.abs(best - fps) ? rate : best));
}

function dominantFormat(files) {
  const formats = new Map();
  for (const file of files) {
    if (!file.width || !file.height) continue;
    const fps = nearestFrameRate(file.fps);
    const key = `${file.width}x${file.height}@${fps || '?'}`;
    formats.set(key, { width: file.width, height: file.height, fps, count: (formats.get(key)?.count || 0) + 1 });
  }
  const ordered = [...formats.values()].sort((a, b) => b.count - a.count || b.width * b.height - a.width * a.height);
  if (ordered.length && (ordered.length === 1 || ordered[0].count > ordered[1].count)) return { ...ordered[0], fps: ordered[0].fps || 24 };
  return { width: 1920, height: 1080, fps: ordered.find((item) => item.fps)?.fps || 24 };
}

// Associe les éléments renvoyés par MediaPool.ImportMedia aux fichiers demandés,
// par chemin et non par position (Resolve n'en renvoie que les réussis).
function matchImported(batch, importedPaths) {
  const remaining = new Map();
  importedPaths.forEach((p, index) => {
    if (!p) return;
    const key = path.resolve(p).normalize('NFC').toLowerCase();
    if (!remaining.has(key)) remaining.set(key, []);
    remaining.get(key).push(index);
  });
  const matched = [];
  const failed = [];
  for (const file of batch) {
    const indexes = remaining.get(path.resolve(file.filePath).normalize('NFC').toLowerCase());
    if (indexes?.length) matched.push({ file, index: indexes.shift() });
    else failed.push(file);
  }
  return { matched, failed };
}

module.exports = {
  VIDEO, AUDIO, STILL, GRAPHIC, SEQUENCE, SUPPORTED, FRAME_RATES,
  SYNC_AUDIO, cleanText, categoryFor, normalizeBrand, normalizeDate, normalizeTime, localDate, localTime,
  parseTimecode, secondsOfDay, sortForTimeline,
  sidecarCandidates, filterSidecars, parseSidecarXml,
  duplicateFingerprint, markDuplicates, nearestFrameRate, dominantFormat, matchImported
};
