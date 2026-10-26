'use strict';
// Rapport de création exportable (TXT ou CSV), construit à partir du résultat de createProjectInResolve.

const STATUS_LABELS = { imported: 'Importé', failed: 'Échec', unverified: 'À vérifier' };

function colorSections(result) {
  const color = result.colorReport;
  if (!color) return [];
  const method = color.method === 'managed' ? 'Gestion couleur' : 'Color Space Transform';
  const rows = [
    [method, 'Appliqué', `${color.applied} plan(s) · sortie ${color.output || ''}`.trim()],
    ...(color.skipped ? [[method, 'Déjà en Rec.709', `${color.skipped} plan(s)`]] : []),
    ...color.unrecognized.map((name) => [method, 'Profil non reconnu', name]),
    ...color.failed.map((name) => [method, 'Refusé par Resolve', name]),
    ...(color.refusedSettings || []).map((key) => [method, 'Réglage refusé', key])
  ];
  return rows;
}

function syncRows(result) {
  const sync = result.syncReport;
  if (!sync) return [];
  if (sync.unavailable) return [['Synchro du son', 'Indisponible', sync.mode]];
  const rows = sync.days.map((day) => ['Synchro du son', day.ok ? 'Synchronisé' : 'Non confirmé', `${day.day} · ${day.video} image(s), ${day.audio} son(s) · ${sync.mode}`]);
  if (sync.unmatchedAudio) rows.push(['Synchro du son', 'Son sans image', `${sync.unmatchedAudio} fichier(s) sans rush le même jour`]);
  return rows;
}

// Lignes communes : [section, statut, détail]
function reportRows(result) {
  const rows = [];
  for (const file of result.files || []) rows.push(['Import', STATUS_LABELS[file.status] || file.status, `${file.name} · ${file.path}`]);
  rows.push(...colorSections(result));
  rows.push(...syncRows(result));
  if (result.multicamReport) {
    for (const day of result.multicamReport.days) rows.push(['Multicam', day.ok ? 'Créé' : 'Refusé par Resolve', `${day.day} · ${day.angles} angle(s)`]);
    for (const day of result.multicamReport.skipped) rows.push(['Multicam', 'Ignoré', `${day} · un seul rush`]);
  }
  if (result.proxyReport) {
    rows.push(['Proxies', 'Liés', `${result.proxyReport.linked} plan(s)`]);
    for (const name of result.proxyReport.failed) rows.push(['Proxies', 'Refusé par Resolve', name]);
  }
  if (result.metadataReport) for (const [key, count] of Object.entries(result.metadataReport.refused)) rows.push(['Métadonnées', 'Refusé par Resolve', `${key} · ${count} plan(s)`]);
  if (result.clipColorReport?.failed) rows.push(['Couleur de clip', 'Refusé par Resolve', `${result.clipColorReport.failed} plan(s)`]);
  for (const message of result.resolveWarnings || []) rows.push(['Resolve', 'Avertissement', message]);
  return rows;
}

function buildTextReport(result, date = new Date()) {
  const lines = [
    `Rapport RPM — ${result.projectName}`,
    date.toLocaleString('fr-FR'),
    '',
    `Médias importés : ${result.importedCount}`,
    `Doublons ignorés : ${result.excludedCount}`,
    `Chutiers créés : ${(result.createdBins || []).join(', ')}`,
    `Timeline : ${result.timelineName ? `${result.timelineName} · ${result.timelineFormat}` : 'aucune'}`
  ];
  if (result.warning) lines.push('', `À vérifier : ${result.warning}`);
  let section = '';
  for (const [name, status, detail] of reportRows(result)) {
    if (name !== section) { lines.push('', name.toUpperCase()); section = name; }
    lines.push(`  [${status}] ${detail}`);
  }
  return `${lines.join('\n')}\n`;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Séparateur « ; » et BOM UTF-8 : s'ouvre directement dans Excel en français.
function buildCsvReport(result) {
  const lines = [['Section', 'Statut', 'Détail'], ...reportRows(result)].map((row) => row.map(csvCell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

module.exports = { buildTextReport, buildCsvReport, reportRows };
