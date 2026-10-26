(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPM_I18N = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Les textes sources sont en français : la clé d'une traduction est le texte français lui-même.
  // Un texte sans traduction reste en français, jamais une clé vide ni un identifiant technique.

  const PLURALS = {
    // fr : 0 et 1 sont au singulier ; en : seul 1 est au singulier.
    fr: (count) => Math.abs(count) > 1,
    en: (count) => count !== 1
  };

  function normalizeLocale(value) {
    const code = String(value || '').toLowerCase().slice(0, 2);
    return code === 'fr' ? 'fr' : 'en';
  }

  function create(locale, dictionaries = {}) {
    const language = normalizeLocale(locale);
    const dictionary = language === 'fr' ? {} : (dictionaries[language] || {});
    const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text);
    const t = (key, vars) => fill(Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : key, vars);
    // Pluriel : `one` et `other` sont deux textes français, traduits chacun ; {n} vaut le nombre.
    t.plural = (count, one, other, vars) => t(PLURALS[language](count) ? other : one, { n: count, ...vars });
    t.language = language;
    t.has = (key) => language === 'fr' || Object.prototype.hasOwnProperty.call(dictionary, key);
    return t;
  }

  // Traduit un document HTML sur place : nœuds texte et attributs (placeholder, aria-label, title).
  function translateDocument(doc, t) {
    if (t.language === 'fr') return;
    const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE'].includes(parent.tagName)) continue;
      const normalized = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (!normalized || !t.has(normalized)) continue;
      const lead = node.nodeValue.match(/^\s*/)[0];
      const trail = node.nodeValue.match(/\s*$/)[0];
      node.nodeValue = `${lead}${t(normalized)}${trail}`;
    }
    for (const element of doc.body.querySelectorAll('[placeholder],[aria-label],[title]')) {
      for (const attribute of ['placeholder', 'aria-label', 'title']) {
        const value = element.getAttribute(attribute);
        if (value && t.has(value.trim())) element.setAttribute(attribute, t(value.trim()));
      }
    }
    if (doc.title && t.has(doc.title)) doc.title = t(doc.title);
    doc.documentElement.lang = t.language;
  }

  return { create, normalizeLocale, translateDocument };
}));
