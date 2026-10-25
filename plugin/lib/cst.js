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
  [/\bFX3\b|\bFX6V?\b|\bFX9\b|\bBURANO\b|\bMPC-2610\b/i, 'sony-slog3'],
  [/\bC50\b|\bC70\b/i, 'canon-clog2'],
  [/\bR5(?:\s?C)?\b/i, 'canon-clog3']
];

function profileForCamera(brand = '', model = '') {
  const input = `${brand || ''} ${model || ''}`;
  return CAMERAS.find(([pattern]) => pattern.test(input))?.[1] || null;
}

// Profil à partir de la caméra et, si le fichier l’indique (Sony), du gamma enregistré.
// Retourne un profil, 'none' (gamma non log : pas de CST) ou null (inconnu).
function profileFromMetadata(brand = '', model = '', captureGamma = '') {
  const gamma = String(captureGamma || '').toLowerCase();
  if (gamma) {
    if (/s-?log3/.test(gamma)) return 'sony-slog3';
    if (/log/.test(gamma)) return null; // autre log (S-Log2…) : pas de preset, à choisir à la main
    return 'none'; // Rec.709, HLG, S-Cinetone… : déjà en vidéo
  }
  return profileForCamera(brand, model);
}

function presetFileName(profile, output) {
  if (!PROFILES[profile] || !OUTPUTS[output]) return null;
  return `${profile}_${output}.drx`;
}

module.exports = { PROFILES, OUTPUTS, profileForCamera, profileFromMetadata, presetFileName };
