'use strict';
// Rapport de création exportable (TXT ou CSV), construit à partir du résultat de createProjectInResolve.
const { t, getLanguage } = require('./t');

const STATUS_LABELS = () => ({ imported: t('Importé'), failed: t('Échec'), unverified: t('À vérifier') });

function colorSections(result) {
  const color = result.colorReport;
  if (!color) return [];
  const method = color.method === 'managed' ? t('Gestion couleur') : 'Color Space Transform';
  const rows = [
    [method, t('Appliqué'), t('{n} plan(s) · sortie {output}', { n: color.applied, output: color.output || '' }).trim()],
    ...(color.skipped ? [[method, t('Déjà en Rec.709'), t('{n} plan(s)', { n: color.skipped })]] : []),
    ...color.unrecognized.map((name) => [method, t('Profil non reconnu'), name]),
    ...color.failed.map((name) => [method, t('Refusé par Resolve'), name]),
    ...(color.refusedSettings || []).map((key) => [method, t('Réglage refusé'), key])
  ];
  return rows;
}

function syncRows(result) {
  const sync = result.syncReport;
  if (!sync) return [];
  const section = t('Synchro du son');
  if (sync.unavailable) return [[section, t('Indisponible'), sync.mode]];
  const rows = sync.days.map((day) => [section, day.ok ? t('Synchronisé') : t('Non confirmé'), t('{day} · {video} image(s), {audio} son(s) · {mode}', { day: day.day, video: day.video, audio: day.audio, mode: sync.mode })]);
  if (sync.unmatchedAudio) rows.push([section, t('Son sans image'), t('{n} fichier(s) sans rush le même jour', { n: sync.unmatchedAudio })]);
  return rows;
}

// Lignes communes : [section, statut, détail]
function reportRows(result) {
  const rows = [];
  const statuses = STATUS_LABELS();
  const refused = t('Refusé par Resolve');
  for (const file of result.files || []) rows.push([t('Import'), statuses[file.status] || file.status, `${file.name} · ${file.path}`]);
  rows.push(...colorSections(result));
  rows.push(...syncRows(result));
  if (result.multicamReport) {
    const section = t('Multicam');
    for (const day of result.multicamReport.days) rows.push([section, day.ok ? t('Créé') : refused, t('{day} · {n} angle(s)', { day: day.day, n: day.angles })]);
    for (const day of result.multicamReport.skipped) rows.push([section, t('Ignoré'), t('{day} · un seul rush', { day })]);
  }
  if (result.proxyReport) {
    rows.push([t('Proxies'), t('Liés'), t('{n} plan(s)', { n: result.proxyReport.linked })]);
    for (const name of result.proxyReport.failed) rows.push([t('Proxies'), refused, name]);
  }
  if (result.metadataReport) for (const [key, count] of Object.entries(result.metadataReport.refused)) rows.push([t('Métadonnées'), refused, t('{key} · {n} plan(s)', { key, n: count })]);
  if (result.clipColorReport?.failed) rows.push([t('Couleur de clip'), refused, t('{n} plan(s)', { n: result.clipColorReport.failed })]);
  for (const message of result.resolveWarnings || []) rows.push(['Resolve', t('Avertissement'), message]);
  return rows;
}

function buildTextReport(result, date = new Date()) {
  const lines = [
    t('Rapport RPM — {name}', { name: result.projectName }),
    date.toLocaleString(getLanguage() === 'fr' ? 'fr-FR' : 'en-GB'),
    '',
    t('Médias importés : {n}', { n: result.importedCount }),
    t('Doublons ignorés : {n}', { n: result.excludedCount }),
    t('Chutiers créés : {list}', { list: (result.createdBins || []).join(', ') }),
    t('Timeline : {value}', { value: result.timelineName ? `${result.timelineName} · ${result.timelineFormat}` : t('aucune') })
  ];
  if (result.warning) lines.push('', t('À vérifier : {warning}', { warning: result.warning }));
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
  const lines = [[t('Section'), t('Statut'), t('Détail')], ...reportRows(result)].map((row) => row.map(csvCell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

module.exports = { buildTextReport, buildCsvReport, reportRows };
