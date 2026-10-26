'use strict';
// Correspondance caméra → preset Color Space Transform (.drx dans plugin/presets).
// Les presets ont été exportés depuis Resolve : un node CST réglé par profil.

const PROFILES = {
  'sony-slog3': 'S-Gamut3.Cine / S-Log3',
  'canon-clog2': 'Cinema Gamut / Canon Log 2',
  'canon-clog3': 'Cinema Gamut / Canon Log 3'
};

const OUTPUTS = { rec709a: 'Rec.709-A', gamma24: 'Gamma 2.4' };

// Mots entiers : « FX3 » ne doit pas attraper « FX30 ».
const CAMERAS = [
  [/\bFX3\b|\bFX30\b|\bFX6V?\b|\bFX9\b|\bBURANO\b|\bMPC-2610\b|\bILCE-(?:7SM3|7M4|1|7RM5)\b|\bA7S ?III\b|\bA7 ?IV\b|\bZV-E1\b|\bFR7\b/i, 'sony-slog3'],
  [/\bC50\b|\bC70\b/i, 'canon-clog2'],
  [/\bR5(?:\s?C)?\b/i, 'canon-clog3']
];

function profileForCamera(brand = '', model = '') {
  const input = `${brand || ''} ${model || ''}`;
  return CAMERAS.find(([pattern]) => pattern.test(input))?.[1] || null;
}

// Gamma enregistré dans un XML (Sony, Canon) → profil. Les motifs sont tolérants : « canon-log2 », « c-log2 », « clog2 »…
const GAMMA_PATTERNS = [
  [/\bs[\s_-]?log3/, 'sony-slog3'],
  [/\bc[\s_-]?log[\s_-]?3|\bcanon[\s_-]?log[\s_-]?3/, 'canon-clog3'],
  [/\bc[\s_-]?log[\s_-]?2|\bcanon[\s_-]?log[\s_-]?2/, 'canon-clog2']
];

// Fonction de transfert lue par ffprobe (color_transfer). Seuls les cas sans ambiguïté comptent :
// beaucoup de caméras étiquettent leurs fichiers log « bt709 », donc bt709 ne prouve rien.
function profileFromTransfer(colorTransfer = '') {
  const transfer = String(colorTransfer || '').toLowerCase();
  if (transfer === 'arib-std-b67' || transfer === 'smpte2084') return 'none'; // HLG, PQ : déjà en vidéo
  return null;
}

// Profil à partir du gamma du XML, puis de la fonction de transfert du fichier, puis de la caméra.
// Retourne un profil, 'none' (gamma non log : pas de CST) ou null (inconnu).
function profileFromMetadata(brand = '', model = '', captureGamma = '', colorTransfer = '') {
  const gamma = String(captureGamma || '').toLowerCase();
  if (gamma) {
    const match = GAMMA_PATTERNS.find(([pattern]) => pattern.test(gamma));
    if (match) return match[1];
    if (/log/.test(gamma)) return null; // autre log (S-Log2…) : pas de profil, à choisir à la main
    return 'none'; // Rec.709, HLG, S-Cinetone… : déjà en vidéo
  }
  return profileFromTransfer(colorTransfer) || profileForCamera(brand, model);
}

function presetFileName(profile, output) {
  if (!PROFILES[profile] || !OUTPUTS[output]) return null;
  return `${profile}_${output}.drx`;
}

module.exports = { PROFILES, OUTPUTS, profileForCamera, profileFromMetadata, profileFromTransfer, presetFileName };
