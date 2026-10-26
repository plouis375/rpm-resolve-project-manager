'use strict';
// Traducteur partagé par les modules sans interface : il parle français tant que main.js ne choisit pas une autre langue.
const i18n = require('../i18n');
const english = require('../i18n/en');

let translator = i18n.create('fr', { en: english });

function setLocale(locale) { translator = i18n.create(locale, { en: english }); }
const t = (key, vars) => translator(key, vars);
t.plural = (count, one, other, vars) => translator.plural(count, one, other, vars);
t.has = (key) => translator.has(key);

module.exports = { t, setLocale, getLanguage: () => translator.language };
