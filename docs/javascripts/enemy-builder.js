// Enemy Builder (tools/enemy-builder.md): a quick creature maker. Pick type, Hit Dice and size, spread ability scores
// and skill ranks, choose feats, weapons and spells, and it works out the stat block: hp, AC, saves, attacks with
// iteratives, spell DCs and what each spell rolls at the chosen caster level. "Copy for Roll20" puts it on the
// clipboard in the same form as the monster pages' Roll20 panels (docs/javascripts/roll20-export.js).
// Data: tools/spell-data.json (tools/build-spells.js) and tools/enemy-builder-data.json (tools/build-enemy-builder.js).
// The creature is kept in this browser (localStorage); enemies can be saved by name or to a file.
(function () {
  'use strict';
  var root = document.getElementById('enemy-builder');
  if (!root) return;
  var cfgEl = document.getElementById('__config');
  var BASE = new URL(cfgEl ? JSON.parse(cfgEl.textContent).base.replace(/\/?$/, '/') : '../../', location.href);
  // data-mode: a subsystem with three classes that pick class features by price (tools/build-starwars-builder.js):
  // "starwars" (tools/starwars-builder.md), "chakra" (Naruto, tools/naruto-builder.md), "superheroes" (Heroes,
  // tools/heroes-builder.md). They share everything; this says what each calls things and what it has of its own.
  var MODE = root.getAttribute('data-mode') || '';
  var SUBS = {
    starwars: { data: 'starwars-builder-data.json', res: 'stamina', powers: 'Force powers', page: 'campaign-systems/star-wars/', powersPage: 'campaign-systems/star-wars/force-powers/',
      force: true, karma: true, lang: 'Basic', noClass: '— no class (a creature or droid) —',
      skills: { 'Knowledge (arcana)': 'Science', 'Knowledge (planes)': 'Computers', 'Knowledge (engineering)': 'Engineering', 'Disable Device': 'Slicing' },
      species: ['human', 'human', 'twi\'lek', 'zabrak', 'rodian', 'trandoshan', 'chiss', 'togruta', 'devaronian', 'weequay'] },
    chakra: { data: 'chakra-builder-data.json', res: 'chakra', powers: 'Jutsu', page: 'campaign-systems/chakra/chakra-system/', powersPage: 'campaign-systems/chakra/jutsu/',
      elements: true, lang: 'Common', noClass: '— no class (a creature or summon) —', skills: {}, species: ['human'] },
    superheroes: { data: 'superheroes-builder-data.json', res: 'stamina', powers: 'Powers', page: 'campaign-systems/superheroes/', powersPage: 'campaign-systems/superheroes/spells-and-abilities/',
      lang: 'Common', noClass: '— no class (a creature or robot) —', skills: {}, species: ['human', 'human', 'mutant', 'alien', 'android', 'metahuman'] }
  };
  var SUB = SUBS[MODE] || null, SWM = !!SUB;
  var KEY = SWM ? MODE + '-builder:current' : 'enemy-builder:current', LIB = SWM ? MODE + '-builder:saved' : 'enemy-builder:saved';
  var SWD = null, FP_BY = {}, SW_ENTRIES = {}, SW_INFO = {};
  var PRICE_PTS = { iconic: 4, op: 4, common: 2, weak: 1 }, PRICE_LABEL = { iconic: 'Iconic', op: 'OP', common: 'Common', weak: 'Weak' };
  var SW_SKILL = SUB ? SUB.skills : {};
  // the internal caster kind "Force Powers" is each subsystem's own powers (Force powers, jutsu, powers)
  function kindLabel(k) { return k === 'Force Powers' && SUB ? SUB.powers : k; }
  var SW_COST = ['0–3', '1–10', '11–20', '21–30', '31–40', '41–50', '51–60', '61–70', '71–80', '81–100'];

  // ---------- rules tables ----------
  var ABIL = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
  var SIZES = {
    Fine: { ac: 8, cmb: -8, stealth: 16, fly: 8, construct: 0 }, Diminutive: { ac: 4, cmb: -4, stealth: 12, fly: 6, construct: 0 },
    Tiny: { ac: 2, cmb: -2, stealth: 8, fly: 4, construct: 0 }, Small: { ac: 1, cmb: -1, stealth: 4, fly: 2, construct: 10 },
    Medium: { ac: 0, cmb: 0, stealth: 0, fly: 0, construct: 20 }, Large: { ac: -1, cmb: 1, stealth: -4, fly: -2, construct: 30 },
    Huge: { ac: -2, cmb: 2, stealth: -8, fly: -4, construct: 40 }, Gargantuan: { ac: -4, cmb: 4, stealth: -12, fly: -6, construct: 60 },
    Colossal: { ac: -8, cmb: 8, stealth: -16, fly: -8, construct: 80 }
  };
  var SIZE_ORDER = Object.keys(SIZES);
  var TYPES = {
    aberration: { die: 8, bab: '3/4', good: ['Will'], ranks: 4 }, animal: { die: 8, bab: '3/4', good: ['Fort', 'Ref'], ranks: 2 },
    construct: { die: 10, bab: 'full', good: [], ranks: 2 }, dragon: { die: 12, bab: 'full', good: ['Fort', 'Ref', 'Will'], ranks: 6 },
    fey: { die: 6, bab: '1/2', good: ['Ref', 'Will'], ranks: 6 }, humanoid: { die: 8, bab: '3/4', good: ['Fort'], ranks: 2 },
    'magical beast': { die: 10, bab: 'full', good: ['Fort', 'Ref'], ranks: 2 }, 'monstrous humanoid': { die: 10, bab: 'full', good: ['Ref', 'Will'], ranks: 4 },
    ooze: { die: 8, bab: '3/4', good: [], ranks: 2 }, outsider: { die: 10, bab: 'full', good: ['Fort', 'Will'], ranks: 6 },
    plant: { die: 8, bab: '3/4', good: ['Fort'], ranks: 2 }, undead: { die: 8, bab: '3/4', good: ['Will'], ranks: 4 },
    vermin: { die: 8, bab: '3/4', good: ['Fort'], ranks: 2 }
  };
  var ALIGN = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'];
  var XP = { '1/8': 50, '1/6': 65, '1/4': 100, '1/3': 135, '1/2': 200, 1: 400, 2: 600, 3: 800, 4: 1200, 5: 1600, 6: 2400, 7: 3200, 8: 4800,
    9: 6400, 10: 9600, 11: 12800, 12: 19200, 13: 25600, 14: 38400, 15: 51200, 16: 76800, 17: 102400, 18: 153600, 19: 204800, 20: 307200,
    21: 409600, 22: 614400, 23: 819200, 24: 1228800, 25: 1638400, 26: 2457600, 27: 3276800, 28: 4915200, 29: 6553600, 30: 9830400 };
  var CRS = ['1/8', '1/6', '1/4', '1/3', '1/2'].concat(Array.apply(null, Array(30)).map(function (_, i) { return String(i + 1); }));
  var KNOW = ['arcana', 'dungeoneering', 'engineering', 'geography', 'history', 'local', 'nature', 'nobility', 'planes', 'religion'];
  var SKILLS = [['Acrobatics', 'Dex'], ['Appraise', 'Int'], ['Bluff', 'Cha'], ['Climb', 'Str'], ['Diplomacy', 'Cha'], ['Disable Device', 'Dex'],
    ['Disguise', 'Cha'], ['Escape Artist', 'Dex'], ['Fly', 'Dex'], ['Handle Animal', 'Cha'], ['Heal', 'Wis'], ['Intimidate', 'Cha']]
    .concat(KNOW.map(function (k) { return ['Knowledge (' + k + ')', 'Int']; }))
    .concat([['Linguistics', 'Int'], ['Perception', 'Wis'], ['Ride', 'Dex'], ['Sense Motive', 'Wis'], ['Sleight of Hand', 'Dex'],
      ['Spellcraft', 'Int'], ['Stealth', 'Dex'], ['Survival', 'Wis'], ['Swim', 'Str'], ['Use Magic Device', 'Cha']]);
  var TRAINED_ONLY = /^(Disable Device|Handle Animal|Knowledge|Linguistics|Profession|Sleight of Hand|Spellcraft|Use Magic Device)/;
  var ACP_SKILLS = { Acrobatics: 1, Climb: 1, 'Disable Device': 1, 'Escape Artist': 1, Fly: 1, Ride: 1, 'Sleight of Hand': 1, Stealth: 1, Swim: 1 };
  // natural attacks (Medium damage) and whether they are secondary by default
  var NATURAL = { bite: ['1d6'], claw: ['1d4'], gore: ['1d6'], slam: ['1d4'], sting: ['1d4'], talons: ['1d4'], hoof: ['1d4', 1], tentacle: ['1d4', 1],
    wing: ['1d4', 1], pincers: ['1d6', 1], 'tail slap': ['1d6', 1], 'unarmed strike': ['1d3'] };
  var FINESSE = /^(rapier|whip|spiked chain|chain, spiked|elven curve blade|curve blade, elven)$/i;
  var DICE = ['1d2', '1d3', '1d4', '1d6', '1d8', '1d10', '2d6', '2d8', '3d6', '3d8', '4d6', '4d8', '6d6', '6d8', '8d6', '8d8', '12d6', '12d8', '16d6'];
  var SAME = { '2d4': '1d8', '1d12': '2d6', '2d10': '4d6' };
  var POINT_COST = { 7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17 };

  // ---------- helpers ----------
  function mod(s) { return Math.floor((s - 10) / 2); }
  function sgn(n) { return (n < 0 ? '–' : '+') + Math.abs(n); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function slug(s) { return String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function ord(n) { return n === 0 ? '0' : n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function h(tag, attrs) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    }
    return e;
  }
  // a number with − / + buttons; once clicked, the mouse wheel raises or lowers it (Shift: by 5), so scrolling the page past it changes nothing
  function numBox(get, set, opt) {
    opt = opt || {};
    var lim = function (v) {
      var lo = typeof opt.min === 'function' ? opt.min() : opt.min, hi = typeof opt.max === 'function' ? opt.max() : opt.max;
      if (lo != null && v < lo) v = lo; if (hi != null && v > hi) v = hi; return v;
    };
    var input = h('input', { type: 'number', class: 'eb-n', value: get() });
    var put = function (v) { v = lim(v); set(v); input.value = get(); changed(); };
    var step = function (d) { put((parseInt(input.value, 10) || 0) + d); };
    input.addEventListener('input', function () { var v = parseInt(input.value, 10); if (!isNaN(v)) { set(lim(v)); changed(); } });
    input.addEventListener('change', function () { input.value = get(); });
    var wrap = h('span', { class: 'eb-num' + (opt.wide ? ' eb-wide' : '') },
      h('button', { type: 'button', class: 'eb-step', text: '−', tabIndex: -1, onclick: function () { step(-1); } }), input,
      h('button', { type: 'button', class: 'eb-step', text: '+', tabIndex: -1, onclick: function () { step(1); } }));
    wheelArm(wrap, input, step);
    return wrap;
  }
  // the wheel changes a number only after a click on it, and only until the mouse leaves it: scrolling the page past a box changes nothing
  function wheelArm(wrap, input, step) {
    var armed = false;
    wrap.addEventListener('mousedown', function () { armed = true; });
    wrap.addEventListener('mouseleave', function () { armed = false; });
    input.addEventListener('blur', function () { armed = false; });
    wrap.addEventListener('wheel', function (e) { if (!armed) return; e.preventDefault(); step((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1)); }, { passive: false });
  }
  // CR: like numBox, but it steps through 1/8, 1/6, 1/4, 1/3, 1/2, 1, 2... and takes typed fractions
  function crBox() {
    var input = h('input', { type: 'text', class: 'eb-n', value: S.cr, inputMode: 'decimal' });
    var put = function (v) { S.cr = v; input.value = v; changed(); };
    var step = function (d) {
      var i = CRS.indexOf(S.cr);
      if (i < 0) { var n = parseFloat(S.cr) || 1; i = CRS.indexOf(String(Math.max(1, Math.round(n)))); }
      put(CRS[Math.max(0, Math.min(CRS.length - 1, i + d))]);
    };
    input.addEventListener('input', function () { S.cr = input.value.trim(); changed(); });
    var wrap = h('span', { class: 'eb-num' },
      h('button', { type: 'button', class: 'eb-step', text: '−', tabIndex: -1, onclick: function () { step(-1); } }), input,
      h('button', { type: 'button', class: 'eb-step', text: '+', tabIndex: -1, onclick: function () { step(1); } }));
    wheelArm(wrap, input, step);
    return wrap;
  }
  function textBox(get, set, opt) {
    opt = opt || {};
    var i = h(opt.area ? 'textarea' : 'input', { type: opt.area ? null : 'text', class: 'eb-t' + (opt.cls ? ' ' + opt.cls : ''), value: get() || '', placeholder: opt.ph || '', list: null });
    if (opt.list) i.setAttribute('list', opt.list);
    if (opt.area) i.rows = opt.rows || 2;
    i.addEventListener('input', function () { set(i.value); changed(); if (opt.after) opt.after(i.value); });
    return i;
  }
  function select(options, get, set, after) {
    var s = h('select', { class: 'eb-s' }, options.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      return h('option', { value: v, text: t });
    }));
    s.value = get();
    s.addEventListener('change', function () { set(s.value); changed(); if (after) after(s.value); });
    return s;
  }
  function check(get, set, label, after) {
    var c = h('input', { type: 'checkbox', checked: !!get() });
    c.addEventListener('change', function () { set(c.checked); changed(); if (after) after(c.checked); });
    return h('label', { class: 'eb-check' }, c, label ? ' ' + label : null);
  }
  function field(label, control, hint) { return h('label', { class: 'eb-field' }, h('span', { class: 'eb-lab', text: label }), control, hint ? (typeof hint === 'string' ? h('small', { text: hint }) : hint) : null); }
  function calc(key) { return h('span', { class: 'eb-calc', 'data-calc': key }); }

  // damage dice for another size, from the Medium dice
  function sizeDice(d, size) {
    var steps = SIZE_ORDER.indexOf(size) - SIZE_ORDER.indexOf('Medium');
    d = SAME[d] || d;
    var i = DICE.indexOf(d);
    if (i < 0 || !steps) return d;
    for (; steps > 0; steps--) i = Math.min(DICE.length - 1, i + (i <= DICE.indexOf('1d6') ? 1 : 2));
    for (; steps < 0; steps++) i = Math.max(0, i - (i <= DICE.indexOf('1d8') ? 1 : 2));
    return DICE[i];
  }
  // "1 min./level (D)" at CL 7 -> "7 min. (D)" (the same as tools/spell-rolls.js)
  var NUMS = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  function durationAt(d, cl) {
    d = String(d || '');
    var re = /(\d+)\s*(rounds?|min\.|minutes?|hours?|hr\.|days?|weeks?)\s*(?:\/\s*|per\s+)(?:(\d+|two|three|four|five|six)\s+)?(?:caster\s+)?levels?/gi;
    if (!d.match(re)) return '';
    var out = d.replace(re, function (all, k, unitText, perText) {
      var per = perText ? (NUMS[perText.toLowerCase()] || +perText) : 1;
      var n = +k * (per > 1 ? Math.floor(cl / per) : cl), unit = unitText.toLowerCase();
      if (/^min/.test(unit)) unit = 'min.'; else if (/^hr|^hour/.test(unit)) unit = n === 1 ? 'hour' : 'hours';
      else unit = unit.replace(/s$/, '') + (n === 1 ? '' : 's');
      return n + ' ' + unit;
    }).replace(/^1 round \+ (\d+) rounds?$/, function (_, k) { return +k ? (1 + +k) + ' rounds' : '1 round'; });
    return out.replace(/;?\s*see text$/i, '').trim();
  }

  // ---------- state ----------
  function blank() {
    return { name: 'New Enemy', cr: '1', align: 'N', size: 'Medium', type: 'humanoid', subtypes: '', hd: 1, die: 8, bab: '3/4',
      good: { Fort: true, Ref: false, Will: false }, ranks: 2, bonusRanks: 0, bonusFeats: 0,
      abil: { Str: 10, Dex: 10, Con: 10, Int: 10, Wis: 10, Cha: 10 }, race: { n: '', adj: {} }, skills: {}, feats: [],
      armor: '', armorEnh: 0, shield: '', shieldEnh: 0, natural: 0, deflection: 0, dodge: 0, hpMisc: 0, maxHp: true, initMisc: 0,
      saveMisc: { Fort: 0, Ref: 0, Will: 0 }, speed: '30 ft.', senses: '', languages: 'Common', defense: '', aura: '', sq: '', gear: '',
      specialAttacks: '', weapons: [], casters: [], special: [], classes: [], sw: { karma: 0, force: false, abil: 'Wis' }, mythic: { tier: 0, picks: [] } };
  }
  var S = blank();
  try { var saved = JSON.parse(localStorage.getItem(KEY)); if (saved) S = Object.assign(blank(), saved); } catch (e) {}
  function store() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function library() { try { return JSON.parse(localStorage.getItem(LIB)) || {}; } catch (e) { return {}; } }
  // ---------- race: its ability score modifiers go on top of the scores spread in the Ability scores card ----------
  function raceAdj(a) { return (S.race && S.race.adj && S.race.adj[a]) || 0; }
  function score(a) { return (S.abil[a] || 0) + raceAdj(a); }
  function raceList() { return DATA.races || []; }
  function raceData(n) { return raceList().filter(function (r) { return r.n === n; })[0] || null; }
  // a race's fixed modifiers, plus its "+2 to one ability score" on the one chosen
  function raceMods(r, any) {
    var adj = {}; Object.keys(r.adj || {}).forEach(function (k) { adj[k] = r.adj[k]; });
    if (r.any && any) adj[any] = (adj[any] || 0) + r.any.v;
    return adj;
  }
  // a type's racial hit die, BAB, skill ranks and good saves
  function typeDefaults(t) {
    var d = TYPES[t]; if (!d) return;
    S.die = d.die; S.bab = d.bab; S.ranks = d.ranks;
    S.good = { Fort: d.good.indexOf('Fort') >= 0, Ref: d.good.indexOf('Ref') >= 0, Will: d.good.indexOf('Will') >= 0 };
    if (t === 'humanoid' && !d.good.length) S.good.Fort = true;
  }
  // a race from the list sets its modifiers, size, speed, type and subtypes (all still editable); custom keeps what is there
  function applyRace(n) {
    if (!n) { S.race = { n: '', adj: {} }; return; }
    if (n === 'custom') { S.race = { n: 'custom', adj: S.race && S.race.n === 'custom' ? S.race.adj : {} }; return; }
    var r = raceData(n); if (!r) return;
    var any = r.any ? (r.any.from || ABIL)[0] : '';
    S.race = { n: r.n, adj: raceMods(r, any), any: any };
    S.size = r.size || 'Medium'; S.speed = r.speed || '30 ft.'; S.subtypes = r.sub || '';
    if (r.type && TYPES[r.type] && r.type !== S.type) { S.type = r.type; typeDefaults(r.type); }
  }

  var DATA = { weapons: [], armors: [], feats: [], rolls: {}, classes: [] }, SPELLS = {}, SPELL_BY_NAME = {}, CLASSES = [];
  var CLASS_BY = {}, ARCH = {}, lastD = null;
  // a class's features by level and its archetypes (the archetype picker's data), loaded when the class is picked
  function loadArch(slug) {
    if (!slug || ARCH[slug] || !CLASS_BY[slug] || !CLASS_BY[slug].arch) return;
    ARCH[slug] = 'loading';
    fetch(new URL('tools/archetypes/' + slug + '.json', BASE)).then(function (r) { return r.json(); })
      .then(function (d) { ARCH[slug] = d; redrawAll(); }, function () { ARCH[slug] = { units: [], archetypes: [] }; redrawAll(); });
  }
  function stripHtml(t) { var d = document.createElement('div'); d.innerHTML = String(t || '').replace(/@@/g, ''); return d.textContent.replace(/\s+/g, ' ').trim(); }
  function shortText(t, n) {
    if (t.length <= n) return t;
    var cut = t.slice(0, n), dot = cut.lastIndexOf('. ');
    return dot > n / 2 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…';
  }
  function capFirst(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  // the features a class gives at its level, with the chosen archetypes' changes
  // enemies saved with the earlier rogue and wild talent pickers kept their picks in c.talents and c.wild
  function oldChoices(c) {
    [['talents', 'rogue-talent'], ['wild', 'utility-talent']].forEach(function (m) {
      if (!Array.isArray(c[m[0]])) return;
      c.choices = c.choices || {};
      var st = c.choices[m[1]] = c.choices[m[1]] || { picks: [] };
      c[m[0]].forEach(function (n) { if (st.picks.indexOf(n) < 0) st.picks.push(n); });
      delete c[m[0]];
    });
  }
  function classFeatures(c) {
    oldChoices(c);
    var d = CLASS_BY[c.s], L = c.lvl || 1, out = [], bonus = 0;
    if (!d) return { list: out, bonusFeats: 0 };
    if (d.sw) {
      var extra = 0;
      (c.picks || []).forEach(function (p) {
        if (p.slot > L || (p.extra && p.extra > extraCount())) return;
        var info = SW_INFO[p.n + '|' + p.link] || {}, prestige = /prestige-classes\//.test(p.link || '');
        var fl = info.feats ? info.feats.filter(function (l) { return l <= L; }).length : 0;
        extra += fl;
        // a prestige class feature counts 3 levels higher, so it scales with the level less 3
        out.push({ name: p.n, type: '', text: p.text || info.text || PRICE_LABEL[p.price] + ' class feature (' + ord(p.lvl) + ' level).', link: p.link, lvl: p.slot, price: p.price, sw: true,
          src: srcOf(p.link), fxL: Math.max(1, L - (prestige ? 3 : 0)), prog: info.prog, featNote: info.feats ? (fl ? '+' + fl + ' feat' + (fl > 1 ? 's' : '') : 'no feat yet') + ' (at ' + info.feats.map(ord).join(', ') + ')' : '' });
        var rule = choiceRule(p.n);
        if (rule) out[out.length - 1].rule = rule;
      });
      // each copy of a list feature ("Rogue Talents", "Wild Talents"...) gives one pick; the first copy carries them all
      var firsts = {};
      out.forEach(function (x) { if (!x.rule) return; var f = firsts[x.rule.list]; if (f) f.count++; else { firsts[x.rule.list] = x; x.count = 1; } });
      c.choices = c.choices || {};
      Object.keys(firsts).forEach(function (k) { out = out.concat(choiceFeatures(firsts[k].rule, c.choices, firsts[k])); });
      d.special.slice(0, L).forEach(function (t) { if (/Extra Combat Feat/i.test(t)) extra++; });
      return { list: out, bonusFeats: extra };
    }
    var typeOf = function (t) { var m = String(t).match(/\((Ex|Su|Sp)\)|-(ex|su|sp)$/i); return m ? capFirst((m[1] || m[2]).toLowerCase()) : ''; };
    if (!d.arch) {
      (d.special || []).slice(0, L).forEach(function (sp, i) {
        String(sp).split(/,\s*/).filter(function (x) { return x && !/^[—–-]$/.test(x); }).forEach(function (x) {
          var base = x.replace(/\s*[+\d/].*$/, '').toLowerCase();
          out = out.filter(function (o) { return o.base !== base; });
          out.push({ name: capFirst(x), base: base, type: '', text: '', link: d.page, lvl: i + 1, src: d.s, fxL: L });
        });
      });
      return { list: out, bonusFeats: 0 };
    }
    var A = ARCH[d.s];
    if (!A || A === 'loading') return { list: out, bonusFeats: 0, loading: true };
    var chosen = A.archetypes.filter(function (a) { return (c.arch || []).indexOf(a.name) >= 0; });
    var replaced = {}, unitById = {};
    A.units.forEach(function (u) { unitById[u.id] = u; });
    chosen.forEach(function (a) { a.abilities.forEach(function (b) { b.replaces.forEach(function (id) { replaced[id] = 1; }); }); });
    var latest = {}, count = {};
    A.units.forEach(function (u) {
      if (u.sub || u.lvl > L || replaced[u.id] || /class skills|proficien/i.test(u.base)) return;
      count[u.base] = (count[u.base] || 0) + 1;
      if (/^(bonus feat|teamwork feat|combat style feat)/i.test(u.base)) bonus++;
      if (!latest[u.base] || u.idx >= latest[u.base].idx) latest[u.base] = u;
    });
    Object.keys(latest).forEach(function (k) {
      var u = latest[k], label = capFirst(u.label);
      if (/^bonus feat/i.test(k)) return; // counted in the feat slots instead
      if (count[k] > 1 && !/\d/.test(label)) label += ' ×' + count[k];
      out.push({ name: label, type: typeOf(u.sec || ''), text: (d.sec || {})[u.sec] || '', link: d.page + (u.sec ? '#' + u.sec : ''), lvl: u.lvl, src: d.s, fxL: L, unit: k, count: count[k] });
      var rule = unitRule(k);
      if (rule) { c.choices = c.choices || {}; out = out.concat(choiceFeatures(rule, c.choices, out[out.length - 1])); }
    });
    chosen.forEach(function (a) {
      a.abilities.forEach(function (b) {
        var ids = b.replaces.concat(b.modifies);
        var lvl = b.lvl || (ids.length ? Math.min.apply(null, ids.map(function (id) { return unitById[id] ? unitById[id].lvl : 1; })) : 0);
        if (!lvl || lvl > L || /proficien|class skills|^skills/i.test(b.name)) return;
        out.push({ name: b.name.replace(/\s*\((Ex|Su|Sp)\)\s*$/i, ''), type: typeOf(b.name), text: shortText(stripHtml(b.html), 700),
          link: (a.page || '') + '#' + (a.anchor || ''), lvl: lvl, arch: a.name, src: d.s, fxL: L });
      });
    });
    out.sort(function (x, y) { return x.lvl - y.lvl; });
    return { list: out, bonusFeats: bonus };
  }
  // ---------- what class features do to the numbers ----------
  // Only lasting effects: modes that are turned on (rage and the like) go in as buffs by hand. A feature scales with
  // the level of its class (in the Star Wars builder, the class level; a prestige class feature, that less 3).
  function srcOf(link) { var m = String(link || '').match(/(?:classes|prestige-classes)\/(?:legendary\/)?([a-z0-9-]+?)(?:-archetypes)?\//); return m ? m[1] : ''; }

  // ---------- class features that are "pick N from a list" ----------
  // re: the feature's name as a subsystem list writes it; unit: the class table entry that gives one pick (its count
  // up to your level is how many you get); list: the options (DATA.choices, tools/build-enemy-builder.js); adv: the
  // level from which the advanced talents / master tricks are open; also: another list it can pick from.
  var CHOICE_RULES = [
    { re: /^rogue talents?$/, unit: /^rogue talents?$/, list: 'rogue-talent', adv: 10 },
    { re: /^ninja tricks?$/, unit: /^ninja tricks?$/, list: 'ninja-trick', adv: 10, also: 'rogue-talent' },
    { re: /^slayer talents?$/, unit: /^slayer talents?$/, list: 'slayer-talent', adv: 10, also: 'rogue-talent' },
    { re: /^rage powers?$/, unit: /^rage powers?$/, list: 'rage-power' },
    { re: /^discover(y|ies)$/, unit: /^discover(y|ies)$/, list: 'discovery' },
    { re: /^infusions?$/, unit: /^infusions?$/, list: 'infusion' },
    { re: /^(utility )?wild talents?$/, unit: /^utility wild talents?$/, list: 'utility-talent' }
  ];
  function choiceBase(n) { return String(n || '').toLowerCase().replace(/\s*×\d+$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim(); }
  function choiceRule(name) { var b = choiceBase(name); return CHOICE_RULES.filter(function (r) { return r.re.test(b); })[0] || null; }
  function unitRule(base) { var b = choiceBase(base); return CHOICE_RULES.filter(function (r) { return r.unit.test(b); })[0] || null; }
  // how many picks the feature gives at its level: its class table's entries up to that level (a copied feature in a
  // subsystem builder: its source class's table at the level it scales with); at least 1
  function choiceSlots(rule, x) {
    if (x.count) return x.count;
    var A = ARCH[x.src];
    if (A === undefined && x.src && CLASS_BY[x.src] && CLASS_BY[x.src].arch) { loadArch(x.src); return null; }
    if (!A || A === 'loading') return A === 'loading' ? null : 1;
    var n = A.units.filter(function (u) { return !u.sub && u.lvl <= (x.fxL || 1) && rule.unit.test(choiceBase(u.base)); }).length;
    return Math.max(1, n);
  }
  function choiceOptions(rule, L) {
    var C = DATA.choices || {}, own = (C[rule.list] || { opts: [] }).opts, out = [];
    var ok = function (o) { return (o.lvl || 1) <= L && (!o.adv || (rule.adv && L >= rule.adv)); };
    own.forEach(function (o) { if (ok(o)) out.push({ o: o, from: '' }); });
    if (rule.also && C[rule.also]) C[rule.also].opts.forEach(function (o) {
      if (ok(o) && !own.some(function (x) { return x.n.toLowerCase() === o.n.toLowerCase(); })) out.push({ o: o, from: C[rule.also].n.replace(/s$/, '').toLowerCase() });
    });
    return out;
  }
  function choiceFind(rule, name) {
    var C = DATA.choices || {}, lists = [rule.list].concat(rule.also ? [rule.also] : []);
    for (var i = 0; i < lists.length; i++) {
      var hit = ((C[lists[i]] || {}).opts || []).filter(function (o) { return o.n === name; })[0];
      if (hit) return hit;
    }
    return null;
  }
  // the options picked for a feature, as features of their own (so they reach the stat block); x is the feature
  function choiceFeatures(rule, store, x) {
    var st = store[rule.list] = store[rule.list] || { picks: [] };
    x.choice = { rule: rule, st: st };
    // st.n: the number of picks set by hand (null: the class table's, or one per copy)
    var slots = st.n != null ? st.n : choiceSlots(rule, x), L = x.fxL || 1;
    return st.picks.map(function (n) { return choiceFind(rule, n) || { n: n, t: '', text: '', link: x.link }; }).filter(function (o) {
      return (o.lvl || 1) <= L && (!o.adv || (rule.adv && L >= rule.adv));
    }).slice(0, slots == null ? Infinity : slots).map(function (o) {
      return { name: o.n, type: o.t || '', text: o.text || '', link: o.link, lvl: x.lvl, src: x.src, fxL: x.fxL, picked: x.name, arch: x.arch };
    });
  }
  var choiceUid = 0;
  // the box to pick them: the picks as chips, then a search over the options open at that level
  function choiceBox(x, redraw) {
    var rule = x.choice.rule, st = x.choice.st, L = x.fxL || 1, list = (DATA.choices || {})[rule.list] || { n: rule.list };
    var auto = choiceSlots(rule, x), n = st.n != null ? st.n : auto;
    if (n == null) return h('div', { class: 'eb-choice' }, h('small', { class: 'eb-note', text: 'Loading ' + list.n.toLowerCase() + '…' }));
    var opts = choiceOptions(rule, L), byKey = {}, id = 'eb-choice-' + (++choiceUid);
    var free = opts.filter(function (e) { return st.picks.indexOf(e.o.n) < 0; });
    var dl = h('datalist', { id: id }, free.map(function (e) {
      var key = e.o.n + (e.o.t ? ' (' + e.o.t + ')' : '') + (e.o.lvl > 1 ? ' — ' + ord(e.o.lvl) : '') + (e.o.adv ? ' — advanced' : '') + (e.from ? ' — ' + e.from : '') + (e.o.el ? ' — ' + e.o.el : '');
      byKey[key] = e.o;
      return h('option', { value: key, label: e.o.pre ? 'needs ' + e.o.pre : '' });
    }));
    var input = h('input', { type: 'text', class: 'eb-t eb-wide', placeholder: 'type to search ' + free.length + ' ' + list.n.toLowerCase() + '…' });
    input.setAttribute('list', id);
    var add = function () { var o = byKey[input.value]; if (!o) return; st.picks.push(o.n); changed(); redraw(); };
    input.addEventListener('input', function () { if (byKey[input.value]) add(); });
    input.addEventListener('change', add);
    var over = st.picks.length > n;
    var slotsBox = numBox(function () { return n; }, function (v) { st.n = v === auto ? null : v; }, { min: 0, max: 30 });
    // typing commits on change; the − / + buttons change it at once
    slotsBox.addEventListener('change', function () { redraw(); });
    slotsBox.addEventListener('click', function (e) { if (e.target.classList.contains('eb-step')) redraw(); });
    return h('div', { class: 'eb-choice eb-slot' + (over ? ' eb-bad' : '') },
      h('div', { class: 'eb-slothead' }, h('b', { text: x.name.replace(/\s*×\d+$/, '') }), ' · ',
        h('span', { class: over ? 'eb-over' : '', text: st.picks.length + ' of ' + n + ' chosen' }), ' · at ' + ord(L) + ' level',
        rule.adv ? (L >= rule.adv ? ' · advanced ones open' : ' · advanced ones from ' + ord(rule.adv)) : ''),
      h('div', { class: 'eb-chips' }, st.picks.map(function (name, i) {
        var o = choiceFind(rule, name) || { n: name };
        var late = (o.lvl || 1) > L || (o.adv && !(rule.adv && L >= rule.adv));
        return h('span', { class: 'eb-chip' + (late ? ' eb-over' : ''), title: (late ? 'Not open at this level.\n\n' : '') + (o.pre ? 'Needs ' + o.pre + '.\n\n' : '') + (o.text || '') },
          o.link ? h('a', { href: new URL(o.link, BASE).href, target: '_blank', text: o.n }) : o.n, o.t ? h('small', { text: ' ' + o.t }) : null,
          h('button', { type: 'button', class: 'eb-x', text: '×', onclick: function () { st.picks.splice(i, 1); changed(); redraw(); } }));
      })),
      st.picks.length < n ? h('div', { class: 'eb-inline' }, input, dl) : null,
      h('label', { class: 'eb-inline eb-choice-n' }, h('small', { text: 'picks ' + (st.n != null ? '(set by hand; ' + auto + (x.sw ? ' copied)' : ' by the table)') : x.sw ? '(one per copy of the feature)' : '(by the class table)') }), slotsBox));
  }
  var UNARMED = ['1d6', '1d6', '1d6', '1d8', '1d8', '1d8', '1d8', '1d10', '1d10', '1d10', '1d10', '2d6', '2d6', '2d6', '2d6', '2d8', '2d8', '2d8', '2d8', '2d10'];
  function sneakDice(L, name, src) {
    var m = name.match(/\((\d+)d6 at (\d+)\w* level(?:, \+1d6 (?:at (\d+)\w* and )?every (\d+) levels?)?/i);
    if (m) {
      if (L < +m[2]) return 0;
      if (m[3]) return 1 + (L >= +m[3] ? 1 + Math.floor((L - m[3]) / m[4]) : 0);
      return m[4] ? 1 + Math.floor((L - m[2]) / m[4]) : 1;
    }
    if (/slayer/.test(src)) return L >= 3 ? Math.floor(L / 3) : 0;
    return Math.ceil(L / 2);
  }
  // the feature's line in its class table at its level ("Sneak attack +3d6"), from which the numbers are read first
  function tableText(x) {
    if (!x.prog) return x.name;
    var t = ''; x.prog.forEach(function (p) { if (p[0] <= (x.fxL || 1)) t = p[1]; });
    return t;
  }
  function plusOf(t) { var m = String(t).match(/\+(\d+)(?![\dd])/); return m ? +m[1] : 0; }
  function diceOf(t) { var m = String(t).match(/\d+d\d+/); return m ? m[0] : ''; }
  function tailOf(t) { var m = String(t).match(/\s(\d+)(?=\/|\s*$|\s*\()/); return m ? +m[1] : 0; }
  var FEATURE_FX = [
    [/^armor training$/, function (L, x, M, src, t) { var n = tailOf(t) || Math.floor((L + 1) / 4); return n && { acpRed: n, maxDex: n, note: 'armor check penalty –' + n + ', max Dex +' + n }; }],
    [/^(swashbuckler )?weapon training$/, function (L, x, M, src, t) { var n = tailOf(t) || plusOf(t) || Math.floor((L - 1) / 4); return n > 0 && { wAtk: n, wDmg: n, note: '+' + n + ' attack and damage with weapons (its first group)' }; }],
    [/^bravery$/, function (L, x, M, src, t) { var n = plusOf(t) || Math.max(1, Math.floor((L + 2) / 4)); return { label: 'Bravery +' + n, note: 'its bonus in the name (against fear)' }; }],
    [/^(trap sense|danger sense)$/, function (L, x, M, src, t) { var n = plusOf(t) || Math.max(1, Math.floor(L / 3)); return { label: capFirst(x.base) + ' +' + n, def: x.base + ' +' + n, note: 'in Defensive Abilities' }; }],
    [/^fast movement$/, function (L, x, M, src) { var ft = /monk/.test(src) ? 10 * Math.floor(L / 3) : 10; return ft && { speed: ft, note: '+' + ft + ' ft. speed' }; }],
    [/^ac bonus$/, function (L, x, M, src, t) {
      if (/brawler/.test(src)) { var b = plusOf(t) || (L < 4 ? 0 : 1 + (L >= 9) + (L >= 13) + (L >= 18)); return b && { dodge: b, note: '+' + b + ' dodge AC' }; }
      var v = Math.max(0, M.Wis) + Math.floor(L / 4); return v && { ac: v, acFF: true, cmd: v, note: '+' + v + ' AC and CMD (Wis, +' + Math.floor(L / 4) + ' for level)' };
    }],
    [/^defensive instinct$/, function (L, x, M) {
      var w = Math.max(0, M.Wis), armored = !!(S.armor || S.shield), v = (armored ? Math.floor(w / 2) : w) + (armored ? 0 : Math.floor(L / 4));
      return v && { ac: v, acFF: true, cmd: armored ? 0 : v, note: armored ? '+' + v + ' AC (half Wis, in armor)' : '+' + v + ' AC and CMD (Wis, +' + Math.floor(L / 4) + ' for level)' };
    }],
    [/^nimble$/, function (L, x, M, src, t) { var n = plusOf(t) || (/swashbuckler/.test(src) ? Math.floor((L + 1) / 4) : Math.floor((L + 2) / 4)); return n && { dodge: n, note: '+' + n + ' dodge AC' }; }],
    [/^canny defense$/, function (L, x, M) { var n = Math.min(Math.max(0, M.Int), L); return n && { dodge: n, note: '+' + n + ' AC (Int)' }; }],
    [/^(divine grace|unholy resilience)$/, function (L, x, M) { return M.Cha > 0 && { saveAll: M.Cha, note: '+' + M.Cha + ' on all saves (Cha)' }; }],
    [/^sneak attack$/, function (L, x, M, src, t) { var d = diceOf(t), n = d ? +d.split('d')[0] : sneakDice(L, x.name, src); return n && { label: 'Sneak attack +' + n + 'd6', note: 'a roll button' }; }],
    [/^channel( (positive|negative))?( energy)?$/, function (L, x, M, src, t) { return { label: 'Channel energy ' + (diceOf(t) || Math.ceil(L / 2) + 'd6'), note: 'a roll button' }; }],
    [/^(lay on hands|touch of corruption)$/, function (L, x, M, src, t) { var d = diceOf(t) || (L >= 2 ? Math.floor(L / 2) + 'd6' : ''); return d && { label: capFirst(x.base) + ' ' + d, note: 'a roll button' }; }],
    [/^smite (evil|good|chaos|law)$/, function (L, x, M, src, t) { var m = String(t).match(/(\d+)\/day/); return { label: capFirst(x.base) + ' ' + (m ? m[1] : 1 + Math.floor((L - 1) / 3)) + '/day' }; }],
    [/^bombs?$/, function (L, x, M, src, t) { return { label: 'Bomb ' + (diceOf(t) || Math.ceil(L / 2) + 'd6') + (M.Int ? (M.Int > 0 ? '+' : '-') + Math.abs(M.Int) : ''), note: 'a roll button' }; }],
    [/^unarmed strike$/, function (L, x, M, src) { return /monk|brawler/.test(src) && { unarmed: UNARMED[Math.min(L, 20) - 1], note: 'an attack named unarmed strike deals ' + UNARMED[Math.min(L, 20) - 1] + ' (Medium)' }; }],
    [/^damage reduction$/, function (L, x, M, src, t) { var m = String(t).match(/(\d+)\/—/), n = m ? +m[1] : /barbarian/.test(src) ? Math.floor(L / 2) : 0; return n > 0 && { dr: n, note: 'DR ' + n + '/—' }; }],
    [/^darkvision$/, function (L, x) { var r = String(x.text || '').match(/(\d+)[- ](?:foot|feet|ft)/); return { senses: 'darkvision ' + (r ? r[1] : 60) + ' ft.', note: 'in Senses' }; }],
    [/^low-light vision$/, function () { return { senses: 'low-light vision', note: 'in Senses' }; }],
    [/^bardic knowledge$/, function (L) { var n = Math.max(1, Math.floor(L / 2)); return { know: n, note: '+' + n + ' on Knowledge checks' }; }],
    [/^stern gaze$/, function (L) { var n = Math.max(1, Math.floor(L / 2)); return { skill: { Intimidate: n, 'Sense Motive': n }, note: '+' + n + ' Intimidate and Sense Motive' }; }],
    [/^finesse training$/, function () { return { finesse: true, note: 'Weapon Finesse' }; }],
    [/^gun training$/, function (L) { return L >= 5 && { gunDex: true, note: 'Dex to damage with blasters and firearms' }; }],
    [/^studied target$/, function (L) { return { label: 'Studied target +' + (1 + Math.floor(L / 5)) }; }],
    [/^(improved )?(evasion|uncanny dodge)$|^stalwart$/, function (L, x) { return { def: x.base, note: 'in Defensive Abilities' }; }]
  ];
  function featureFx(D, M) {
    var F = { dodge: 0, ac: 0, acFF: 0, cmd: 0, saveAll: 0, speed: 0, skill: {}, know: 0, wAtk: 0, wDmg: 0, acpRed: 0, maxDex: 0, finesse: false, gunDex: false, unarmed: null, dr: 0, def: [], senses: [], parts: [] };
    D.features.forEach(function (x) {
      x.note = ''; x.label = '';
      x.base = String(x.name).replace(/\s*\(.*$/, '').replace(/\s*[+×]?\d.*$/, '').toLowerCase().trim();
      if (!x.on) return;
      var t = tableText(x), hit = false;
      for (var i = 0; i < FEATURE_FX.length; i++) {
        if (!FEATURE_FX[i][0].test(x.base)) continue;
        hit = true;
        var r = FEATURE_FX[i][1](x.fxL || 1, x, M, x.src || '', t);
        if (r) {
          ['dodge', 'cmd', 'saveAll', 'speed', 'know', 'wAtk', 'wDmg', 'acpRed', 'maxDex'].forEach(function (k) { if (r[k]) F[k] += r[k]; });
          var short = (x.label || x.name).replace(/\s*\(.*$/, '');
          if (r.ac) { F.ac += r.ac; if (r.acFF) F.acFF += r.ac; F.parts.push(sgn(r.ac) + ' ' + short); }
          if (r.dodge) F.parts.push(sgn(r.dodge) + ' ' + short);
          if (r.skill) Object.keys(r.skill).forEach(function (k) { F.skill[k] = (F.skill[k] || 0) + r.skill[k]; });
          if (r.finesse) F.finesse = true; if (r.gunDex) F.gunDex = true; if (r.unarmed) F.unarmed = r.unarmed;
          if (r.dr) F.dr = Math.max(F.dr, r.dr);
          if (r.def && F.def.indexOf(r.def) < 0) F.def.push(r.def);
          if (r.senses && F.senses.indexOf(r.senses) < 0) F.senses.push(r.senses);
          x.note = r.note || ''; x.label = r.label || '';
        }
        break;
      }
      // any other feature that grows in its class table shows its number at this level ("Channel damage 3d6")
      if (!hit && x.prog && t && /\d/.test(t)) { x.label = capFirst(t); if (diceOf(t)) x.note = 'a roll button'; }
      if (x.featNote) x.note = (x.note ? x.note + '; ' : '') + x.featNote;
    });
    return F;
  }
  function addSpeed(text, n) {
    text = text || '30 ft.';
    return n ? (/\d+\s*ft/.test(text) ? text.replace(/(\d+)(\s*ft)/, function (_, a, b) { return (+a + n) + b; }) : text + ' (+' + n + ' ft.)') : text;
  }

  function weaponData(n) {
    n = String(n || '').toLowerCase().trim();
    for (var i = 0; i < DATA.weapons.length; i++) if (DATA.weapons[i].n.toLowerCase() === n) return DATA.weapons[i];
    return null;
  }
  // fighter weapon groups (Weapon Focus): "Blades, Heavy" / "heavy blades weapons" / "naturals" -> "heavy blades" / "natural"
  function groupKey(s) {
    s = String(s || '').toLowerCase().replace(/\s+(weapons?|attacks?)$/, '').trim().replace(/^(blades), (heavy|light)$/, '$2 $1');
    if (/^naturals?$/.test(s)) return 'natural';
    if (/^rays?$/.test(s)) return 'ray';
    if (/^lightsabers?$/.test(s)) return 'lightsabers';
    return s;
  }
  function weaponGroups(w) {
    var n = String(w.n || '').toLowerCase().trim();
    if (/^nat/.test(w.mode) || NATURAL[n] && n !== 'unarmed strike') return ['natural'];
    if (n === 'unarmed strike') return ['close', 'monk', 'natural'];
    var d = weaponData(n), g = d && d.g ? d.g.slice() : [];
    if (d && d.p === 'blaster') g.push('firearms');
    if (d && d.p === 'lightsaber') g.push('lightsabers');
    return g;
  }
  function allGroups() {
    var set = { natural: 1, close: 1, monk: 1, firearms: 1, ray: 1 };
    DATA.weapons.forEach(function (w) { (w.g || []).forEach(function (g) { set[g] = 1; }); });
    if (SWM) set.lightsabers = 1;
    return Object.keys(set).sort();
  }
  function armorData(n) { for (var i = 0; i < DATA.armors.length; i++) if (DATA.armors[i].n === n) return DATA.armors[i]; return null; }
  function featData(n) {
    var base = String(n).replace(/\s*\(.*$/, '').trim().toLowerCase();
    for (var i = 0; i < DATA.feats.length; i++) if (DATA.feats[i].n.toLowerCase() === base) return DATA.feats[i];
    return null;
  }
  function featSlug(n) { var f = featData(n); return f ? f.u : null; }

  // ---------- the numbers ----------
  function compute() {
    var D = {}, sz = SIZES[S.size] || SIZES.Medium;
    var cls = (S.classes || []).filter(function (c) { return CLASS_BY[c.s] && c.lvl > 0; });
    var classLv = cls.reduce(function (t, c) { return t + c.lvl; }, 0);
    var racial = Math.max(0, S.hd || 0);
    if (!racial && !classLv) racial = 1;
    var hd = racial + classLv;
    var crow = function (c) { var t = CLASS_BY[c.s].table; return t[Math.min(c.lvl, t.length) - 1] || [0, 0, 0, 0]; };
    D.totalHD = hd; D.racialHD = racial;
    D.classSkill = {}; D.features = []; D.classBonusFeats = 0;
    cls.forEach(function (c) {
      var d = CLASS_BY[c.s];
      d.skills.forEach(function (n) { if (n === '*') SKILLS.forEach(function (sk) { D.classSkill[sk[0]] = true; }); else D.classSkill[n] = true; });
      var f = classFeatures(c);
      D.classBonusFeats += f.bonusFeats;
      // a pick (a rogue talent...) is on only while the feature that gives it is
      f.list.forEach(function (x) { x.on = (c.off || []).indexOf(x.picked || x.name) < 0 && (c.off || []).indexOf(x.name) < 0; x.cls = c; D.features.push(x); });
    });
    var noCon = S.type === 'undead' || S.type === 'construct';
    var M = {}; ABIL.forEach(function (a) { M[a] = mod(score(a)); });
    if (noCon) M.Con = 0;
    var FX = D.fx = featureFx(D, M);
    var feats = S.feats.filter(function (f) { return f && f.trim(); });
    var lower = feats.map(function (f) { return f.toLowerCase().trim(); });
    var has = function (n) { n = n.toLowerCase(); return lower.filter(function (f) { return f === n || f.indexOf(n + ' (') === 0; }).length; };
    var featArg = function (n) { n = n.toLowerCase(); return lower.filter(function (f) { return f.indexOf(n + ' (') === 0; }).map(function (f) { return f.slice(n.length + 2).replace(/\)$/, ''); }); };
    D.auto = {};
    var autoNote = function (n, t) { D.auto[n.toLowerCase()] = t; };

    D.bab = (S.bab === 'full' ? racial : S.bab === '1/2' ? Math.floor(racial / 2) : Math.floor(racial * 3 / 4)) +
      cls.reduce(function (t, c) { return t + crow(c)[0]; }, 0);
    D.featSlots = Math.ceil(hd / 2) + (S.bonusFeats || 0) + D.classBonusFeats;
    D.feats = feats;
    D.mods = M;
    // hit points
    // the table plays with maximum hit points; untick Max hp for the average
    var dieHp = function (n, die) { return S.maxHp === false ? Math.floor(n * (die + 1) / 2) : n * die; };
    var avg = dieHp(racial, S.die) + cls.reduce(function (t, c) { return t + dieHp(c.lvl, CLASS_BY[c.s].die); }, 0);
    var diceText = (racial ? [racial + 'd' + S.die] : []).concat(cls.map(function (c) { return c.lvl + 'd' + CLASS_BY[c.s].die; })).join('+');
    var conHp = S.type === 'undead' ? M.Cha * hd : S.type === 'construct' ? sz.construct : M.Con * hd;
    var tough = has('Toughness') ? Math.max(3, hd) : 0;
    if (tough) autoNote('Toughness', '+' + tough + ' hp');
    var extra = conHp + tough + (S.hpMisc || 0);
    D.hp = Math.max(1, avg + extra);
    D.hpText = D.hp + ' (' + diceText + (extra ? sgn(extra).replace('–', '-') : '') + ')';
    // AC
    var arm = armorData(S.armor), sh = armorData(S.shield);
    var armB = arm ? arm.b + (S.armorEnh || 0) : 0, shB = sh ? sh.b + (S.shieldEnh || 0) : 0;
    var maxDex = [arm && arm.md != null ? arm.md + FX.maxDex : null, sh && sh.md].filter(function (x) { return x != null; });
    var dexAC = maxDex.length ? Math.min(M.Dex, Math.min.apply(null, maxDex)) : M.Dex;
    var natural = (S.natural || 0) + has('Improved Natural Armor');
    if (has('Improved Natural Armor')) autoNote('Improved Natural Armor', '+' + has('Improved Natural Armor') + ' natural armor');
    var dodgeFeat = has('Dodge') || has('Dodgility') ? 1 : 0;
    if (has('Dodge')) autoNote('Dodge', '+1 dodge AC'); if (has('Dodgility')) autoNote('Dodgility', '+1 dodge AC');
    var dodge = (S.dodge || 0) + dodgeFeat + FX.dodge;
    D.sw = null;
    if (SWM) {
      var sw = S.sw || (S.sw = { karma: 0, force: false, abil: 'Wis' });
      var swc = cls.filter(function (c) { return CLASS_BY[c.s].sw; })[0], swl = swc ? swc.lvl : 0;
      var forceS = !!SUB.force && (!!(swc && CLASS_BY[swc.s].role === 'caster') || !!sw.force);
      // Force Sensitive: +1 dodge AC, +1 more at 3rd level and every 3 levels
      var fsDodge = forceS ? 1 + Math.floor(hd / 3) : 0;
      dodge += fsDodge;
      var kar = sw.karma || 0, kabs = Math.abs(kar), K = { cl: 0, dc: 0, will: 0, cha: 0, intim: 0 };
      if (kar <= -10) { var tier = kabs >= 100 ? 3 : kabs >= 50 ? 2 : 1; K.cl = tier; K.dc = -tier; K.will = -tier; K.cha = -Math.floor(kabs / 10); K.intim = Math.floor(kabs / 10); }
      else if (kar >= 10) { K.will = kabs >= 100 ? 3 : kabs >= 50 ? 2 : 1; K.dc = kabs >= 100 ? 3 : kabs >= 50 ? 2 : kabs >= 30 ? 1 : 0; K.cha = Math.floor(kabs / 10); }
      var stm = mod(S.abil[sw.abil] ? score(sw.abil) : 10);
      D.sw = { force: forceS, fsDodge: fsDodge, karma: K, cls: swc ? CLASS_BY[swc.s] : null, lvl: swl,
        stamina: swc ? Math.max(0, (CLASS_BY[swc.s].stamina + stm) * swl) : 0, known: swc ? CLASS_BY[swc.s].powers[Math.min(swl, 20) - 1] : [] };
    }
    D.ac = 10 + armB + shB + dexAC + sz.ac + natural + (S.deflection || 0) + dodge + FX.ac;
    D.touch = 10 + dexAC + sz.ac + (S.deflection || 0) + dodge + FX.ac;
    D.ff = D.ac - Math.max(0, dexAC) - dodge - (FX.ac - FX.acFF);
    var parts = [];
    if (armB) parts.push(sgn(armB) + ' armor'); if (shB) parts.push(sgn(shB) + ' shield'); if (dexAC) parts.push(sgn(dexAC) + ' Dex');
    if (dodge - FX.dodge) parts.push(sgn(dodge - FX.dodge) + ' dodge');
    parts = parts.concat(FX.parts); if (S.deflection) parts.push(sgn(S.deflection) + ' deflection');
    if (natural) parts.push(sgn(natural) + ' natural'); if (sz.ac) parts.push(sgn(sz.ac) + ' size');
    D.acText = D.ac + ', touch ' + D.touch + ', flat-footed ' + D.ff + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    D.acp = (arm ? Math.min(0, arm.acp + FX.acpRed) : 0) + (sh ? sh.acp : 0);
    // saves
    var good = function (k) {
      var i = { Fort: 1, Ref: 2, Will: 3 }[k];
      return (racial ? (S.good[k] ? 2 + Math.floor(racial / 2) : Math.floor(racial / 3)) : 0) + cls.reduce(function (t, c) { return t + crow(c)[i]; }, 0);
    };
    var saveFeat = { Fort: 'Great Fortitude', Ref: 'Lightning Reflexes', Will: 'Iron Will' };
    D.saves = {};
    ['Fort', 'Ref', 'Will'].forEach(function (k) {
      var ab = k === 'Fort' ? (S.type === 'undead' ? M.Cha : M.Con) : k === 'Ref' ? M.Dex : M.Wis;
      var f = has(saveFeat[k]) ? 2 : 0;
      if (f) autoNote(saveFeat[k], '+2 ' + k);
      D.saves[k] = good(k) + ab + f + FX.saveAll + (S.saveMisc[k] || 0) + (k === 'Will' && D.sw ? D.sw.karma.will : 0);
    });
    // initiative, CMB, CMD
    var ii = has('Improved Initiative') ? 4 : 0;
    if (ii) autoNote('Improved Initiative', '+4 initiative');
    D.init = M.Dex + ii + (S.initMisc || 0);
    var finesse = has('Weapon Finesse') > 0 || FX.finesse; // the wiki's Weapon Finesse includes Agile Maneuvers
    if (finesse) autoNote('Weapon Finesse', 'Dex to attack and damage with light and finesse weapons and natural attacks, and to CMB');
    var cmbAb = finesse ? Math.max(M.Str, M.Dex) : M.Str;
    D.cmb = D.bab + cmbAb + sz.cmb;
    D.cmd = 10 + D.bab + M.Str + M.Dex + sz.cmb + dodge + (S.deflection || 0) + FX.cmd;
    D.meleeTouch = D.bab + (finesse ? Math.max(M.Str, M.Dex) : M.Str) + sz.ac;
    D.rangedTouch = D.bab + M.Dex + sz.ac;
    // skills
    D.rankPool = (racial ? Math.max(1, (S.ranks || 0) + M.Int) * racial : 0) + (S.bonusRanks || 0) +
      cls.reduce(function (t, c) { return t + Math.max(1, CLASS_BY[c.s].ranks + M.Int) * c.lvl; }, 0);
    D.ranksUsed = 0;
    var focus = featArg('Skill Focus').map(function (s) { return s.toLowerCase(); });
    D.skills = {};
    SKILLS.forEach(function (sk) {
      var n = sk[0], st = S.skills[n] || {}, r = st.r || 0;
      D.ranksUsed += r;
      var t = r + M[sk[1]] + ((st.cls || D.classSkill[n]) && r > 0 ? 3 : 0) + (st.misc || 0) +
        (D.sw && sk[1] === 'Cha' ? (n === 'Intimidate' ? D.sw.karma.intim : D.sw.karma.cha) : 0);
      if (n === 'Stealth') t += sz.stealth; if (n === 'Fly') t += sz.fly;
      if (ACP_SKILLS[n]) t += D.acp;
      t += (FX.skill[n] || 0) + (/^Knowledge/.test(n) ? FX.know : 0);
      if (focus.indexOf(n.toLowerCase()) >= 0) { t += r >= 10 ? 6 : 3; autoNote('Skill Focus (' + n.toLowerCase() + ')', sgn(r >= 10 ? 6 : 3) + ' ' + n); }
      if (has('Alertness') && (n === 'Perception' || n === 'Sense Motive')) { t += r >= 10 ? 4 : 2; autoNote('Alertness', '+2 Perception and Sense Motive (+4 at 10 ranks)'); }
      // a skill only used trained (Disable Device, Knowledge...) shows — in the grid without ranks
      D.skills[n] = { total: t, shown: r > 0 || !!st.misc || !!st.show, disp: TRAINED_ONLY.test(n) && !r ? '—' : sgn(t) };
    });

    // attacks
    var wf = featArg('Weapon Focus'), gwf = featArg('Greater Weapon Focus'), ws = featArg('Weapon Specialization'), gws = featArg('Greater Weapon Specialization'), ic = featArg('Improved Critical');
    var hits = function (list, n) { n = n.toLowerCase(); return list.filter(function (x) { return x && (n === x || n.indexOf(x) >= 0 || x.indexOf(n) >= 0 || x.replace(/s$/, '') === n); }).length; };
    var twf = has('Two-Weapon Fighting'), itwf = has('Improved Two-Weapon Fighting') || has('Greater Two-Weapon Fighting'), dslice = has('Double Slice');
    var multi = has('Multiattack'), rapid = has('Rapid Shot');
    var naturals = S.weapons.filter(function (w) { return /^nat/.test(w.mode); });
    // the wiki's Weapon Focus takes a weapon group and gives +1 base attack bonus with it (extra attacks too); an old
    // "Weapon Focus (longsword)" still works by the weapon's name
    var wfGroups = wf.map(groupKey);
    if (wfGroups.indexOf('ray') >= 0) { D.rangedTouch += 1; autoNote('Weapon Focus (' + wf[wfGroups.indexOf('ray')] + ')', '+1 BAB with rays'); }
    // styles: Dragon Style (1-1/2 Str on the first unarmed strike; Dragon Ferocity, double on the first and 1-1/2 on the
    // rest), with Ascetic Style a monk weapon counts as an unarmed strike for them; Ascetic Strike gives that weapon the
    // unarmed damage of a monk 4 levels lower; the master of many styles adds +1 attack per active style from 8th (max 3)
    var dragon = has('Dragon Style'), fero = has('Dragon Ferocity'), asceticStrike = has('Ascetic Strike');
    var moms = cls.filter(function (c) { return (c.arch || []).indexOf('Master of Many Styles') >= 0; })[0];
    var fuse = moms && moms.lvl >= 8 ? Math.min(3, feats.filter(function (f) { return / Style$/i.test(f); }).length) : 0;
    D.attacks = S.weapons.map(function (w) {
      var a = { row: w }, nat = /^nat/.test(w.mode), ranged = w.mode === 'ranged' || w.mode === 'thrown';
      var n = String(w.n || 'attack').trim().toLowerCase();
      var light = w.cat === 'light' || nat;
      var useDex = ranged || ((finesse || w.finesse) && (light || FINESSE.test(n)) && M.Dex > M.Str);
      var enh = w.enh || 0, mw = !enh && w.mwk && !nat ? 1 : 0;
      var groups = weaponGroups(w), wfB = 0;
      wf.forEach(function (arg, i) {
        if (wfB) return;
        if (groups.indexOf(wfGroups[i]) >= 0) { wfB = 1; autoNote('Weapon Focus (' + arg + ')', '+1 BAB with ' + wfGroups[i] + ' (' + n + ')'); }
        else if (hits([arg], n)) { wfB = 1; autoNote('Weapon Focus (' + arg + ')', '+1 BAB with ' + n); }
      });
      var gwfN = hits(gwf, n);
      if (gwfN) autoNote('Greater Weapon Focus (' + n + ')', '+1 attack with ' + n);
      a.bab = D.bab + wfB + (w.babAdj || 0); a.groups = groups;
      a.atk = a.bab + (useDex ? M.Dex : M.Str) + sz.ac + enh + mw + gwfN + (w.misc || 0) + (nat ? 0 : FX.wAtk);
      if (w.mode === 'nat2') a.atk -= multi ? 2 : 5;
      if (multi && w.mode === 'nat2') autoNote('Multiattack', 'secondary natural attacks at –2');
      var strD = M.Str;
      if (w.mode === 'two' || (w.mode === 'nat1' && naturals.length === 1 && (w.count || 1) === 1 && S.weapons.length === 1)) strD = M.Str > 0 ? Math.floor(M.Str * 1.5) : M.Str;
      if (w.mode === 'off' || w.mode === 'nat2') strD = M.Str > 0 ? Math.floor(M.Str / 2) : M.Str;
      if (w.mode === 'off' && dslice) { strD = M.Str; autoNote('Double Slice', 'full Str to off-hand damage'); }
      if (w.mode === 'ranged' && !w.strDmg) strD = Math.min(0, M.Str); // bows: a Str penalty, no bonus (composite: tick Str to damage)
      // the wiki's Weapon Finesse also gives Dex to damage with the weapons it gives Dex to attack: once, never ×1-1/2,
      // half in the off hand and on secondary natural attacks; two-handed and ranged attacks are as they are.
      // A "Damage with" choice on the row overrides it (Str keeps the usual Str rules).
      if (w.dmgAbil) { if (w.dmgAbil !== 'Str') strD = M[w.dmgAbil] || 0; }
      else if (useDex && !ranged && w.mode !== 'two') {
        strD = (w.mode === 'off' && !dslice) || w.mode === 'nat2' ? (M.Dex > 0 ? Math.floor(M.Dex / 2) : M.Dex) : M.Dex;
      }
      if (w.single || w.fixed) strD = 0; // a kinetic blast or a bomb: its damage is its own (Con, Int), already in its damage misc
      var spec = (hits(ws, n) + hits(gws, n)) * 2;
      if (spec) autoNote('Weapon Specialization (' + n + ')', '+2 damage with ' + n);
      var wd = weaponData(w.n), gun = ranged && FX.gunDex && (wd ? wd.p === 'blaster' || /firearm/i.test(wd.c + ' ' + (wd.ty || '')) : /blaster|pistol|rifle|musket/.test(n));
      var unarmedLike = !ranged && (n === 'unarmed strike' || !!w.ascetic);
      var firstExtra = 0;
      if (dragon && unarmedLike && M.Str > 0) {
        var two = w.mode === 'two';
        if (fero) { strD += Math.floor(M.Str / 2); firstExtra = two ? 0 : Math.floor(M.Str / 2); }
        else firstExtra = two ? 0 : Math.floor(M.Str / 2);
        autoNote('Dragon Style', '1-1/2 Str on the first ' + (w.ascetic ? n : 'unarmed strike') + ' each round' + (firstExtra ? ' (+' + firstExtra + ')' : ''));
        if (fero) autoNote('Dragon Ferocity', 'double Str on the first attack, 1-1/2 on the rest; crits and Stunning Fist shake');
      }
      if (fuse && unarmedLike) { a.atk += fuse; autoNote('Master of Many Styles', '+' + fuse + ' attack with ' + fuse + ' styles fused'); }
      a.dmgMod = strD + enh + spec + (w.dmgMisc || 0) + (nat ? 0 : FX.wDmg) + (gun ? M.Dex : 0);
      a.firstExtra = firstExtra;
      // Improved Natural Attack (a monster feat): that natural attack's damage as if one size larger
      var ina = nat && hits(featArg('Improved Natural Attack'), n);
      if (ina) autoNote('Improved Natural Attack (' + n + ')', n + ' damage one size larger');
      // (a kinetic blast's dice do not change with size)
      var baseD = FX.unarmed && /^unarmed strike$/.test(n) ? FX.unarmed : w.d || '1d4';
      if (asceticStrike && w.ascetic && hd > 4) {
        var asD = UNARMED[Math.min(20, hd - 4) - 1];
        if (diceAvg(asD) > diceAvg(baseD)) { baseD = asD; autoNote('Ascetic Strike', n + ' deals ' + asD + ' (a monk ' + (hd - 4) + ' levels\' unarmed strike)'); }
      }
      a.dice = w.single || w.fixed ? w.d || '1d6' : sizeDice(baseD, ina ? SIZE_ORDER[Math.min(SIZE_ORDER.length - 1, SIZE_ORDER.indexOf(S.size) + 1)] : S.size);
      // a Vital Strike row: the weapon's dice rolled 3, 4 or 5 times, one attack
      if (w.vital > 1) a.dice = a.dice.replace(/^(\d+)d/, function (_, k) { return (+k * w.vital) + 'd'; });
      a.threat = w.t || 20; a.mult = w.x || 2;
      if (hits(ic, n)) { a.threat = 21 - (21 - a.threat) * 2; autoNote('Improved Critical (' + n + ')', 'threat ' + a.threat + '–20'); }
      a.name = (enh ? '+' + enh + ' ' : mw ? 'mwk ' : '') + n + (w.vital > 1 ? ' (' + (w.vital === 5 ? 'Greater ' : w.vital === 4 ? 'Improved ' : '') + 'Vital Strike)' : '');
      a.nat = nat; a.ranged = ranged; a.light = light;
      return a;
    });
    // full attacks: rows with the same option number attack together (melee and ranged apart)
    D.groups = { melee: [], ranged: [] };
    ['melee', 'ranged'].forEach(function (kind) {
      var opts = {};
      D.attacks.forEach(function (a) { if ((kind === 'ranged') === a.ranged) (opts[a.row.opt || 1] = opts[a.row.opt || 1] || []).push(a); });
      Object.keys(opts).sort().forEach(function (o) {
        var g = opts[o], off = g.filter(function (a) { return a.row.mode === 'off'; })[0];
        var pMain = 0, pOff = 0;
        if (off) {
          pMain = twf ? (off.light ? -2 : -4) : (off.light ? -4 : -6);
          pOff = twf ? (off.light ? -2 : -4) : (off.light ? -8 : -10);
          if (twf) autoNote('Two-Weapon Fighting', 'two-weapon penalties ' + pMain + '/' + pOff);
        }
        var hasWeapon = g.some(function (a) { return !a.nat; });
        D.groups[kind].push(g.map(function (a) {
          var atk = a.atk + (a.row.mode === 'off' ? pOff : a.nat ? 0 : pMain);
          // natural attacks beside weapons are secondary
          if (a.nat && hasWeapon && a.row.mode === 'nat1') atk -= multi ? 2 : 5;
          var bonuses = [atk];
          if (a.row.mode === 'off') { if (itwf) { bonuses.push(atk - 5); if (a.bab >= 11) bonuses.push(atk - 10); autoNote('Improved Two-Weapon Fighting', 'more off-hand attacks'); } }
          else if (!a.nat && !a.row.single && !a.row.vital) for (var k = 1; k <= 3 && a.bab - 5 * k >= 1; k++) bonuses.push(atk - 5 * k);
          if (kind === 'ranged' && rapid && !a.nat && !a.row.single) { bonuses = [bonuses[0] - 2].concat(bonuses.map(function (b) { return b - 2; })); autoNote('Rapid Shot', 'an extra ranged attack, –2 on all'); }
          var dmgMod = a.dmgMod + (a.row.vital ? a.firstExtra : 0) + (a.nat && hasWeapon && a.row.mode === 'nat1' && M.Str > 0 ? Math.floor(M.Str / 2) - M.Str : 0);
          return { name: a.name, count: a.nat ? Math.max(1, a.row.count || 1) : 1, bonuses: bonuses, touch: false, kind: kind === 'ranged' ? 'Ranged' : 'Melee',
            dice: a.dice, mod: dmgMod, threat: a.threat, mult: a.mult,
            rider: [a.row.rider || '', a.firstExtra && !a.row.vital ? '+' + a.firstExtra + ' damage on the first attack (Dragon Style)' : ''].filter(Boolean).join(', ') };
        }));
      });
    });
    // spells
    var sf = featArg('Spell Focus'), gsf = featArg('Greater Spell Focus'), sspec = featArg('Spell Specialization');
    D.casters = S.casters.map(function (c) {
      var am = mod(S.abil[c.abil] ? score(c.abil) : 10), cl = Math.max(1, Math.min(20, (c.cl || 1) + (D.sw ? D.sw.karma.cl : 0)));
      var out = { c: c, cl: cl, conc: cl + am, spells: [] };
      out.spells = c.spells.map(function (sp) {
        var info = SPELLS[sp.u] || {}, lvl = sp.lvl || 0;
        if (sp.fp) { var fpw = FP_BY[sp.n.toLowerCase()] || {}; info = { n: fpw.n || sp.n, sv: fpw.save, du: fpw.dur }; }
        var sv = String(info.sv || '').replace(/\s*\(harmless[^)]*\)/ig, '').trim();
        var noSave = !sv || /^(none|no|—|-)$/i.test(sv) || /see text/i.test(sv) && sv.length < 12;
        var b = { name: ((sp.as ? sp.as + (sp.as.toLowerCase().indexOf(String(info.n || sp.n).toLowerCase()) >= 0 ? '' : ' (' + (info.n || sp.n) + ')') : info.n || sp.n) || '').toLowerCase(), page: sp.u || '', lvl: lvl, uses: sp.uses };
        if (sp.fp) b.page = '';
        // Spell Focus / Greater Spell Focus: +1 DC each for their school; Spell Specialization: caster level +2 for that spell
        var school = String(info.s || '').toLowerCase(), sfN = school ? (sf.indexOf(school) >= 0 ? 1 : 0) + (gsf.indexOf(school) >= 0 ? 1 : 0) : 0;
        if (sfN) autoNote('Spell Focus (' + school + ')', '+1 DC with ' + school + ' spells');
        if (sfN > 1) autoNote('Greater Spell Focus (' + school + ')', '+1 more DC with ' + school + ' spells');
        var spec = sspec.indexOf(b.name) >= 0 ? 2 : 0, scl = Math.min(20, cl + spec);
        if (spec) { autoNote('Spell Specialization (' + b.name + ')', b.name + ' at caster level ' + scl); b.name += ' (CL ' + scl + ')'; }
        if (!noSave) { b.dc = 10 + lvl + am + sfN + (D.sw ? D.sw.karma.dc : 0); b.save = sv; }
        var r = (DATA.rolls[sp.u] || [])[scl - 1];
        if (r) Object.keys(r).forEach(function (k) { b[k] = r[k]; });
        if (sp.conv) { b.name += ' [' + sp.conv + ']'; if (b.damageLabel) b.damageLabel = b.damageLabel.replace(ENERGY_RE, sp.conv); }
        var du = durationAt(info.du, scl); if (du) b.duration = du;
        if (c.kind === 'Force Powers') b.cost = sp.fp && FP_BY[sp.n.toLowerCase()] ? FP_BY[sp.n.toLowerCase()].cost : SW_COST[lvl];
        return b;
      });
      return out;
    });
    return D;
  }

  // the creature in the form of the monster pages' Roll20 data (see roll20-export.js)
  function roll20Data(D) {
    var MT = mythicTier();
    var m = { name: S.name || 'Enemy', cr: String(S.cr || '') + (MT ? '/MR ' + MT : ''), xp: XP[S.cr] ? String(XP[S.cr]) : '' };
    m.line = [S.align, S.size, S.type + (S.subtypes ? ' (' + S.subtypes + ')' : '')].filter(Boolean).join(' ');
    var classText = (S.classes || []).filter(function (c) { return CLASS_BY[c.s]; }).map(function (c) {
      return CLASS_BY[c.s].n.toLowerCase() + ' ' + c.lvl + ((c.arch || []).length ? ' (' + c.arch.join(', ').toLowerCase() + ')' : '');
    }).join(' / ');
    if (classText) m.line = capFirst(classText) + '; ' + m.line;
    m.init = D.init;
    m.senses = [S.senses].concat(D.fx.senses).filter(Boolean).join(', ');
    if (S.aura) m.aura = S.aura;
    m.ac = D.acText.replace(/ \(.*$/, '');
    m.hp = D.hpText + (D.sw && D.sw.stamina ? '; ' + SUB.res + ' ' + D.sw.stamina : '');
    m.saves = { Fort: D.saves.Fort, Ref: D.saves.Ref, Will: D.saves.Will };
    var defs = [S.defense, D.fx.def.length ? 'Defensive Abilities ' + D.fx.def.join(', ') : '', D.fx.dr ? 'DR ' + D.fx.dr + '/—' : ''].filter(Boolean).join('; ');
    if (defs) m.defense = defs;
    m.speed = addSpeed(S.speed, D.fx.speed);
    m.melee = D.groups.melee; m.ranged = D.groups.ranged;
    m.rangedTouch = D.rangedTouch; m.meleeTouch = D.meleeTouch;
    if (S.specialAttacks) m.specialAttacks = S.specialAttacks;
    m.spells = D.casters.filter(function (c) { return c.spells.length; }).map(function (c) {
      var sla = c.c.kind === 'Spell-Like Abilities', groups = {}, order = [];
      c.spells.forEach(function (s) {
        var label = sla ? (s.uses || 'At will') : ord(s.lvl) + (c.c.kind === 'Spells Known' && s.uses ? ' (' + s.uses + ')' : '');
        if (!groups[label]) { groups[label] = []; order.push({ label: label, lvl: s.lvl, sla: sla }); }
        var b = {};
        Object.keys(s).forEach(function (k) { if (k !== 'lvl' && k !== 'uses') b[k] = s[k]; });
        if (s.cost) { b.effect = (b.effect ? b.effect + '; ' : '') + SUB.res + ' ' + s.cost; delete b.cost; }
        if (!sla && c.c.kind === 'Spells Prepared' && s.uses && /^\d+$/.test(String(s.uses)) && +s.uses > 1) b.note = String(s.uses);
        groups[label].push(b);
      });
      var rank = function (l) { var t = l.label.toLowerCase(); return l.sla ? (/constant/.test(t) ? 0 : /will/.test(t) ? 1 : 100 - (parseInt(t, 10) || 0)) : -l.lvl; };
      order.sort(function (a, b) { return rank(a) - rank(b); });
      return { title: c.c.title || (c.c.cls && !sla ? c.c.cls.replace(/^./, function (x) { return x.toUpperCase(); }) + ' ' : '') + kindLabel(c.c.kind), cl: c.cl, concentration: c.conc,
        levels: order.map(function (l) { return { label: l.label, spells: groups[l.label] }; }) };
    });
    if (!m.spells.length) delete m.spells;
    m.special = S.special.filter(function (s) { return s.name; }).map(function (s) { return { name: s.name, type: s.type || '', text: s.text || '' }; });
    // mythic (Unbound Path): its power and the path abilities bought with its points
    if (MT) {
      m.special.push({ name: 'Mythic Power', type: 'Su', text: (2 + MT) + '/day. Mythic tier ' + MT + ' (Unbound Path): its mythic abilities spend uses of it.' });
      S.mythic.picks.filter(function (p) { return p.kind === 'ability'; }).forEach(function (p) { m.special.push({ name: p.n, type: p.type || '', text: p.text || '' }); });
    }
    // the class's "Spells" feature is only how its casting works: the spell block shows the spells themselves
    D.features.filter(function (x) { return x.on && !(m.spells && /^(spells|spellcasting|cantrips|orisons)$/.test(x.base)); }).forEach(function (x) {
      var nm = x.label || x.name, b = { name: nm, type: x.type, text: x.text || nm };
      var dice = nm.match(/\b\d+d\d+(?:[+-]\d+)?/);
      if (dice) b.rolls = [[nm.replace(/\s*\+?\d+d\d+.*$/, '') || 'roll', dice[0]]];
      m.special.push(b);
    });
    m.abilities = ABIL.map(function (a) { return a + ' ' + ((a === 'Con' && (S.type === 'undead' || S.type === 'construct')) ? '—' : score(a)); }).join(', ');
    m.combat = 'BAB ' + sgn(D.bab).replace('–', '-') + '; CMB ' + sgn(D.cmb).replace('–', '-') + '; CMD ' + D.cmd;
    m.checks = {};
    SKILLS.forEach(function (sk) { if (D.skills[sk[0]].shown) m.checks[sk[0]] = D.skills[sk[0]].total; });
    m.checks.CMB = D.cmb;
    var mfeats = MT ? S.mythic.picks.filter(function (p) { return p.kind === 'feat'; }).map(function (p) { return p.n; }) : [];
    if (D.feats.length || mfeats.length) m.feats = D.feats.concat(mfeats).join(', ');
    if (S.languages) m.languages = S.languages;
    if (S.sq) m.sq = S.sq;
    if (D.sw && (D.sw.force || S.sw.karma || S.sw.element)) m.sq = [S.sq, D.sw.force ? 'Force sensitive' : '', S.sw.karma ? 'karma ' + sgn(S.sw.karma).replace('–', '-') : '', S.sw.element ? 'elemental affinity (' + (S.sw.elements || [S.sw.element]).join(', ').toLowerCase() + ')' : ''].filter(Boolean).join(', ');
    if (S.gear) m.gear = S.gear;
    return m;
  }

  // ---------- stat block preview and text ----------
  function atkText(g) {
    return g.map(function (a) {
      return (a.count > 1 ? a.count + ' ' + a.name + (/s$/.test(a.name) ? '' : 's') : a.name) + ' ' + a.bonuses.map(sgn).join('/') + ' (' + a.dice + (a.mod ? sgn(a.mod) : '') +
        (a.threat < 20 ? '/' + a.threat + '–20' : '') + (a.mult > 2 ? '/×' + a.mult : '') + (a.rider ? ' ' + a.rider : '') + ')';
    }).join(', ');
  }
  function spellText(c) {
    return c.levels.map(function (l) {
      return l.label + '—' + l.spells.map(function (s) { return s.name + (s.dc ? ' (DC ' + s.dc + ')' : ''); }).join(', ');
    });
  }
  function statBlock(D, m, md) {
    var B = md ? function (s) { return '**' + s + '**'; } : function (s) { return '<b>' + esc(s) + '</b>'; };
    var T = md ? function (s) { return s; } : esc;
    var L = [], br = md ? '  ' : '';
    var head = function (s) { L.push(md ? '\n**' + s + '**\n' : '<p class="eb-sec">' + esc(s) + '</p>'); };
    L.push(md ? '## ' + m.name + (m.cr ? ' (CR ' + m.cr + ')' : '') + '\n' : '<h3>' + esc(m.name) + (m.cr ? ' <small>CR ' + esc(m.cr) + '</small>' : '') + '</h3>');
    var p = [];
    if (m.xp) p.push(B('XP') + ' ' + T(Number(m.xp).toLocaleString('en-US')));
    m.line.split('; ').forEach(function (l) { p.push(T(l)); });
    var per = D.skills.Perception.total;
    p.push(B('Init') + ' ' + sgn(m.init) + '; ' + B('Senses') + ' ' + T((m.senses ? m.senses + '; ' : '') + 'Perception ' + sgn(per)));
    if (m.aura) p.push(B('Aura') + ' ' + T(m.aura));
    var lines = function (arr) { L.push(md ? arr.join(br + '\n') : '<p>' + arr.join('<br>') + '</p>'); };
    lines(p);
    head('Defense');
    p = [B('AC') + ' ' + T(D.acText), B('hp') + ' ' + T(m.hp), B('Fort') + ' ' + sgn(m.saves.Fort) + ', ' + B('Ref') + ' ' + sgn(m.saves.Ref) + ', ' + B('Will') + ' ' + sgn(m.saves.Will)];
    if (m.defense) p.push(T(m.defense));
    lines(p);
    head('Offense');
    p = [B('Speed') + ' ' + T(m.speed)];
    if (m.melee.length) p.push(B('Melee') + ' ' + T(m.melee.map(atkText).join(' or ')));
    if (m.ranged.length) p.push(B('Ranged') + ' ' + T(m.ranged.map(atkText).join(' or ')));
    if (m.specialAttacks) p.push(B('Special Attacks') + ' ' + T(m.specialAttacks));
    (m.spells || []).forEach(function (c) {
      p.push(B(c.title) + ' (CL ' + ord(c.cl) + '; concentration ' + sgn(c.concentration) + ')');
      spellText(c).forEach(function (t) { p.push((md ? '&nbsp;&nbsp;' : '&nbsp;&nbsp;') + T(t)); });
    });
    lines(p);
    head('Statistics');
    p = [T(m.abilities).replace(/(Str|Dex|Con|Int|Wis|Cha) /g, function (_, a) { return B(a) + ' '; }),
      B('Base Atk') + ' ' + sgn(D.bab) + '; ' + B('CMB') + ' ' + sgn(D.cmb) + '; ' + B('CMD') + ' ' + D.cmd];
    if (m.feats) p.push(B('Feats') + ' ' + T(m.feats));
    var sk = SKILLS.filter(function (s) { return D.skills[s[0]].shown; }).map(function (s) { return ((SWM && SW_SKILL[s[0]]) || s[0]) + ' ' + sgn(D.skills[s[0]].total); });
    if (sk.length) p.push(B('Skills') + ' ' + T(sk.join(', ')));
    if (m.languages) p.push(B('Languages') + ' ' + T(m.languages));
    if (m.sq) p.push(B('SQ') + ' ' + T(m.sq));
    if (m.gear) p.push(B('Gear') + ' ' + T(m.gear));
    lines(p);
    if (m.special.length) {
      head('Special Abilities');
      m.special.forEach(function (s) { L.push(md ? '**' + s.name + (s.type ? ' (' + s.type + ')' : '') + '** ' + s.text + '\n' : '<p>' + B(s.name + (s.type ? ' (' + s.type + ')' : '')) + ' ' + esc(s.text) + '</p>'); });
    }
    return L.join(md ? '\n' : '');
  }

  // ---------- mythic tiers (rules/mythic/unbound-path.md) ----------
  // 2 mythic points per tier, spent on path abilities of any path (their cost, at their tier) or mythic feats (1 each)
  function mythicTier() { return S.mythic && S.mythic.tier > 0 ? S.mythic.tier : 0; }
  var MYTHIC_ENTRIES = null;
  function mythicEntries() {
    if (MYTHIC_ENTRIES || !DATA.mythic) return MYTHIC_ENTRIES || {};
    var by = {};
    DATA.mythic.abilities.forEach(function (a) { by[a.n + ' — [' + a.cost + '] ' + a.path + ', tier ' + a.tier] = { kind: 'ability', n: a.n, cost: a.cost, tier: a.tier, type: a.type, path: a.path, text: a.text + (a.note ? ' (' + a.note + ')' : ''), link: 'rules/mythic/unbound-path/#' + a.u }; });
    DATA.mythic.feats.forEach(function (n) { by[n + ' — [1] mythic feat'] = { kind: 'feat', n: n, cost: 1, tier: 1, link: 'rules/feats/' + (featSlug(n) || '') + '/' }; });
    return (MYTHIC_ENTRIES = by);
  }
  function mythicSpent() { return (S.mythic.picks || []).reduce(function (t, p) { return t + (p.cost || 0); }, 0); }
  function mythicCard() {
    S.mythic = S.mythic || { tier: 0, picks: [] };
    return card('Mythic tier', slot(function (redraw) {
      var T = mythicTier(), spent = mythicSpent(), by = mythicEntries();
      var msg = h('small', { class: 'eb-over' });
      var input = h('input', { type: 'text', class: 'eb-t eb-wide', placeholder: 'type to search the path abilities and mythic feats…' });
      input.setAttribute('list', 'eb-mythic-list');
      var add = function () {
        var e = by[input.value]; if (!e) return;
        if (e.tier > T) { msg.textContent = e.n + ' needs mythic tier ' + e.tier + '.'; return; }
        if (spent + e.cost > 2 * T) { msg.textContent = 'Not enough mythic points: ' + (2 * T - spent) + ' left, ' + e.n + ' costs ' + e.cost + '.'; return; }
        S.mythic.picks.push({ kind: e.kind, n: e.n, cost: e.cost, type: e.type || '', text: e.text || '', link: e.link });
        input.value = ''; changed(); redraw();
      };
      input.addEventListener('input', function () { if (by[input.value]) add(); });
      input.addEventListener('change', add);
      var over = spent > 2 * T;
      return h('div', null,
        h('div', { class: 'eb-grid' },
          field('Mythic tier', numBox(function () { return S.mythic.tier || 0; }, function (v) { S.mythic.tier = v; }, { min: 0, max: 10 }), '0 = not mythic'),
          T ? h('p', { class: 'eb-out' }, h('span', { class: over ? 'eb-over' : '', text: spent + '/' + (2 * T) + ' mythic points' }), ' · mythic power ' + (2 + T) + '/day · CR shown as ' + (S.cr || '?') + '/MR ' + T) : null),
        T ? h('div', { class: 'eb-chips' }, S.mythic.picks.map(function (p, i) {
          return h('span', { class: 'eb-chip', title: p.text || '' }, h('a', { href: new URL(p.link, BASE).href, target: '_blank', text: p.n }), ' ', h('small', { text: '[' + p.cost + ']' }),
            h('button', { type: 'button', class: 'eb-x', text: '×', onclick: function () { S.mythic.picks.splice(i, 1); changed(); redraw(); } }));
        })) : null,
        T && spent < 2 * T ? h('div', { class: 'eb-inline' }, input) : null, msg,
        h('p', { class: 'eb-note', html: 'With the table\'s <a href="' + esc(new URL('rules/mythic/unbound-path/', BASE).href) + '" target="_blank">Unbound Path</a>: each tier gives 2 mythic points for path abilities of any path (their cost in brackets, at their tier or later) or mythic feats (1 each), and nothing else; mythic power is 2 + tier per day. The CR stays the one you set; the tiers go on top, as for a mythic party of that level.' }));
    }));
  }
  // what a random mythic enemy buys: abilities of the paths that fit it (and the universal ones), and mythic versions of
  // feats it has; never ones for exploration, crafting, companions or shapechanging
  var MYTHIC_BAN = /display of|commune|craft|longevity|sustenance|item|tongues|sleepless|knot|clown|drinker|traveler|tracker|mounted|steed|familiar|companion|animal|plant|flowers|pilgrim|sanctum|star walker|interplanar|farwalker|scry|crime spree|dilettante|wall run|climbing|swimming|bounty|knowledgeable|commanding entrance|fast friends|stones will weep|demagogue|mob ruler|binding ritual|beyond morality|unchanging|pure |enhance magic|insightful|impeccable intuition|hear the word|alignment insight|knowledge|mimic|performance|prestidigitation|trap|glide|seven-league|feather step|shap|shift|wild shape|many forms|transformative|life current|summons|raise animal|endless|recalled|overcome curse|undying|water of life/i;
  var MYTHIC_PATHS = { brute: { Champion: 3, Guardian: 3 }, warrior: { Champion: 3, Guardian: 2, Marshal: 1 }, skirmisher: { Trickster: 3, Champion: 1 },
    caster: { Archmage: 3, Hierophant: 1 }, 'sw-warrior': { Champion: 3, Guardian: 2 }, 'sw-specialist': { Trickster: 3, Champion: 1 }, 'sw-consular': { Archmage: 3, Hierophant: 1 } };
  // abilities that need something the enemy has: a class feature to improve, weapons, a ranged attack, spells, a mind
  var MYTHIC_NEEDS = [[/rage/i, /barbarian|bloodrager|skald|rage/i], [/smite/i, /paladin|antipaladin|smite/i], [/\bki\b/i, /monk|ninja|\bki\b/i],
    [/bloodline/i, /sorcerer|bloodrager|bloodline/i], [/hex/i, /witch|shaman|hex/i], [/mythic school|flexible school/i, /wizard|school/i],
    [/domain/i, /cleric|warpriest|domain/i], [/channel/i, /cleric|paladin|warpriest|channel/i], [/weapon training/i, /fighter|weapon training/i],
    [/inspire|minion|rally|clarion|words of|aura of perseverance|shared alertness/i, null]];
  var MYTHIC_RANGED = /barrage|sniper|unstoppable shot|limitless range|fistful|hurler|deadly throw|ricochet|ranged disarm|ranged disable|aim for the eye|distant/i;
  var MYTHIC_WEAPON = /blade|disarm|sunder|parry|always armed|clean blade|precision critical|critical master|perfect strike|sweeping strike|maximized critical|weapon/i;
  var MYTHIC_CASTER = /spell|arcane|casting|caster|metamastery|counterspell|eldritch|mage strike|wild arcana|potency|component|summons|scrying|illusion|teleport|preparation|remixer|sieve/i;
  function mythicFits(e) {
    var n = e.n, have = (S.classes || []).map(function (c) { return (CLASS_BY[c.s] || {}).n || ''; }).join(' ') + ' ' + ((lastD && lastD.features) || []).map(function (x) { return x.name; }).join(' ')
      + ' ' + ((S.classes || [])[0] && S.classes[0].picks ? S.classes[0].picks.map(function (p) { return p.n; }).join(' ') : '');
    for (var i = 0; i < MYTHIC_NEEDS.length; i++) if (MYTHIC_NEEDS[i][0].test(n)) { if (!MYTHIC_NEEDS[i][1] || !MYTHIC_NEEDS[i][1].test(have)) return false; }
    var weapons = (S.weapons || []).filter(function (w) { return !/^nat/.test(w.mode); }), ranged = (S.weapons || []).some(function (w) { return /^(ranged|thrown)$/.test(w.mode); });
    if (MYTHIC_RANGED.test(n) && !ranged) return false;
    if (MYTHIC_WEAPON.test(n) && !weapons.length) return false;
    if (MYTHIC_CASTER.test(n) && !(S.casters || []).length) return false;
    if (/armor master|armored might|enduring armor/i.test(n) && !S.armor) return false;
    if (S.abil.Int <= 2 && /mind|minion|feint|lie|persuasive|tactical|inspire|command/i.test(n)) return false;
    return true;
  }
  function randomMythic(tier, concept) {
    S.mythic = { tier: tier, picks: [] };
    var by = mythicEntries(), list = Object.keys(by).map(function (k) { return by[k]; }), points = 2 * tier, used = {};
    var paths = Object.assign({ Universal: 1 }, MYTHIC_PATHS[concept] || { Champion: 1, Archmage: 1, Trickster: 1 });
    // a divine caster's power is the hierophant's
    if (concept === 'caster' && S.casters[0] && /cleric|druid|oracle|inquisitor|warpriest|shaman|spiritualist|hunter/.test(S.casters[0].cls || '')) { paths.Hierophant = 3; paths.Archmage = 1; }
    var mythicFeats = (S.feats || []).map(function (n) { return n.replace(/\s*\(.*$/, '') + ' (Mythic)'; }).filter(function (n, i, a) { return DATA.mythic.feats.indexOf(n) >= 0 && a.indexOf(n) === i; });
    var abilities = list.filter(function (e) { return e.kind === 'ability' && paths[e.path] && e.tier <= tier && e.cost >= 1 && !MYTHIC_BAN.test(e.n) && !(SWM && FLAVOR_BAN.test(e.n)) && mythicFits(e); });
    for (var guard = 0; points > 0 && guard < 50; guard++) {
      var e = null;
      if (mythicFeats.length && chance(0.35)) e = by[mythicFeats.shift() + ' — [1] mythic feat'];
      if (!e) {
        var pool = abilities.filter(function (a) { return a.cost <= points && !used[a.n]; });
        if (!pool.length) { if (mythicFeats.length) { e = by[mythicFeats.shift() + ' — [1] mythic feat']; } else break; }
        else {
          var ws = pool.map(function (a) { return paths[a.path] * (a.cost >= 2 ? 1.3 : 1); }), r = Math.random() * ws.reduce(function (x, y) { return x + y; }, 0);
          e = pool[pool.length - 1];
          for (var i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) { e = pool[i]; break; } }
        }
      }
      if (!e || used[e.n]) continue;
      used[e.n] = 1; points -= e.cost;
      S.mythic.picks.push({ kind: e.kind, n: e.n, cost: e.cost, type: e.type || '', text: e.text || '', link: e.link });
    }
  }

  // a random barbarian's rage powers (one at 2nd level and every 2 levels): often a stance first, then what it unlocks,
  // at their level and with the powers they need; ones only for senses or moving around are unlikely
  function randomRagePowers() {
    var c = S.classes.filter(function (x) { return x.s === 'barbarian'; })[0], n = Math.floor((c.lvl || 1) / 2), list = DATA.ragePowers || [], got = [];
    var has = function (name) { return got.some(function (p) { return p.n.toLowerCase() === name.toLowerCase(); }); };
    var ok = function (p) { return p.lvl <= c.lvl && !has(p.n) && p.needs.every(has); };
    // one stance is used at a time: after the first, more stances are unlikely and what builds on it likelier
    var weight = function (p) {
      var stance = /stance/i.test(p.n), haveStance = got.some(function (g) { return /stance/i.test(g.n); });
      return /vision|scent|climber|swimmer|leaper|sprint|swift foot/i.test(p.n) ? 0.2 : (stance ? (haveStance ? 0.25 : 2) : 1) + (p.needs.length ? 2.5 : 0);
    };
    for (var i = 0; i < n; i++) {
      var pool = list.filter(ok);
      if (!pool.length) break;
      var stances = pool.filter(function (p) { return /stance/i.test(p.n); });
      if (!i && stances.length && chance(0.7)) pool = stances;
      var ws = pool.map(weight), r = Math.random() * ws.reduce(function (a, b) { return a + b; }, 0), e = pool[pool.length - 1];
      for (var j = 0; j < pool.length; j++) { r -= ws[j]; if (r <= 0) { e = pool[j]; break; } }
      got.push(e);
    }
    got.forEach(function (p) { S.special.push({ name: p.n, type: p.type, text: 'Rage power. ' + p.text }); });
  }

  // ---- a random kineticist (characters/classes/kineticist.md): an element, its simple blast (1d6 at 1st and +1d6 at
  // every odd level; physical +1 per die + Con, energy + 1/2 Con), at 7th an expanded element and the composite blasts it
  // opens (2d6 per step, burn 2), its defense, infusions at 1st, 3rd, 5th, 9th, 11th, 13th, 17th and 19th, and a
  // utility wild talent every 2 levels
  var KIN_EL = { fire: ['fire blast'], air: ['air blast', 'electric blast'], earth: ['earth blast', 'acid blast'], water: ['water blast', 'cold blast'], aether: ['telekinetic blast'] };
  var KIN_BASIC = { fire: 'basic pyrokinesis', air: 'basic aerokinesis', earth: 'basic geokinesis', water: 'basic hydrokinesis', aether: 'basic telekinesis' };
  function randomKineticist(lvl) {
    var K = DATA.kineticist || { talents: {}, elements: {} }, TT = K.talents;
    setAbilKin();
    var prim = pick(Object.keys(KIN_EL)), known = [pick(KIN_EL[prim])], exp = null;
    if (lvl >= 7) {
      exp = chance(0.4) ? prim : pick(Object.keys(KIN_EL).filter(function (e) { return e !== prim; }));
      var other = KIN_EL[exp].filter(function (b) { return known.indexOf(b) < 0; });
      if (other.length) known.push(pick(other));
    }
    var reqOk = function (pre) {
      return pre.split(/,\s*/).every(function (p) {
        var m = p.match(/^(\w+) blast$/); if (m) return known.indexOf(m[1] + ' blast') >= 0;
        m = p.match(/primary element \((\w+)\)/); if (m) return prim === m[1];
        m = p.match(/expanded element \((\w+)\)/); if (m) return !!exp && (m[1] === 'any' || exp === m[1]);
        return false;
      });
    };
    var con = mod(score('Con')), steps = Math.ceil(lvl / 2);
    var blast = function (t, comp) {
      var dice = comp ? 2 * steps : steps, physical = t.blast === 'physical';
      var w = { n: t.n.toLowerCase(), mode: 'ranged', d: dice + 'd6', t: 20, x: 2, cat: 'ranged', single: true, dmgMisc: physical ? dice + con : Math.floor(con / 2),
        rider: t.damage + (physical ? '' : ', ranged touch') + (comp ? ', burn 2' : '') + ', 30 ft.' };
      return w;
    };
    var simple = known.map(function (b) { return TT[b]; }).filter(Boolean), comps = [];
    if (exp) Object.keys(TT).forEach(function (k) { var t = TT[k]; if (/composite blast/.test(t.type) && !t.only && t.blast !== 'special' && reqOk(t.pre)) comps.push(t); });
    S.weapons = comps.slice(0, 2).map(function (t) { return blast(t, true); }).concat(simple.map(function (t) { return blast(t, false); }));
    S.weapons.forEach(function (w, i) { w.opt = Math.min(3, i + 1); });
    S.armor = bestArmor('light');
    // talents: the element's lists (primary, expanded) and the universal one
    var els = [prim].concat(exp && exp !== prim ? [exp] : []).concat(['universal']);
    var pool = [];
    els.forEach(function (e) { (K.elements[e] || []).forEach(function (x) { var t = TT[x.n.toLowerCase()]; if (t && !t.only) pool.push({ x: x, t: t }); }); });
    var got = {}, maxL = Math.ceil(lvl / 2);
    Object.keys(KIN_BASIC).forEach(function (e) { got[titleCase(KIN_BASIC[e])] = 1; got[KIN_BASIC[e]] = 1; }); // the basic one comes free
    var take = function (inf, n) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var c = pool.filter(function (p) { return p.x.inf === inf && p.x.lvl <= maxL && !got[p.t.n]; });
        if (!c.length) break;
        // utility talents for exploring (sculptors, walking, senses, carrying) are unlikely
        var ws = c.map(function (p) { return (/sculptor|walk|climb|adaptation|haul|sense|sight|voice|steed|basic|skilled|traveler|healer/i.test(p.t.n) ? 0.2 : 1) + (inf ? 0.3 * p.x.lvl : 0); });
        var r = Math.random() * ws.reduce(function (a, b) { return a + b; }, 0), e = c[c.length - 1];
        for (var j = 0; j < c.length; j++) { r -= ws[j]; if (r <= 0) { e = c[j]; break; } }
        got[e.t.n] = 1; out.push(e.t);
      }
      return out;
    };
    var infusions = take(true, [1, 3, 5, 9, 11, 13, 17, 19].filter(function (l) { return l <= lvl; }).length), utilities = take(false, Math.floor(lvl / 2));
    var def = Object.keys(TT).map(function (k) { return TT[k]; }).filter(function (t) { return /defense/.test(t.type) && t.element === prim; })[0];
    var burnMax = 3 + con, overflow = lvl >= 3 ? Math.floor(lvl / 3) : 0;
    S.special.push({ name: 'Kinetic Blast', type: 'Sp', text: 'Element ' + prim + (exp ? ', expanded element ' + exp : '') + '. At will, a standard action, 30 ft.: ' +
      S.weapons.map(function (w) { return w.n + ' ' + w.d; }).join(', ') + '. Physical blasts add 1 per die + Con, energy blasts 1/2 Con and are ranged touch attacks; composite blasts cost 2 burn. ' +
      'Burn: each point deals ' + lvl + ' nonlethal damage until a full night\'s rest, up to ' + burnMax + ' points.' + (overflow ? ' Elemental overflow: +1 attack and +2 damage with blasts per point of burn, up to +' + overflow + '.' : '') });
    if (def && lvl >= 2) S.special.push({ name: def.n, type: 'Su', text: def.text });
    infusions.forEach(function (t) { S.special.push({ name: t.n, type: 'Su', text: '(' + t.type + ', burn ' + t.burn + ') ' + t.text }); });
    S.special.push({ name: 'Wild Talents', type: 'Sp', text: [KIN_BASIC[prim]].concat(utilities.map(function (t) { return t.n.toLowerCase(); })).join(', ') + '.' });
    S.sq = [S.sq, 'elemental focus (' + prim + ')' + (exp ? ', expanded element (' + exp + ')' : '')].filter(Boolean).join(', ');
  }
  // a kineticist lives on Con, then Dex for its blasts
  // a random kinetic shinobi: its kinetic blast only as a jutsu weapon in hand (physical jutsu: 1d4 + Cha against AC;
  // elemental jutsu: 1d4 against touch AC, sneak attack in d4s), Dex to hit with Weapon Finesse, Cha for damage and DCs
  function randomShinobi() {
    ['Dex', 'Cha', 'Con', 'Wis', 'Str', 'Int'].forEach(function (a, i) { S.abil[a] = [18, 16, 14, 12, 10, 8][i]; });
    var lv = (S.classes[0] || {}).lvl || 1;
    S.abil.Dex += 2 * Math.floor(lv / 4);
    var phys = pick(['earth', 'water', 'aether', 'wood', 'metal']), energy = pick(['fire', 'electricity', 'cold']);
    S.weapons = [{ n: 'physical jutsu (' + phys + ')', mode: 'melee', d: '1d4', t: 20, x: 2, cat: 'light', finesse: true, dmgAbil: 'Cha', opt: 1, innate: true, rider: 'kinetic blast' },
      { n: 'elemental jutsu (' + energy + ')', mode: 'melee', d: '1d4', t: 20, x: 2, cat: 'light', finesse: true, dmgAbil: 'none', opt: 2, innate: true, rider: energy + ', against touch AC, sneak attack in d4s' }];
    S.armor = bestArmor('light'); S.shield = '';
  }
  function setAbilKin() {
    var b = [18, 16, 12, 10, 10, 8], o = ['Con', 'Dex', 'Wis', 'Str', 'Int', 'Cha'];
    o.forEach(function (a, i) { S.abil[a] = b[i]; });
    var lv = (S.classes[0] || {}).lvl || 1;
    S.abil.Con += 2 * Math.floor(lv / 4) + (lv >= 6 ? 2 : 0) + (lv >= 11 ? 2 : 0) + (lv >= 16 ? 2 : 0);
  }

  // ---- strong archetypes a random classed enemy sometimes has (about half the time, when its class has some here)
  var STRONG_ARCH = { wizard: ['Exploiter Wizard', 'Spell Sage'], sorcerer: ['Crossblooded', 'Seeker', 'Wildblooded'], cleric: ['Ecclesitheurge', 'Cloistered Cleric', 'Separatist'],
    druid: ['Feyspeaker', 'Menhir Savant', 'Goliath Druid'], witch: ['Ley Line Guardian'], oracle: ['Dual-Cursed Oracle', 'Seeker'], bard: ['Archaeologist', 'Dervish Dancer', 'Archivist', 'Longbow Minstrel'],
    magus: ['Kensai', 'Hexcrafter', 'Myrmidarch', 'Bladebound'], inquisitor: ['Sanctified Slayer'], fighter: ['Mobile Fighter', 'Two-Handed Fighter', 'Lore Warden', 'Polearm Master', 'Weapon Master'],
    barbarian: ['Invulnerable Rager', 'Titan Mauler', 'Urban Barbarian'], ranger: ['Skirmisher', 'Freebooter', 'Guide', 'Trophy Hunter'], paladin: ['Sacred Shield', 'Tortured Crusader', 'Oathbound Paladin'],
    swashbuckler: ['Inspired Blade', 'Mysterious Avenger', 'Flying Blade'], gunslinger: ['Musket Master', 'Pistolero'], 'unchained-rogue': ['Scout', 'Knife Master', 'Sniper', 'Thug'],
    'unchained-monk': ['Scaled Fist'], monk: ['Sohei', 'Monk of the Four Winds'], alchemist: ['Grenadier', 'Mindchemist'], investigator: ['Empiricist', 'Mastermind'], brawler: ['Snakebite Striker', 'Strangler', 'Wild Child'],
    bloodrager: ['Primalist', 'Steelblood'], arcanist: ['School Savant', 'Blood Arcanist'], slayer: ['Sniper', 'Vanguard', 'Cleaner'], cavalier: ['Huntmaster', 'Standard Bearer'],
    warpriest: ['Sacred Fist', 'Champion of the Faith'], hunter: ['Primal Companion Hunter', 'Feral Hunter'], skald: ['Urban Skald', 'War Drummer'] };
  function randomArchetype(c) {
    // the table's own takes on two classes, not in the archetype lists: the White-Haired Witch (a whole reworked witch)
    // and the sin specialist wizard (docs/magic/variant-magic.md)
    if (c.s === 'witch' && chance(0.45)) { c.arch = ['White-Haired Witch']; c.whw = true; return; }
    if (c.s === 'wizard' && chance(0.3)) { c.sin = pick(Object.keys(SINS)); return; }
    // the master of many styles (monk-archetypes.md): bonus style feats without their prerequisites, fused stances
    if (c.s === 'monk' && chance(0.4)) { c.arch = ['Master of Many Styles']; c.moms = true; return; }
    var A = ARCH[c.s], list = STRONG_ARCH[c.s];
    if (!list || !A || A === 'loading' || (c.s !== 'monk' && !chance(0.5))) return;
    var have = list.filter(function (n) { return A.archetypes.some(function (a) { return a.name === n; }); });
    if (have.length) c.arch = [pick(have)];
    if (c.arch[0] === 'Oathbound Paladin') c.oath = 'Oath of Vengeance';
  }
  // the seven sin schools: [school, prohibited schools]
  var SINS = { envy: ['abjuration', 'evocation', 'necromancy'], gluttony: ['necromancy', 'abjuration', 'enchantment'], greed: ['transmutation', 'enchantment', 'illusion'],
    lust: ['enchantment', 'necromancy', 'transmutation'], pride: ['illusion', 'conjuration', 'transmutation'], sloth: ['conjuration', 'evocation', 'illusion'],
    wrath: ['evocation', 'abjuration', 'conjuration'] };
  // what those choices add once the enemy has its spells and weapons
  function archetypeExtras() {
    (S.classes || []).forEach(function (c) {
      var L = c.lvl || 1;
      // White-Haired Witch (docs/characters/classes/white-haired-witch.md): 3/4 BAB, d8, its hair (1d4 + Int, reach, grab), iteratives with it from 6th
      if (c.whw) {
        var main = c === S.classes[0], wl = L;
        var hair = { n: 'white hair', mode: 'melee', d: '1d4', t: 20, x: 2, cat: 'light', dmgAbil: 'Int', single: wl < 6,
          babAdj: wl >= 6 ? wl - Math.floor(wl / 2) : Math.floor(wl * 3 / 4) - Math.floor(wl / 2), misc: wl >= 6 ? Math.floor(wl * 3 / 4) - wl : 0,
          rider: 'grab, reach ' + Math.min(30, 5 + 5 * Math.floor(wl / 4)) + ' ft.' + (wl >= 2 ? ', trip' : '') + (wl >= 5 ? ', pull' : '') };
        S.weapons = [hair].concat(main ? [] : S.weapons);
        S.hpMisc = (S.hpMisc || 0) + wl * (S.maxHp === false ? 1 : 2);
        S.special.push({ name: 'White Hair', type: 'Su', text: 'A primary natural attack, 1d4 + Int, reach ' + Math.min(30, 5 + 5 * Math.floor(wl / 4)) + ' ft.; on a hit it can grapple as a free action' +
          (wl >= 2 ? ', and trip' : '') + (wl >= 4 ? '; it constricts a grappled foe' : '') + (wl >= 5 ? ', and can pull 5 ft.' : '') + (wl >= 7 ? '; a grappled foe is strangled' : '') + '.' +
          (wl >= 6 ? ' It makes iterative attacks as a manufactured weapon, counting its witch level as base attack bonus for them.' : '') + ' White-Haired Witch: 3/4 BAB and d8 Hit Dice from its witch levels.' });
        // Hex Strike at 5th, a bonus feat (taken with the feats)
        if (wl >= 5 && featOk('Hex Strike')) S.bonusFeats = (S.bonusFeats || 0) + 1;
        // a whole White-Haired Witch casts as a magus: witch spells up to 6th
        if (main) S.casters.forEach(function (k) { if (k.cls === 'witch') k.spells = k.spells.filter(function (x) { return x.lvl <= Math.max(1, Math.floor((L + 2) / 3)); }); });
      }
      // sin specialist: never its prohibited schools; two more slots a level for the same spell of its school
      if (c.sin) {
        var sin = SINS[c.sin], k = S.casters.filter(function (x) { return x.cls === 'wizard'; })[0];
        if (k) {
          k.spells = k.spells.filter(function (x) { var sp = SPELLS[x.u]; return !sp || sin.slice(1).indexOf(sp.s) < 0; });
          var levels = {};
          k.spells.forEach(function (x) { levels[x.lvl] = 1; });
          Object.keys(levels).map(Number).filter(function (l) { return l > 0; }).forEach(function (l) {
            var own = k.spells.filter(function (x) { return x.lvl === l && SPELLS[x.u] && SPELLS[x.u].s === sin[0]; })[0];
            if (!own) {
              var pool = Object.keys(SPELLS).map(function (u) { return SPELLS[u]; }).filter(function (sp) { return sp.s === sin[0] && sp.l && sp.l.wizard === l; });
              pool.sort(function (a, b) { return (DATA.rolls[b.u] ? 1 : 0) - (DATA.rolls[a.u] ? 1 : 0) + Math.random() - 0.5; });
              if (pool[0]) { own = { n: pool[0].n, u: pool[0].u, lvl: l, uses: 1 }; k.spells.push(own); }
            }
            if (own) own.uses = (+own.uses || 1) + 2;
          });
        }
        S.sq = [S.sq, 'sin specialist (' + c.sin + ': ' + sin[0] + '; prohibited ' + sin.slice(1).join(' and ') + ')'].filter(Boolean).join(', ');
        S.special.push({ name: 'Sin Magic', type: 'Su', text: capFirst(c.sin) + ' (' + sin[0] + '): two extra slots of each spell level it can cast, both for the same ' + sin[0] + ' spell (prepared twice more); it can never prepare ' + sin.slice(1).join(' or ') + ' spells.' });
      }
      // master of many styles: a bonus style feat at 1st, 2nd and every 4 levels (6th, 10th...), taken with the feats
      if (c.moms) {
        S.bonusFeats = (S.bonusFeats || 0) + [1, 2, 6, 10, 14, 18].filter(function (l) { return l <= L; }).length;
        S.special.push({ name: 'Fuse Style', type: 'Ex', text: 'It can have the stances of ' + (L >= 20 ? 'five' : L >= 15 ? 'four' : L >= 8 ? 'three' : 'two') + ' style feats active at once' +
          (L >= 8 ? ', entering up to three as a swift action, and gains +1 on attack rolls per active style' : '') + '. Its bonus style feats ignore their prerequisites.' });
      }
      // the oathbound paladin's oath
      if (c.oath && DATA.oaths && DATA.oaths[c.oath]) {
        S.sq = [S.sq, c.oath.toLowerCase()].filter(Boolean).join(', ');
        DATA.oaths[c.oath].filter(function (o) { return o.lvl <= L; }).forEach(function (o) { S.special.push({ name: o.n, type: o.type, text: c.oath + '. ' + o.text }); });
      }
    });
  }
  // ---- a multiclass dip now and then: 2 monk levels (the table's anti-dip rule gives Wis to AC, flurry and the first bonus
  // feat at 2nd) for Wis casters fighting unarmored, 1-2 fighter levels for bonus feats, or 2 White-Haired Witch levels
  // for an Int fighter (its hair with Int to damage)
  function randomDip(c, concept) {
    var forced = RAND_FORCE && RAND_FORCE.dip;
    if (RAND_FORCE) { if (forced) applyDip(c, forced); return; }
    if ((c.lvl || 1) < 5 || /^(kineticist|alchemist|shifter|monk|unchained-monk|fighter)$/.test(c.s) || !chance(0.3)) return;
    var opts = [];
    if (/^(druid|cleric|shaman|hunter|inquisitor|oracle|warpriest)$/.test(c.s)) opts.push({ s: 'monk', lvl: 2 });
    if (concept === 'warrior' || concept === 'skirmisher' || /magus/.test(c.s)) opts.push({ s: 'fighter', lvl: pick([1, 2, 2]) });
    if (/magus|investigator/.test(c.s)) opts.push({ s: 'witch', lvl: 2, whw: true });
    if (!opts.length) return;
    applyDip(c, pick(opts));
  }
  function applyDip(c, d) {
    if (!CLASS_BY[d.s]) return;
    c.lvl = Math.max(1, c.lvl - d.lvl);
    var dc = { s: d.s, lvl: d.lvl, arch: d.whw ? ['White-Haired Witch'] : [], off: [], whw: !!d.whw };
    S.classes.push(dc);
    loadArch(d.s);
    if (d.s === 'monk') { S.armor = ''; S.shield = ''; S.abil.Wis = Math.max(S.abil.Wis, 16); }
    RAND_LAST.dip = d;
  }

  // ---- a random alchemist (characters/classes/alchemist.md): bombs (1d6 + Int, +1d6 at every odd level, ranged touch,
  // 20 ft., level + Int a day), extracts, a mutagen and discoveries (one at 2nd and every 2 levels), mostly bomb ones
  function randomAlchemist(lvl, T) {
    var b = [18, 16, 14, 12, 10, 8], o = ['Int', 'Dex', 'Con', 'Wis', 'Str', 'Cha'];
    o.forEach(function (a, i) { S.abil[a] = b[i]; });
    S.abil.Int += 2 * Math.floor(lvl / 4) + (lvl >= 6 ? 2 : 0) + (lvl >= 11 ? 2 : 0);
    var list = (DATA.alchemist || {}).discoveries || [], got = [];
    var has = function (n) { return got.some(function (d) { return d.n.toLowerCase() === n.toLowerCase(); }); };
    var useless = /potion|dilution|poison|elixir|combine|eternal/i;
    for (var i = 0; i < Math.min(9, Math.floor(lvl / 2)); i++) {
      var pool = list.filter(function (d) { return d.lvl <= lvl && !has(d.n) && d.needs.every(has); });
      if (!pool.length) break;
      var ws = pool.map(function (d) { return useless.test(d.n) ? 0.15 : /fast bombs|precise|explosive|greater mutagen|grand mutagen|madness|sticky|dispelling/i.test(d.n) ? 3 : d.bomb ? 1.5 : 1; });
      var r = Math.random() * ws.reduce(function (x, y) { return x + y; }, 0), e = pool[pool.length - 1];
      for (var j = 0; j < pool.length; j++) { r -= ws[j]; if (r <= 0) { e = pool[j]; break; } }
      got.push(e);
    }
    var int = mod(score('Int')), dice = Math.ceil(lvl / 2), fast = has('Fast bombs');
    var energy = got.filter(function (d) { return /^(acid|frost|shock|force|concussive) bomb$/i.test(d.n); }).map(function (d) { return d.n.split(' ')[0].toLowerCase(); });
    S.weapons = [{ n: 'bomb', mode: 'thrown', d: dice + (energy[0] === 'force' ? 'd4' : 'd6'), t: 20, x: 2, cat: 'ranged', fixed: true, single: !fast, dmgMisc: int,
      rider: (energy[0] === 'frost' ? 'cold' : energy[0] === 'shock' ? 'electricity' : energy[0] === 'concussive' ? 'sonic' : energy[0] || 'fire') + ', ranged touch, splash ' + (dice + int) + ', 20 ft.' }];
    S.weapons.push(makeAttack(firstWeapon(['Dagger', 'Short sword', 'Light crossbow'], ['light'])));
    S.weapons[1].opt = 2;
    S.armor = bestArmor('light');
    var mut = pick(['Dex', 'Dex', 'Con', 'Str']);
    S.special.push({ name: 'Bomb', type: 'Su', text: (lvl + int) + '/day, a standard action' + (fast ? ' (a full attack with Fast bombs)' : '') + ': ' + dice + 'd6' + sgn(int).replace('–', '-') + ' fire on a direct hit, splash ' + (dice + int) + ' in 5 ft. (Reflex DC ' + (10 + Math.floor(lvl / 2) + int) + ' half).' + (energy.length ? ' Its bombs can be ' + energy.join(', ') + '.' : '') });
    S.special.push({ name: 'Mutagen', type: 'Su', text: 'A standard action to drink: +4 ' + mut + ', +2 natural armor and –2 ' + (mut === 'Str' ? 'Int' : mut === 'Dex' ? 'Wis' : 'Cha') + ' for ' + (10 * lvl) + ' minutes' + (has('Greater mutagen') ? ' (greater: +6/+4, +4 natural armor)' : '') + '.' });
    got.forEach(function (d) { S.special.push({ name: d.n, type: 'Su', text: 'Discovery. ' + d.text }); });
    // extracts: the alchemist's list, Int, as a 6-level caster
    var top = Math.max(1, Math.min(6, Math.floor((lvl + 2) / 3)));
    S.casters.push({ kind: 'Spells Prepared', cls: 'alchemist', cl: lvl, abil: 'Int', title: 'Alchemist Extracts Prepared',
      spells: randomSpells('alchemist', top, 2, function () { return 1; }).filter(function (x) { return x.lvl > 0; }) });
  }

  // ---- a random Canefinder shifter (characters/classes/shifter.md): two shifter claws (1d4; 1d6 at 7th, 1d8 at 11th, 1d10 at
  // 13th, x3 at 17th), aspects (one at 1st and one more at 5th, 9th, 13th and 17th) and no armor, for Defensive Instinct
  function randomShifter(lvl) {
    var b = [16, 16, 14, 12, 10, 8], o = ['Str', 'Wis', 'Con', 'Dex', 'Int', 'Cha'];
    o.forEach(function (a, i) { S.abil[a] = b[i]; });
    S.abil.Str += 2 * Math.floor(lvl / 4); S.abil.Wis += lvl >= 8 ? 2 : 0;
    var claw = makeAttack('claw');
    claw.count = 2; claw.mode = 'nat1'; claw.d = lvl >= 13 ? '1d10' : lvl >= 11 ? '1d8' : lvl >= 7 ? '1d6' : '1d4'; claw.x = lvl >= 17 ? 3 : 2; claw.n = 'shifter claw';
    S.weapons = [claw];
    S.armor = ''; S.shield = '';
    var n = 1 + [5, 9, 13, 17].filter(function (l) { return l <= lvl; }).length, aspects = shuffle((DATA.shifterAspects || []).slice()).slice(0, n);
    S.special.push({ name: 'Shifter Aspects', type: 'Su', text: aspects.map(function (a) { return a.n; }).join(', ') + '. It takes the form of ' + (lvl >= 14 ? 'up to three of them at once' : lvl >= 9 ? 'two of them at once' : 'one at a time') + ' as a swift action, for ' + (3 + lvl) + ' minutes a day.' });
    aspects.forEach(function (a) { S.special.push({ name: a.n + ' aspect', type: 'Su', text: 'Minor form: ' + a.minor + (a.major ? ' Major form: ' + a.major : '') }); });
    if (lvl >= 6) S.special.push({ name: 'Shifter\'s Fury', type: 'Ex', text: 'A full attack with one natural weapon instead of all: +' + (lvl >= 16 ? '3 iterative attacks' : lvl >= 11 ? '2 iterative attacks' : '1 iterative attack') + ' (–5 each), the others secondary.' });
  }

  // ---------- a random enemy for a CR ----------
  // aims at the Bestiary's Monster Statistics by CR: [hp, AC, high attack, average full-attack damage, primary DC, good save, poor save]
  var BY_CR = { 0.125: [4, 10, 0, 2, 9, 2, 0], 0.167: [4, 10, 0, 3, 10, 2, 0], 0.25: [5, 10, 0, 3, 10, 2, 0], 0.333: [6, 11, 1, 4, 10, 3, 0], 0.5: [10, 11, 1, 5, 11, 3, 0],
    1: [15, 12, 2, 7, 12, 4, 1], 2: [20, 14, 4, 10, 13, 5, 1], 3: [30, 15, 6, 13, 14, 6, 2], 4: [40, 17, 8, 16, 15, 7, 3], 5: [55, 18, 10, 20, 15, 8, 4],
    6: [70, 19, 12, 25, 16, 9, 5], 7: [85, 20, 13, 30, 17, 10, 6], 8: [100, 21, 15, 35, 18, 11, 7], 9: [115, 23, 17, 40, 18, 12, 8], 10: [130, 24, 18, 45, 19, 13, 9],
    11: [145, 25, 19, 50, 20, 14, 10], 12: [160, 27, 21, 55, 21, 15, 11], 13: [180, 28, 22, 60, 21, 16, 12], 14: [200, 29, 23, 65, 22, 17, 12], 15: [220, 30, 24, 70, 23, 18, 13],
    16: [240, 31, 26, 80, 24, 19, 14], 17: [270, 32, 27, 90, 24, 20, 15], 18: [300, 33, 28, 100, 25, 20, 16], 19: [330, 34, 29, 110, 26, 21, 16], 20: [370, 36, 30, 120, 27, 22, 17] };
  function crValue(t) { t = String(t).trim(); var m = t.match(/^1\s*\/\s*(\d+)$/); return m ? 1 / +m[1] : parseFloat(t.replace(',', '.')); }
  function crTargets(cr) {
    var r;
    if (cr < 1) r = BY_CR[[0.125, 0.167, 0.25, 0.333, 0.5].reduce(function (b, k) { return Math.abs(k - cr) < Math.abs(b - cr) ? k : b; })];
    else if (cr <= 20) r = BY_CR[Math.round(cr)];
    else { var n = Math.round(cr) - 20, b = BY_CR[20]; r = [b[0] + 40 * n, b[1] + n, b[2] + n, b[3] + 10 * n, b[4] + n, b[5] + n, b[6] + n]; }
    return { hp: r[0], ac: r[1], atk: r[2], dmg: r[3], dc: r[4], good: r[5], poor: r[6] };
  }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function chance(p) { return Math.random() < p; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function diceAvg(d) { var m = String(d).match(/(\d+)d(\d+)/); return m ? +m[1] * (+m[2] + 1) / 2 : 2; }
  // a weapon or natural attack row, filled as typing its name does
  function makeAttack(name, mode) {
    var w = { n: name.toLowerCase(), mode: 'melee', d: '1d4', t: 20, x: 2, opt: 1 }, d = weaponData(name), nat = NATURAL[name.toLowerCase()];
    if (d) { w.n = d.n.toLowerCase(); w.d = d.d; w.t = d.t; w.x = d.x; w.cat = d.c; w.mode = d.c === 'ranged' ? 'ranged' : d.c === 'two-handed' ? 'two' : 'melee'; w.strDmg = d.p !== 'blaster' && (/sling|throw|composite/i.test(d.n) || (d.c === 'ranged' && !/bow|crossbow|gun|pistol|musket|rifle|firearm/i.test(d.n))); }
    else if (name.toLowerCase() === 'unarmed strike') { w.d = nat[0]; w.cat = 'light'; } // a light weapon, with iteratives (and an amulet of mighty fists)
    else if (nat) { w.d = nat[0]; w.cat = 'natural'; w.mode = nat[1] ? 'nat2' : 'nat1'; }
    if (mode) w.mode = mode;
    return w;
  }
  function firstWeapon(names, cats) {
    var ok = names.filter(function (n) { return weaponData(n); });
    if (ok.length) return pick(ok);
    var any = DATA.weapons.filter(function (w) { return cats.indexOf(w.c) >= 0 && /simple|martial/.test(w.p || ''); });
    return any.length ? pick(any).n : 'club';
  }
  function bestArmor(kind) {
    var list = DATA.armors.filter(function (a) { return a.k === kind; });
    if (!list.length) return '';
    var top = Math.max.apply(null, list.map(function (a) { return a.b; }));
    return pick(list.filter(function (a) { return a.b >= top - 1; })).n;
  }
  // a feat the wiki has (and not one merged into another, such as Precise Shot into Point-Blank Shot)
  function featOk(n) { var f = featData(n); return !!f && !f.gone; }
  // random spells for a caster block: a few of each level up to top, the ones with rolls (damage, healing) first
  // a spell's level on a list; the omdura's list is the cleric's (up to 6th) and the inquisitor's, at the lower level
  function listLevel(s, listKey) {
    var L = s.l || {};
    if (listKey !== 'omdura') return L[listKey];
    var c = L.cleric != null && L.cleric <= 6 ? L.cleric : null, q = L.inquisitor != null ? L.inquisitor : null;
    return c == null ? q : q == null ? c : Math.min(c, q);
  }
  function randomSpells(listKey, top, perLevel, uses) {
    var out = [];
    for (var l = 0; l <= top; l++) {
      var pool = Object.keys(SPELLS).map(function (u) { return SPELLS[u]; }).filter(function (s) { return listLevel(s, listKey) === l; });
      var rolls = shuffle(pool.filter(function (s) { return DATA.rolls[s.u]; })), rest = shuffle(pool.filter(function (s) { return !DATA.rolls[s.u]; }));
      var n = l === 0 ? 2 : perLevel, chosen = rolls.slice(0, Math.ceil(n / 2)).concat(rest).slice(0, n);
      if (chosen.length < n) chosen = chosen.concat(rolls.slice(Math.ceil(n / 2), Math.ceil(n / 2) + n - chosen.length));
      chosen.forEach(function (s) { out.push({ n: s.n, u: s.u, lvl: l, uses: uses(l) }); });
    }
    return out;
  }
  var NAME_ADJ = ['Ravenous', 'Ashen', 'Grim', 'Hollow', 'Savage', 'Gloom', 'Thorned', 'Iron', 'Blood', 'Storm', 'Pale', 'Rotting', 'Shadow', 'Ember', 'Frost', 'Venom', 'Rust', 'Bone', 'Dusk', 'Howling'];
  var NAME_NOUN = { 'magical beast': ['Prowler', 'Stalker', 'Mauler', 'Ripper'], animal: ['Boar', 'Wolf', 'Bear', 'Hound', 'Elk'], dragon: ['Drake', 'Wyrm'], plant: ['Creeper', 'Thornvine', 'Bloom'], ooze: ['Slime', 'Ooze', 'Sludge'],
    aberration: ['Horror', 'Lurker', 'Gibberer', 'Maw'], outsider: ['Fiend', 'Reaver', 'Herald', 'Tormentor'], undead: ['Husk', 'Shade', 'Revenant', 'Corpse'],
    construct: ['Sentinel', 'Automaton', 'Guardian'], vermin: ['Crawler', 'Skitterer', 'Swarmling'], 'monstrous humanoid': ['Brute', 'Hunter', 'Raider'], fey: ['Trickster', 'Wisp', 'Thornling'],
    warrior: ['Sellsword', 'Marauder', 'Champion', 'Warlord', 'Enforcer'], skirmisher: ['Cutthroat', 'Scout', 'Duelist', 'Assassin'], caster: ['Cultist', 'Hexer', 'Magus', 'Seer', 'Adept'],
    'starwars-martial': ['Trooper', 'Mercenary', 'Commando', 'Enforcer'], 'starwars-specialist': ['Smuggler', 'Slicer', 'Bounty Hunter', 'Saboteur'], 'starwars-caster': ['Acolyte', 'Inquisitor', 'Adept', 'Dark Disciple'],
    'chakra-martial': ['Ronin', 'Blade', 'Brawler', 'Enforcer'], 'chakra-specialist': ['Infiltrator', 'Tracker', 'Saboteur', 'Assassin'], 'chakra-caster': ['Ninjutsu Adept', 'Genjutsu Weaver', 'Sage', 'Seal Master'],
    'superheroes-martial': ['Bruiser', 'Vigilante', 'Enforcer', 'Brawler'], 'superheroes-specialist': ['Gadgeteer', 'Hacker', 'Infiltrator', 'Sniper'], 'superheroes-caster': ['Elementalist', 'Telepath', 'Mystic', 'Psion'] };
  var SKILL_SETS = { brute: ['Perception', 'Stealth', 'Climb', 'Acrobatics', 'Survival', 'Swim', 'Intimidate'], warrior: ['Perception', 'Intimidate', 'Climb', 'Ride', 'Survival', 'Acrobatics', 'Swim'],
    skirmisher: ['Perception', 'Stealth', 'Acrobatics', 'Bluff', 'Escape Artist', 'Sleight of Hand', 'Disable Device', 'Sense Motive'],
    caster: ['Perception', 'Spellcraft', 'Knowledge (arcana)', 'Knowledge (planes)', 'Bluff', 'Sense Motive', 'Diplomacy', 'Use Magic Device'],
    'sw-warrior': ['Perception', 'Intimidate', 'Acrobatics', 'Climb', 'Survival', 'Knowledge (engineering)', 'Ride', 'Swim'],
    'sw-specialist': ['Perception', 'Disable Device', 'Stealth', 'Bluff', 'Knowledge (planes)', 'Sleight of Hand', 'Acrobatics', 'Knowledge (engineering)', 'Sense Motive'],
    'sw-consular': ['Perception', 'Sense Motive', 'Knowledge (arcana)', 'Diplomacy', 'Intimidate', 'Acrobatics', 'Bluff', 'Heal'] };
  var FEAT_SETS = { brute: ['Improved Initiative', 'Toughness', 'Great Fortitude', 'Iron Will', 'Lightning Reflexes', 'Alertness', 'Combat Reflexes', 'Vital Strike', 'Cleave', 'Blind-Fight'],
    warrior: ['Improved Initiative', 'Toughness', 'Iron Will', 'Dodgility', 'Combat Reflexes', 'Cleave', 'Vital Strike', 'Great Fortitude', 'Lightning Reflexes', 'Blind-Fight'],
    skirmisher: ['Weapon Finesse', 'Improved Initiative', 'Dodgility', 'Mobility', 'Point-Blank Shot', 'Precise Shot', 'Rapid Shot', 'Lightning Reflexes', 'Iron Will', 'Combat Reflexes'],
    caster: ['Improved Initiative', 'Combat Casting', 'Toughness', 'Iron Will', 'Dodgility', 'Lightning Reflexes', 'Great Fortitude', 'Alertness'] };

  // the feat chains a random enemy can be built around, as fit its concept, Hit Dice and BAB: [{ label, setup(), feats() }]
  var CC_TEXT = /paraly|stun|dominat|confus|ability (damage|drain)|(strength|dexterity|constitution|wisdom|intelligence|charisma) (damage|drain)|1d\d+ points? of (str|dex|con|wis|int|cha)|petrif|hold (person|monster)|nause|feeblemind|insan|blind|cower|panick|frightened|sleep|slowed/i;
  var AREA_TEXT = /radius|cone|line|spread|burst|emanation|cylinder/i;
  function randomBuilds(concept, D0, sk) {
    var hd = D0.totalHD, bab = D0.bab, out = [];
    var melee = S.weapons.filter(function (w) { return /^(melee|two|off)$/.test(w.mode); }), ranged = S.weapons.filter(function (w) { return /^(ranged|thrown)$/.test(w.mode); });
    var nats = S.weapons.filter(function (w) { return /^nat/.test(w.mode); });
    var lvl = function (slug) { var c = (S.classes || [])[0]; return c && c.s === slug ? c.lvl : 0; };
    var ranks = function (skill, n) { // moves ranks from the last skills into this one
      var st = S.skills[skill] = S.skills[skill] || {}, need = Math.min(hd, n) - (st.r || 0);
      for (var i = sk.length - 1; i >= 0 && need > 0; i--) { var o = S.skills[sk[i]]; if (sk[i] === skill || !o || !o.r) continue; var t = Math.min(o.r, need); o.r -= t; need -= t; st.r = (st.r || 0) + t; }
      if ((st.r || 0) < Math.min(hd, n)) S.bonusRanks = (S.bonusRanks || 0) + Math.min(hd, n) - (st.r || 0), st.r = Math.min(hd, n);
    };
    var groupOf = function (w) { return 'Weapon Focus (' + (weaponGroups(w)[0] || w.n) + ')'; };
    // two weapons: Two-Weapon Fighting, Double Slice and what follows
    var cls0 = ((S.classes || [])[0] || {}).s || '', moms = ((S.classes || [])[0] || {}).moms;
    // fighting styles of weapons, not of fists, kinetic blasts, bombs or claws
    var armed = !/gunslinger|shifter|alchemist|kineticist|kinetic-shinobi|deadeye-hexer|omdura|medium|monk|brawler/.test(cls0);
    // the base attack bonus for combat feats' prerequisites: Weapon Focus's +1 (the wiki's: +1 BAB with its group, which
    // counts for offensive feats) and a legendary fighter's Feat Aptitude (+1/3 its level from 3rd, so Vital Strike at 4th)
    var lfL = lvl('legendary-fighter'), eff = bab + 1 + (lfL >= 3 ? Math.min(5, Math.floor(lfL / 3)) : 0);
    var swapMain = function (names, cats) {
      var w = makeAttack(firstWeapon(names, cats));
      S.weapons = [w].concat(S.weapons.filter(function (x) { return /^(ranged|thrown)$/.test(x.mode); }).map(function (x) { x.opt = 2; return x; }));
      if (w.mode === 'two') S.shield = '';
      return w;
    };
    var mainMelee = function () { return S.weapons.filter(function (w) { return /^(melee|two)$/.test(w.mode); })[0] || S.weapons[0]; };
    if ((concept === 'warrior' || concept === 'skirmisher' || concept === 'sw-warrior') && melee.length && bab >= 1 && armed)
      out.push({ label: 'two-weapon fighter', setup: function () {
        var saber = SWM && S.weapons.some(function (w) { return /lightsaber/i.test(w.n); });
        var main = saber ? makeAttack(pick(SWD.weapons.filter(function (w) { return !w.blaster && w.c !== 'two-handed'; })).n)
          : makeAttack(firstWeapon(MODE === 'chakra' ? ['Katana', 'Wakizashi', 'Ninja-to'] : concept === 'skirmisher' ? ['Rapier', 'Short sword', 'Kukri'] : ['Longsword', 'Battleaxe', 'Scimitar', 'Flail'], ['one-handed', 'light']));
        var off = saber ? makeAttack('Shoto lightsaber', 'off') : makeAttack(firstWeapon(MODE === 'chakra' ? ['Kunai', 'Wakizashi', 'Kama'] : ['Short sword', 'Kukri', 'Handaxe', 'Dagger'], ['light']), 'off');
        if (concept === 'skirmisher') { main.finesse = off.finesse = true; }
        S.weapons = [main, off].concat(S.weapons.filter(function (w) { return /^(ranged|thrown)$/.test(w.mode); }).map(function (w) { w.opt = 2; return w; }));
        S.shield = ''; S.abil.Dex = Math.max(S.abil.Dex, bab >= 6 ? 15 : 14);
      }, feats: function () {
        var main = S.weapons.filter(function (w) { return w.mode === 'melee'; })[0] || S.weapons[0];
        return ['Two-Weapon Fighting', 'Double Slice', bab >= 6 ? 'Improved Two-Weapon Fighting' : '', groupOf(main), bab >= 6 ? 'Two-Weapon Defense' : '',
          bab >= 11 ? 'Two-Weapon Rend' : ''];
      } });
    // fear: Power Attack (free on this wiki) into Intimidate
    if ((concept === 'warrior' || concept === 'brute' || concept === 'sw-warrior') && hd >= 6 && S.abil.Str >= 13 && S.abil.Int >= 3 && !/^(animal|vermin|ooze|plant|construct)$/.test(S.type))
      out.push({ label: 'terror', setup: function () { ranks('Intimidate', hd); }, feats: function () {
        var w = melee[0] || nats[0];
        return ['Cornugon Smash', 'Hurtful', w ? groupOf(w) : '', 'Dazzling Display', bab >= 6 ? 'Shatter Defenses' : '', 'Intimidating Prowess', bab >= 11 ? 'Deadly Stroke' : ''];
      } });
    // a fighter's weapon
    if (lvl('fighter') >= 4 && (melee[0] || ranged[0]))
      out.push({ label: 'weapon master', feats: function () {
        var w = (S.weapons.some(function (x) { return /^(melee|two)$/.test(x.mode); }) ? mainMelee() : null) || ranged[0], f = lvl('fighter');
        return [groupOf(w), 'Weapon Specialization (' + w.n + ')', f >= 8 ? 'Greater Weapon Focus (' + w.n + ')' : '', bab >= 8 ? 'Improved Critical (' + w.n + ')' : '', f >= 12 ? 'Greater Weapon Specialization (' + w.n + ')' : ''];
      } });
    // bows, crossbows and blasters
    if (ranged.length && (concept === 'skirmisher' || concept === 'warrior' || concept === 'sw-specialist' || concept === 'sw-warrior') && !/shifter|alchemist|kineticist/.test(((S.classes || [])[0] || {}).s || ''))
      out.push({ label: 'archer', setup: function () { S.abil.Dex = Math.max(S.abil.Dex, 15); }, feats: function () {
        var r = S.weapons.filter(function (w) { return /^(ranged|thrown)$/.test(w.mode); })[0];
        return ['Point-Blank Shot', groupOf(r), 'Rapid Shot', bab >= 6 ? 'Manyshot' : '', bab >= 11 ? 'Improved Precise Shot' : '', bab >= 8 ? 'Improved Critical (' + r.n + ')' : ''];
      } });
    // big natural attacks
    if (nats.length && (concept === 'brute' || ((S.classes || [])[0] || {}).s === 'shifter'))
      out.push({ label: 'natural predator', feats: function () {
        var count = nats.reduce(function (t, w) { return t + (w.count || 1); }, 0);
        return ['Weapon Focus (natural)', bab >= 4 ? 'Improved Natural Attack (' + nats[0].n + ')' : '', count >= 3 ? 'Multiattack' : '', S.abil.Con >= 13 ? 'Improved Natural Armor' : '',
          bab >= 6 ? 'Vital Strike' : '', 'Furious Focus', bab >= 11 ? 'Improved Vital Strike' : '', S.specialAttacks ? 'Ability Focus (breath weapon)' : ''];
      } });
    var warriorish = concept === 'warrior' || concept === 'brute';
    // one huge blow: a big two-handed weapon, Vital Strike and Devastating Strike (a legendary fighter has it from 4th);
    // the stat block gets a Vital Strike attack
    if (warriorish && armed && melee.length && eff >= 6)
      out.push({ label: 'vital striker', prio: lfL >= 4 && chance(0.6), setup: function () {
        var m = mainMelee();
        if (m.mode !== 'two' && chance(0.75)) swapMain(['Earth breaker', 'Greatsword', 'Greataxe', 'Bardiche'], ['two-handed']);
      }, feats: function () {
        return [groupOf(mainMelee()), 'Vital Strike', mainMelee().mode === 'two' ? 'Furious Focus' : '', eff >= 9 ? 'Devastating Strike' : '', eff >= 11 ? 'Improved Vital Strike' : '',
          eff >= 13 ? 'Improved Devastating Strike' : '', eff >= 16 ? 'Greater Vital Strike' : ''];
      } });
    // a reach weapon that holds the line: Combat Reflexes, Stand Still, Lunge and Step Up
    if (warriorish && armed && melee.length && eff >= 6)
      out.push({ label: 'lockdown', setup: function () {
        var w = swapMain(['Glaive', 'Longspear', 'Ranseur', 'Hammer, lucerne', 'Bec de corbin'], ['two-handed']);
        w.rider = [w.rider, 'reach 10 ft.'].filter(Boolean).join(', ');
        S.abil.Dex = Math.max(S.abil.Dex, 13);
      }, feats: function () {
        var f = lvl('fighter') + lfL;
        return [groupOf(mainMelee()), 'Combat Reflexes', 'Stand Still', 'Lunge', 'Step Up', 'Following Step', f >= 6 ? 'Disruptive' : '', f >= 10 ? 'Spellbreaker' : ''];
      } });
    // a tripper: a guisarme or a whip, Improved and Greater Trip, and attacks of opportunity on the fallen
    if (warriorish && armed && melee.length && bab >= 1)
      out.push({ label: 'tripper', setup: function () {
        var w = swapMain(['Guisarme', 'Guisarme', 'Flail, heavy'], ['two-handed', 'one-handed']);
        w.rider = [w.rider, /guisarme/.test(w.n) ? 'reach 10 ft., trip' : 'trip'].filter(Boolean).join(', ');
      }, feats: function () {
        return [groupOf(mainMelee()), 'Improved Trip', 'Combat Reflexes', eff >= 6 ? 'Deft Maneuvers' : '', eff >= 6 ? 'Greater Trip' : '', eff >= 6 ? 'Felling Smash' : '', eff >= 6 ? 'Lunge' : ''];
      } });
    // sword and board: a spiked shield as the off-hand weapon, Improved Shield Bash, Shield Slam and Shield Master
    if (concept === 'warrior' && armed && melee.length && bab >= 1 && armorData('Shield, heavy steel'))
      out.push({ label: 'shield bash', setup: function () {
        var m = swapMain(['Longsword', 'Battleaxe', 'Flail', 'Warhammer', 'Heavy mace'], ['one-handed']);
        var off = makeAttack(firstWeapon(['Spiked shield, heavy', 'Shield, heavy'], ['one-handed']), 'off');
        off.innate = true; // the shield it carries (in Gear once, as its shield)
        S.weapons.splice(1, 0, off);
        S.shield = 'Shield, heavy steel'; S.abil.Dex = Math.max(S.abil.Dex, bab >= 6 ? 15 : 14);
        if (m.mode !== 'melee') m.mode = 'melee';
      }, feats: function () {
        return ['Two-Weapon Fighting', 'Improved Shield Bash', groupOf(mainMelee()), 'Double Slice', eff >= 6 ? 'Shield Slam' : '', bab >= 6 ? 'Improved Two-Weapon Fighting' : '',
          eff >= 11 ? 'Shield Master' : '', eff >= 11 ? 'Bashing Finish' : ''];
      } });
    // the dragon's fist: Dragon Style (1-1/2 Str on the first blow), Dragon Ferocity and Dragon Roar; a master of many
    // styles adds Ascetic Style so a strong monk weapon (a nine-ring broadsword, a tri-point sword) counts as a fist, and
    // fuses two more styles
    if (/^(monk|unchained-monk|brawler)$/.test(cls0))
      out.push({ label: 'dragon fist', prio: !!moms || chance(0.6), setup: function () {
        S.abil.Str = Math.max(S.abil.Str, 15); ranks('Acrobatics', hd);
        if (moms || (hd >= 5 && chance(0.4))) {
          var w = makeAttack(firstWeapon(['Broadsword, nine ring', 'Sword, tri-point double-edged', 'Sansetsukon'].concat(cls0 === 'brawler' ? [] : ['Sword, temple']), ['one-handed', 'two-handed']));
          w.ascetic = true;
          // a core monk is not proficient with them (an unchained monk is, with any monk weapon; a brawler with martial ones)
          // the table lets it learn that proficiency with experience, without spending a feat
          if (cls0 === 'monk') S.sq = [S.sq, 'proficient with the ' + w.n + ' (learned with experience)'].filter(Boolean).join(', ');
          if (/tri-point/.test(w.n)) w.rider = 'reach 10 ft.';
          S.weapons = [w].concat(S.weapons.filter(function (x) { return x.n === 'unarmed strike' || /^(ranged|thrown)$/.test(x.mode); }).map(function (x) { x.opt = 2; return x; }));
        }
      }, feats: function () {
        var w = S.weapons[0], asc = !!w.ascetic, other = pick(['Tiger Style', 'Snake Style', 'Crane Style', 'Panther Style', 'Pummeling Style']);
        return [asc ?'Weapon Focus (monk)' : groupOf(w), 'Dragon Style', asc ? 'Ascetic Style' : '', moms ? other : '', cls0 === 'brawler' ? 'Stunning Fist' : '',
          hd >= 5 ? 'Dragon Ferocity' : '', asc && hd >= 5 ? 'Ascetic Form' : '', asc && hd >= 7 ? 'Ascetic Strike' : '', hd >= 8 ? 'Dragon Roar' : '',
          moms && hd >= 6 ? pick(['Tiger Claws', 'Snake Sidewind', 'Crane Wing', 'Pummeling Charge']) : '', bab >= 8 ? 'Elemental Fist' : ''];
      } });
    // casters: the biggest area spell with Spell Focus and Spell Specialization, or a crippling spell with Greater Spell Focus
    var cast = S.casters[0];
    if (cast && cast.kind !== 'Force Powers') {
      var top = Math.max.apply(null, cast.spells.map(function (s) { return s.lvl; }).concat([1]));
      var known = function (test) {
        var pool = Object.keys(SPELLS).map(function (u) { return SPELLS[u]; }).filter(function (s) { var l = s.l && s.l[cast.cls]; return l != null && l > 0 && l <= top && test(s); });
        if (!pool.length) return null;
        var best = Math.max.apply(null, pool.map(function (s) { return s.l[cast.cls]; }));
        return pick(pool.filter(function (s) { return s.l[cast.cls] >= best - 1; }));
      };
      var addSpell = function (s) {
        if (!cast.spells.some(function (x) { return x.u === s.u; })) cast.spells.push({ n: s.n, u: s.u, lvl: s.l[cast.cls], uses: cast.kind === 'Spell-Like Abilities' ? (s.l[cast.cls] >= top ? '1/day' : '3/day') : cast.kind === 'Spells Prepared' ? 2 : '' });
      };
      var blast = known(function (s) { var r = (DATA.rolls[s.u] || [])[0]; return r && r.damage && AREA_TEXT.test(s.t || '') && !/harmless/i.test(s.sv || ''); });
      if (blast) out.push({ label: 'blaster', setup: function () { addSpell(blast); }, feats: function () {
        return ['Spell Focus (' + blast.s + ')', 'Spell Specialization (' + blast.n.toLowerCase() + ')', hd >= 7 ? 'Greater Spell Focus (' + blast.s + ')' : '', 'Spell Penetration', hd >= 9 ? 'Empower Spell' : ''];
      } });
      var cc = known(function (s) { return CC_TEXT.test(s.x || '') && s.sv && !/none|harmless/i.test(s.sv); });
      if (cc) out.push({ label: 'controller', setup: function () { addSpell(cc); }, feats: function () {
        return ['Spell Focus (' + cc.s + ')', 'Greater Spell Focus (' + cc.s + ')', 'Spell Penetration', hd >= 7 ? 'Greater Spell Penetration' : '', 'Spell Specialization (' + cc.n.toLowerCase() + ')'];
      } });
    }
    return out;
  }
  // the builds that choose the enemy's weapons
  var SWAPS = /^(two-weapon fighter|vital striker|lockdown|tripper|shield bash|dragon fist)$/;
  // an enemy with Vital Strike gets its own attack for it: its main weapon (or first natural attack), one blow, the dice
  // rolled 3 times (4 with Improved, 5 with Greater) and Devastating Strike's +2 per extra roll (+6 at most)
  function vitalRow() {
    var lower = (S.feats || []).map(function (f) { return f.toLowerCase(); });
    var mult = lower.indexOf('greater vital strike') >= 0 ? 5 : lower.indexOf('improved vital strike') >= 0 ? 4 : lower.indexOf('vital strike') >= 0 ? 3 : 0;
    if (!mult) return;
    var w = S.weapons.filter(function (x) { return /^(melee|two)$/.test(x.mode) && !x.single && !x.fixed && !x.vital; })[0] || S.weapons.filter(function (x) { return x.mode === 'nat1'; })[0];
    if (!w) return;
    var v = clone(w), opts = S.weapons.map(function (x) { return x.opt || 1; });
    v.vital = mult; v.count = 1; v.mode = w.mode === 'nat1' ? 'melee' : w.mode; v.innate = true;
    if (/^nat/.test(w.mode)) { v.mode = 'melee'; v.cat = 'natural'; }
    v.opt = Math.max.apply(null, opts) + 1;
    if (lower.indexOf('devastating strike') >= 0) v.dmgMisc = (v.dmgMisc || 0) + Math.min(6, 2 * (mult - 1));
    S.weapons.push(v);
  }
  var RAND_FORCE = null, RAND_LAST = null;
  // the classes a random humanoid can have, by concept: the rogue and the monk are their unchained versions (better in
  // almost every way); the barbarian stays the core one, with the unchained stances among its rage powers
  var RANDOM_CLS = { warrior: ['fighter', 'barbarian', 'ranger', 'slayer', 'cavalier', 'bloodrager', 'antipaladin', 'warpriest', 'brawler', 'unchained-monk',
      'paladin', 'samurai', 'legendary-fighter', 'shifter', 'monk', 'omdura', 'medium'],
    skirmisher: ['unchained-rogue', 'ranger', 'slayer', 'investigator', 'swashbuckler', 'ninja', 'unchained-monk', 'vigilante', 'gunslinger',
      'legendary-swashbuckler', 'legendary-investigator', 'legendary-gunslinger', 'deadeye-hexer', 'kinetic-shinobi'],
    caster: ['wizard', 'sorcerer', 'cleric', 'druid', 'witch', 'oracle', 'bard', 'magus', 'inquisitor', 'arcanist', 'shaman', 'psychic', 'skald',
      'mesmerist', 'occultist', 'spiritualist', 'hunter', 'legendary-magus', 'legendary-cleric', 'kineticist', 'alchemist'] };
  // the concept of a class picked in the form: its list above, else a caster if it has a spell list, else a warrior
  function classConcept(slug) {
    for (var k in RANDOM_CLS) if (RANDOM_CLS[k].indexOf(slug) >= 0) return k;
    var base = slug.replace(/^(legendary|unchained)-/, '');
    if (CLASSES.indexOf(base) >= 0) return 'caster';
    return /rogue|ninja|swashbuckler|investigator|gunslinger|vigilante/.test(base) ? 'skirmisher' : 'warrior';
  }
  // ---- subsystem enemies: class features and powers
  // class features a fighting enemy would not take: shapechanging, companions, exploration and crafting
  var PICK_BAN = /shape|shifter|shifting|transform|alternate form|polymorph|companion|familiar|eidolon|phantom|wild empathy|woodland stride|trackless|favored terrain|camouflage|hide in plain sight|\btrack\b|trapfinding|trap ?sense|nature sense|craft|scribe|brew|linguist|language|bardic knowledge|\blore\b|cartograph|treasure|appraise|\bmount\b|steed|summon/i;
  // and, in these settings, features tied to fantasy gods, planes, nature, the dead or mounts
  var FLAVOR_BAN = /plant|tree|leaf|flower|planar|plane|outsider|demon|devil|fiend|abyss|infernal|celestial|angel|azata|elysian|divine|deity|god|faith|holy|unholy|domain|channel|smite|swarm|spirit|shaman|totem|druid|nature|wild|season|moon|sun|horse|groom|cavalry|drunk|ale|undead|grave|necro|witch|hag|patron|poppet|rune|serpent|saurian|aquatic|water adaptation|ancestor|lycan|fey|dragon|beast|animal|bestial|vermin|ooze|aura of|bravo|crusader|inquisition|judgment|mystery|oracle|curse|prayer|sacred|blessing|relic|aspect|eidolon|phantom|vampir/i;
  // words in a feature's text that say it suits a role
  var ROLE_FIT = { martial: /attack|damage|weapon|armor|\bAC\b|critical|charge|strike|rage|combat|maneuver|fighting|smite|bonus feat/gi,
    specialist: /sneak|attack|damage|precision|evasion|dodge|critical|ranged|weapon|skill/gi,
    caster: /spell|power|\bDC\b|caster level|concentration|saving throw|stamina|chakra|channel|energy|bloodline|mystery|hex/gi };
  // the subsystem's own powers only some species have (an Ithorian's bellow)
  var UNIQUE_POWER = /bellow/i;
  // the spell lists a power can come from, at its lowest level among them
  var POWER_LISTS = ['sorcerer', 'wizard', 'cleric', 'psychic', 'druid', 'oracle', 'witch', 'bard', 'magus', 'inquisitor', 'occultist', 'mesmerist'];
  var POWER_EXCL = /undead|animal|plant|summon|planar|holy|unholy|divine|demon|devil|angel|celestial|elemental|druid|nature|wood|tree|blood|bone|grave|corpse|zombie|skeleton|spirit|ghost|soul|deity|\bgod|bless|prayer|consecrat|sanctif|sanctuary|weather|vermin|insect|swarm|beast|ooze|giant|dragon|fey|faerie|goblin|pumpkin|shillelagh|totem|ancestral|haunt|ritual|cauldron|hex|familiar|eidolon|kami|\boni\b|wish|clone|resurrect|raise dead|reincarnat|mount|steed|treasure|tears|mythic|curse|heretic|repent|righteous|sacred|divin|crusad|zealot|faith|penance|atonement|good hope|oath/i;
  var ELEMENT_WORDS = /fire|flame|burn|water|ice|snow|frost|stone|earth|mud|lava|wind|storm/i;
  // setting names for regular spells (by spell page)
  var FORCE_ALIAS = { 'lightning-bolt': 'Force Lightning', 'shocking-grasp': 'Force Shock', 'chain-lightning': 'Force Storm', 'hold-person': 'Force Grip', 'hold-monster': 'Force Grip, Greater',
    'suggestion': 'Mind Trick', 'charm-person': 'Mind Trick, Lesser', 'dominate-person': 'Force Domination', 'confusion': 'Force Confusion', 'fear': 'Force Fear', 'cause-fear': 'Force Fear, Lesser',
    'scare': 'Force Terror', 'slow': 'Force Slow', 'haste': 'Force Speed, Greater', 'sleep': 'Force Sleep', 'daze': 'Force Daze', 'daze-monster': 'Force Daze, Greater', 'mage-hand': 'Telekinesis, Lesser',
    'magic-missile': 'Force Bolt', 'mage-armor': 'Force Armor', 'shield': 'Force Barrier', 'see-invisibility': 'Force Sight', 'true-seeing': 'Force Sight, Greater', 'invisibility': 'Force Cloak',
    'blur': 'Force Blur', 'displacement': 'Force Mirage', 'cure-light-wounds': 'Force Heal', 'cure-moderate-wounds': 'Force Heal', 'cure-serious-wounds': 'Force Heal', 'cure-critical-wounds': 'Force Heal, Greater',
    'heal': 'Force Healing Trance', 'inflict-light-wounds': 'Force Drain', 'inflict-moderate-wounds': 'Force Drain', 'vampiric-touch': 'Drain Life', 'enervation': 'Force Drain, Greater', 'harm': 'Force Wound',
    'blindness-deafness': 'Force Blind', 'repulsion': 'Force Repulse', 'expeditious-retreat': 'Force Speed', 'bulls-strength': 'Force Strength', 'cats-grace': 'Force Agility', 'true-strike': 'Force Insight',
    'foresight': 'Battle Meditation', 'detect-thoughts': 'Force Mind Probe', 'telekinesis': 'Telekinesis', 'dispel-magic': 'Force Disruption', 'ray-of-enfeeblement': 'Force Weaken', 'feeblemind': 'Force Mind Shatter',
    'power-word-stun': 'Force Stun', 'power-word-kill': 'Force Death', 'circle-of-death': 'Force Death Field', 'spiritual-weapon': 'Saber Dance', 'heroism': 'Force Valor', 'crushing-despair': 'Force Despair',
    'calm-emotions': 'Force Calm', 'command': 'Force Command', 'hideous-laughter': 'Force Distraction', 'bears-endurance': 'Force Endurance', 'deep-slumber': 'Force Sleep, Greater', 'force-punch': 'Force Punch',
    'hydraulic-push': 'Force Push', 'telekinetic-charge': 'Force Charge', 'mass-hold-person': 'Force Grip, Mass', 'mind-thrust-i': 'Force Mind Blast', 'ego-whip-i': 'Force Mind Lash' };
  var TECH_ALIAS = { 'fireball': 'Thermal Detonator', 'lightning-bolt': 'Ion Blast', 'scorching-ray': 'Blaster Volley', 'burning-hands': 'Flamethrower', 'grease': 'Oil Slick', 'web': 'Net Launcher',
    'invisibility': 'Stealth Field', 'shield': 'Personal Shield', 'mirror-image': 'Holo Decoys', 'magic-missile': 'Seeker Darts', 'acid-arrow': 'Acid Dart', 'glitterdust': 'Flash Grenade',
    'stinking-cloud': 'Gas Grenade', 'sleep': 'Sleep Gas', 'haste': 'Stim Boost', 'cure-light-wounds': 'Medpac', 'cure-moderate-wounds': 'Medpac, Advanced', 'see-invisibility': 'Thermal Scanner',
    'fly': 'Jetpack', 'shocking-grasp': 'Shock Glove', 'sound-burst': 'Sonic Grenade', 'fog-cloud': 'Smoke Grenade', 'obscuring-mist': 'Smoke Screen', 'silent-image': 'Hologram', 'jump': 'Jump Boots',
    'expeditious-retreat': 'Speed Boots', 'cone-of-cold': 'Cryo Blast', 'flaming-sphere': 'Incendiary Drone', 'resist-energy': 'Environmental Shield', 'stoneskin': 'Armor Plating', 'acid-splash': 'Acid Spray',
    'ray-of-frost': 'Cryo Shot', 'snowball': 'Cryo Grenade', 'cloudkill': 'Toxin Cloud', 'solid-fog': 'Foam Dispenser', 'sleet-storm': 'Cryo Storm', 'shout': 'Sonic Blaster', 'disintegrate': 'Disruptor',
    'chain-lightning': 'Arc Caster', 'detect-magic': 'Scanner', 'spider-climb': 'Climbing Claws', 'knock': 'Lock Breaker', 'magic-weapon': 'Weapon Mod', 'keen-edge': 'Vibroblade Edge', 'hold-person': 'Stun Ray',
    'slow': 'Stasis Field', 'dispel-magic': 'EMP Burst', 'enlarge-person': 'Power Armor', 'displacement': 'Holo Shroud', 'true-strike': 'Targeting Computer', 'protection-from-energy': 'Energy Shield' };
  // the spells that are an element's own (by descriptor), and the damage an element's jutsu deal when a spell of another
  // energy is turned into one of its (the subsystem lets a jutsu take any spell and change its element)
  var ELEMENT_DESC = { Fire: /fire/, Water: /water|cold/, Earth: /earth|acid/, Wind: /air|sonic/, Lightning: /electricity/, Ice: /cold|water/, Lava: /fire|earth/,
    Wood: /plant|wood|earth/, Storm: /electricity|water|air/, Explosion: /fire|sonic/, Steam: /fire|water/, Crystal: /earth/, Mud: /earth|water|acid/, Scorch: /fire|air/,
    Magnetism: /earth|electricity|force/ };
  var ELEMENT_ENERGY = { Fire: 'fire', Water: 'cold', Earth: 'acid', Wind: 'sonic', Lightning: 'electricity', Ice: 'cold', Lava: 'fire', Wood: 'piercing', Storm: 'electricity',
    Explosion: 'fire', Steam: 'fire', Crystal: 'piercing', Mud: 'acid', Scorch: 'fire', Magnetism: 'bludgeoning' };
  var HERO_ENERGY = { fire: 'fire', cold: 'cold', lightning: 'electricity', sonic: 'sonic', acid: 'acid' };
  var ENERGY_RE = /fire|cold|acid|electricity|sonic/;
  // a damage spell of an energy (one a jutsu or power can take and turn into its own energy)
  function energyDamage(s) { var r = (DATA.rolls[s.u] || [])[9] || (DATA.rolls[s.u] || [])[4]; return !!(r && r.damage && ENERGY_RE.test((s.d || []).join(' ') + ' ' + (r.damageLabel || ''))); }
  var HERO_THEMES = { fire: /fire/, cold: /cold/, lightning: /electricity/, sonic: /sonic/, acid: /acid/, mind: /mind-affecting/, force: /force/ };
  function titleCase(t) { return String(t).replace(/(^|[\s(-])([a-z])/g, function (_, a, b) { return a + b.toUpperCase(); }); }
  // what kind of powers a subsystem enemy has: Force (light or dark side) or tech in Star Wars, its element's jutsu
  // and genjutsu in Naruto, one power theme in Heroes; none for a Star Wars warrior without the Force
  function powerFlavor(role) {
    if (MODE === 'starwars') return S.sw.force ? { kind: 'force', dark: (S.sw.karma || 0) < 0 } : role === 'specialist' ? { kind: 'tech', title: 'Tech' } : null;
    if (MODE === 'chakra') return { kind: 'jutsu', element: S.sw.element || '', elements: S.sw.elements || (S.sw.element ? [S.sw.element] : []), chosen: !!S.sw.elementChosen };
    if (MODE === 'superheroes') { var th = pick(Object.keys(HERO_THEMES)); return { kind: 'hero', theme: th }; }
    return null;
  }
  function spellLevelAny(s) {
    var best = null;
    POWER_LISTS.forEach(function (k) { if (s.l && s.l[k] != null && (best == null || s.l[k] < best)) best = s.l[k]; });
    return best;
  }
  // does a spell fit the flavor? and what is it called there
  function powerFits(s, f) {
    var desc = (s.d || []).join(' ').toLowerCase(), sch = s.s || '', n = s.n, u = s.u, self = /^(personal|you)$/i.test(String(s.t || '').trim()) || /^personal/i.test(s.r || '');
    if (POWER_EXCL.test(n)) return false;
    if (f.kind === 'force') {
      if (FORCE_ALIAS[u]) return !(f.dark ? /^(cure|heal|heroism|calm)/.test(u) : /^(inflict|harm|enervation|vampiric|circle-of-death|power-word-kill|crushing)/.test(u) || /lightning|shock|chain-lightning/.test(u));
      // a damage spell of another energy becomes a Force one: a push (bludgeoning) or, for the dark side, lightning
      if (energyDamage(s) && !/good|evil|lawful|chaotic/.test(desc) && !(f.dark && /electricity/.test(desc))) return 'convert';
      if (ELEMENT_WORDS.test(n) || /fire|cold|acid|water|earth|air|sonic|good|evil|lawful|chaotic|light\b/.test(desc)) return false;
      if (/enchantment|divination/.test(sch)) return true;
      if (/abjuration/.test(sch)) return !/magic circle|planar|dismissal|banish/i.test(n);
      if (/transmutation/.test(sch)) return self && !/form|shape|polymorph|transform|alter self|enlarge|reduce|giant|beast/i.test(n);
      if (/evocation/.test(sch)) return /force/.test(desc) || (f.dark && /electricity/.test(desc));
      if (/necromancy/.test(sch)) return f.dark && !/animate|undead|create/i.test(n);
      return false;
    }
    if (f.kind === 'tech') {
      if (TECH_ALIAS[u]) return true;
      if (/good|evil|lawful|chaotic|mind-affecting|death|curse/.test(desc)) return false;
      if (/evocation/.test(sch)) return /fire|electricity|sonic|acid|cold|force/.test(desc);
      if (/illusion/.test(sch)) return /figment|glamer/.test(String(s.sub || '')) || /image|invisib|blur|silence/i.test(n);
      if (/divination/.test(sch)) return /detect|see|locate|scry|true/i.test(n);
      if (/abjuration/.test(sch)) return /shield|resist|protection from energy|dispel/i.test(n);
      return false;
    }
    if (f.kind === 'jutsu') {
      for (var ei = 0; ei < f.elements.length; ei++) if (ELEMENT_DESC[f.elements[ei]] && ELEMENT_DESC[f.elements[ei]].test(desc)) return 'element:' + f.elements[ei];
      // a damage spell of another energy becomes the element's
      if (f.element && energyDamage(s) && !/good|evil|lawful|chaotic/.test(desc)) return 'convert:' + f.element;
      if (/fire|cold|acid|water|earth|air|sonic|electricity|good|evil|lawful|chaotic/.test(desc) || ELEMENT_WORDS.test(n)) return false;
      if ((/illusion/.test(sch) || (/enchantment/.test(sch) && /mind-affecting/.test(desc))) && !self && s.sv && !/none|harmless/i.test(s.sv)) return 'genjutsu';
      if (/transmutation|abjuration/.test(sch) && self && !/form|shape|polymorph|alter self|giant|beast/i.test(n)) return 'ninjutsu';
      if (/evocation/.test(sch) && /force/.test(desc)) return 'ninjutsu';
      return false;
    }
    if (f.kind === 'hero') {
      if (HERO_THEMES[f.theme].test(desc)) return true;
      if (HERO_ENERGY[f.theme] && energyDamage(s) && !/good|evil|lawful|chaotic/.test(desc)) return 'convert';
      return self && /transmutation|abjuration/.test(sch) && !/form|shape|polymorph|alter self|beast/i.test(n) && !/good|evil|lawful|chaotic/.test(desc);
    }
    return false;
  }
  function powerName(s, f, fit) {
    if (f.kind === 'force') return FORCE_ALIAS[s.u] || (fit === 'convert' ? 'Force ' + titleCase(s.n) : '');
    if (f.kind === 'tech') return TECH_ALIAS[s.u] || '';
    if (f.kind === 'jutsu') return (/^(element|convert):/.test(fit) ? fit.split(':')[1] + ' Style' : fit === 'genjutsu' ? 'Genjutsu' : 'Ninjutsu') + ': ' + titleCase(s.n);
    return '';
  }
  // n powers of spell level L for the flavor: the ones with a setting name and the ones that roll damage are likelier
  function subPowers(f, L, n, have) {
    if (n <= 0) return [];
    var pool = Object.keys(SPELLS).map(function (u) { return SPELLS[u]; }).map(function (s) {
      var lv = spellLevelAny(s), fit = lv === L && have.indexOf(s.u) < 0 && powerFits(s, f);
      return fit ? { s: s, fit: fit, score: Math.random() + ((f.kind === 'force' ? FORCE_ALIAS : f.kind === 'tech' ? TECH_ALIAS : {})[s.u] ? 1.2 : 0) + (DATA.rolls[s.u] ? 1 : 0) + (/^element/.test(fit) || (fit === true && f.kind === 'hero' && HERO_ENERGY[f.theme]) ? 0.8 : /^convert/.test(fit) ? 0.5 : 0)
        // its main element (the one asked for, when there is one) comes first
        + (f.element && /^(element|convert):/.test(fit) && fit.split(':')[1] === f.element ? (f.chosen ? 1.2 : 0.4) : 0)
        // a fight wants damage or a save; utility (stone shape, whispering wind) is unlikely
        + (s.sv && !/none|harmless/i.test(s.sv) ? 0.5 : 0) - (!DATA.rolls[s.u] && (!s.sv || /none|harmless/i.test(s.sv)) ? 0.8 : 0) } : null;
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
    var seen = {}, out = [], elem = 0;
    pool.forEach(function (p) {
      var as = powerName(p.s, f, p.fit);
      if (out.length >= n || (as && seen[as])) return;
      // a shinobi keeps a place for a genjutsu or ninjutsu at each level
      var elemental = /^(element|convert)/.test(p.fit);
      if (f.kind === 'jutsu' && elemental && n > 1 && elem >= Math.ceil(n * 2 / 3)) return;
      if (elemental) elem++;
      if (as) seen[as] = 1;
      // the energy it deals now, when it was a spell of another one
      var conv = /^convert/.test(p.fit) ? (f.kind === 'jutsu' ? ELEMENT_ENERGY[p.fit.split(':')[1]] : f.kind === 'force' ? (f.dark && chance(0.6) ? 'electricity' : 'bludgeoning') : HERO_ENERGY[f.theme]) : '';
      out.push({ n: p.s.n, u: p.s.u, lvl: L, uses: '', as: as || undefined, conv: conv || undefined });
    });
    return out;
  }
  // the creature types each concept of a random enemy can be (a type twice is likelier)
  var CONCEPT_TYPES = { brute: ['magical beast', 'animal', 'aberration', 'dragon', 'outsider', 'undead', 'construct', 'vermin', 'monstrous humanoid', 'plant', 'ooze'],
    warrior: ['humanoid', 'humanoid', 'monstrous humanoid', 'fey', 'outsider'], skirmisher: ['humanoid', 'humanoid', 'monstrous humanoid', 'fey'],
    caster: ['outsider', 'fey', 'aberration', 'humanoid', 'humanoid', 'undead', 'dragon'] };
  // the skills a monster of each type puts its ranks in, most likely first
  var SKILL_BY_TYPE = { animal: ['Perception', 'Stealth', 'Acrobatics', 'Swim', 'Climb', 'Survival'], vermin: ['Perception', 'Climb', 'Stealth'],
    ooze: ['Perception', 'Climb'], plant: ['Perception', 'Stealth'], construct: ['Perception'],
    'magical beast': ['Perception', 'Stealth', 'Acrobatics', 'Climb', 'Survival', 'Swim'], 'monstrous humanoid': ['Perception', 'Intimidate', 'Climb', 'Stealth', 'Survival'],
    aberration: ['Perception', 'Stealth', 'Swim', 'Knowledge (dungeoneering)', 'Intimidate', 'Escape Artist'], undead: ['Perception', 'Stealth', 'Intimidate', 'Climb'],
    dragon: ['Perception', 'Intimidate', 'Fly', 'Sense Motive', 'Knowledge (arcana)', 'Bluff', 'Diplomacy', 'Spellcraft'],
    outsider: ['Perception', 'Intimidate', 'Bluff', 'Sense Motive', 'Knowledge (planes)', 'Stealth', 'Acrobatics'],
    fey: ['Perception', 'Stealth', 'Bluff', 'Acrobatics', 'Escape Artist', 'Sense Motive', 'Diplomacy', 'Sleight of Hand'] };
  // special abilities of a random monster, from the Universal Monster Rules, as fit its type, attacks, size and CR
  function monsterAbilities(cr) {
    var D = compute(), big = Math.max(1, Math.round(cr)), hd = D.totalHD, sizeI = SIZE_ORDER.indexOf(S.size), M = D.mods;
    var noCon = /^(undead|construct)$/.test(S.type);
    // 10 + half its HD + the ability, but within 2 below and 3 above the CR's usual DC
    var dcFloor = crTargets(cr).dc - 2, healed = false;
    var dc = function (ab) { return Math.min(dcFloor + 5, Math.max(dcFloor, 10 + Math.floor(hd / 2) + (ab === 'Con' && noCon ? M.Cha : M[ab]))); };
    var nat = function (re) { return S.weapons.filter(function (w) { return /^nat/.test(w.mode) && re.test(w.n); }); };
    var atkOf = function (w) { return D.attacks.filter(function (a) { return a.row === w; })[0]; };
    var dmg = function (w) { var a = atkOf(w); return a ? a.dice + (a.dmgMod ? sgn(a.dmgMod).replace('–', '-') : '') : '1d6'; };
    var rider = function (w, t) { if (w) w.rider = (w.rider ? w.rider + ' and ' : 'plus ') + t; };
    var add = function (k, t) { S[k] = S[k] ? S[k] + (k === 'defense' ? '; ' : ', ') + t : t; };
    var special = function (n, ty, t) { S.special.push({ name: n, type: ty, text: t }); };
    var t = S.type, beast = /^(animal|magical beast)$/.test(t), str15 = M.Str > 0 ? Math.floor(M.Str * 1.5) : M.Str;
    var bite = nat(/^bite$/)[0], claws = nat(/^claw/)[0], grabby = nat(/^(bite|claw|tentacle|slam)/)[0], sting = nat(/^sting$/)[0];
    var opts = [];
    if (grabby && /^(animal|magical beast|aberration|plant|vermin|undead|monstrous humanoid|ooze)$/.test(t)) opts.push(function () {
      var w = nat(/^(tentacle|slam)/)[0] || grabby; rider(w, 'grab');
      if (/^(tentacle|slam)/.test(w.n) || /^(plant|aberration)$/.test(t)) add('specialAttacks', 'constrict (' + dmg(w) + ')');
    });
    if (bite && beast) opts.push(function () { rider(bite, 'trip'); });
    if (claws && beast && big >= 2) opts.push(function () {
      add('specialAttacks', 'pounce');
      if (big >= 3) { var a = atkOf(claws); add('specialAttacks', 'rake (2 claws ' + sgn(a ? a.atk : D.bab) + ', ' + dmg(claws) + ')'); }
    });
    if (claws && (claws.count || 1) >= 2 && big >= 4 && /^(magical beast|monstrous humanoid|undead|outsider|aberration)$/.test(t))
      opts.push(function () { add('specialAttacks', 'rend (2 claws, ' + (atkOf(claws) ? atkOf(claws).dice : '1d6') + sgn(str15) + ')'); });
    if (beast) opts.push(function () { add('sq', 'ferocity'); });
    if ((sting || bite) && /^(vermin|aberration|monstrous humanoid|plant|magical beast)$/.test(t)) opts.push(function () {
      var w = sting || bite, ab = pick(['Str', 'Dex', 'Con']); rider(w, 'poison');
      special('Poison', 'Ex', capFirst(w.n) + '—injury; save Fort DC ' + dc('Con') + '; frequency 1/round for 6 rounds; effect 1d' + (big >= 8 ? 4 : 2) + ' ' + ab + ' damage; cure ' + (big >= 10 ? 2 : 1) + ' consecutive save' + (big >= 10 ? 's' : '') + '.');
    });
    if (t === 'vermin') opts.push(function () { add('specialAttacks', 'web (' + sgn(D.rangedTouch) + ' ranged, DC ' + dc('Con') + ', hp ' + hd + ')'); });
    if (sizeI >= SIZE_ORDER.indexOf('Large') && big >= 4 && /^(animal|magical beast|plant|construct|vermin)$/.test(t))
      opts.push(function () { add('specialAttacks', 'trample (' + (atkOf(S.weapons[0]) ? atkOf(S.weapons[0]).dice : '2d6') + sgn(str15) + ', DC ' + dc('Str') + ')'); });
    if (bite && sizeI >= SIZE_ORDER.indexOf('Huge') && big >= 7) opts.push(function () {
      if (!/grab/.test(bite.rider || '')) rider(bite, 'grab');
      add('specialAttacks', 'swallow whole (' + dmg(bite) + ' bludgeoning plus ' + Math.max(1, Math.floor(big / 3)) + 'd6 acid, AC ' + (10 + Math.floor((S.natural || 0) / 2)) + ', ' + Math.max(5, Math.floor(D.hp / 10)) + ' hp)');
    });
    if (big >= 6 && /^(outsider|aberration|monstrous humanoid|magical beast)$/.test(t))
      opts.push(function () { if (healed) return; healed = true; add('defense', 'regeneration ' + (big >= 12 ? 10 : 5) + ' (' + pick(['acid or fire', 'fire', 'good', 'cold iron', 'electricity']) + ')'); });
    if (big >= 4 && /^(undead|outsider|construct|ooze)$/.test(t)) opts.push(function () { if (healed) return; healed = true; add('defense', 'fast healing ' + Math.max(2, Math.floor(big / 2))); });
    if ((t === 'dragon' && big >= 8) || (t === 'outsider' && big >= 10))
      opts.push(function () { add('aura', 'frightful presence (' + (big >= 15 ? 240 : 180) + ' ft., DC ' + dc('Cha') + ')'); });
    var touchy = nat(/^(slam|claw)/)[0] || S.weapons[0];
    if (t === 'undead' && big >= 6) opts.push(function () { rider(touchy, 'energy drain (' + (big >= 12 ? 2 : 1) + ' level' + (big >= 12 ? 's' : '') + ', DC ' + dc('Cha') + ')'); });
    if (/^(undead|aberration)$/.test(t)) opts.push(function () { rider(touchy, 'paralysis (1d4 rounds, Fort DC ' + dc(t === 'undead' ? 'Cha' : 'Con') + ')'); });
    if (/^(aberration|undead|monstrous humanoid)$/.test(t)) opts.push(function () { add('aura', 'stench (30 ft., DC ' + dc('Con') + ', 10 rounds)'); });
    if (bite && /^(undead|vermin)$/.test(t)) opts.push(function () { if (!/grab/.test(bite.rider || '')) rider(bite, 'grab'); add('specialAttacks', 'blood drain (1d' + (big >= 8 ? 4 : 2) + ' Con)'); });
    if (t === 'ooze') opts.push(function () {
      rider(S.weapons[0], Math.max(1, Math.floor(big / 2)) + 'd6 acid');
      add('specialAttacks', pick(['engulf (' + dmg(S.weapons[0]) + ' plus acid, Reflex DC ' + dc('Str') + ' negates)', 'corrosion (it dissolves metal and wood it touches)']));
    });
    if (t === 'magical beast' && big >= 5) opts.push(function () {
      add('specialAttacks', 'breath weapon (' + (big >= 10 ? 60 : 30) + '-ft. cone, ' + Math.max(2, Math.ceil(big / 2)) + 'd6 ' + pick(['fire', 'cold', 'acid', 'electricity']) + ', Reflex DC ' + dc('Con') + ' half, usable every 1d4 rounds)');
    });
    if (big >= 7 && /^(aberration|magical beast|undead)$/.test(t))
      opts.push(function () { add('aura', 'gaze (' + pick(['confusion 1d4 rounds', 'fear', 'paralysis 1d4 rounds', 'slow 1d6 rounds']) + ', 30 ft., Will DC ' + dc('Cha') + ' negates)'); });
    shuffle(opts).slice(0, 1 + (big >= 6 ? 1 : 0) + (big >= 12 ? 1 : 0) + (chance(0.3) ? 1 : 0)).forEach(function (f) { f(); });
    // how it moves and senses, by type
    var sp = { vermin: '40 ft., climb 30 ft.', ooze: '10 ft., climb 10 ft.', plant: '20 ft.', construct: '30 ft.' }[t];
    if (sp) S.speed = sp;
    else if (beast && chance(0.3)) S.speed = '30 ft., ' + pick(['fly 60 ft. (average)', 'swim 40 ft.', 'climb 30 ft.', 'burrow 20 ft.']);
    else if (beast && sizeI >= SIZE_ORDER.indexOf('Large')) S.speed = '40 ft.';
    else if (t === 'aberration' && chance(0.4)) S.speed = '20 ft., swim 40 ft.';
    else if (/^(outsider|fey)$/.test(t) && chance(0.35)) S.speed = '30 ft., fly 60 ft. (' + (t === 'fey' ? 'perfect' : 'good') + ')';
    var sense = { vermin: 'tremorsense 60 ft.', 'magical beast': 'scent', aberration: 'blindsense 30 ft.', undead: chance(0.5) ? 'lifesense 60 ft.' : '', outsider: chance(0.4) ? 'see in darkness' : '' }[t];
    if (sense && (S.senses || '').indexOf(sense) < 0) S.senses = (S.senses ? S.senses + ', ' : '') + sense;
  }
  // size changes to Str (Con half as much, Dex down) from Medium
  var SIZE_STR = { Fine: -8, Diminutive: -6, Tiny: -4, Small: -2, Medium: 0, Large: 4, Huge: 8, Gargantuan: 12, Colossal: 16 };
  // opts (all optional, from the Random enemy form): type (a creature type) or cls (a Star Wars class key), size
  function randomEnemy(crText, opts) {
    opts = opts || {};
    var cr = crValue(crText), tierN = opts.tier || 0;
    // a mythic enemy is built at the CR asked for and its tiers go on top, as for a mythic party of that level
    var T = crTargets(cr), big = Math.max(1, Math.round(cr));
    var keep = { maxHp: S.maxHp };
    S = blank(); S.maxHp = keep.maxHp !== false; S.cr = crText; S.align = pick(['LE', 'NE', 'CE', 'CE', 'NE', 'N', 'CN', 'LN']);
    var classed = false, concept, typeKey;
    var arr = shuffle([0, 1, 2]);
    var setAbil = function (order, base) { order.forEach(function (a, i) { S.abil[a] = base[i]; }); };
    var grow = function (a, n) { S.abil[a] += n; };
    if (SWM) {
      var key = opts.cls || pick(SWD.classes).s, slugK = 'sw-' + key, d = CLASS_BY[slugK], role = d.role || 'martial';
      // the concepts (skills, builds, names) go by the class's role: martial, specialist or caster
      concept = role === 'martial' ? 'sw-warrior' : role === 'specialist' ? 'sw-specialist' : 'sw-consular'; classed = true;
      S.type = 'humanoid'; S.hd = 0; S.subtypes = pick(SUB.species);
      var lvl = Math.max(1, Math.min(20, cr < 1 ? 1 : Math.round(cr) + 1));
      var c = { s: slugK, lvl: lvl, picks: [] };
      S.classes = [c];
      S.sw = { karma: SUB.karma ? (chance(0.65) ? -10 * (1 + rnd(Math.min(10, 1 + Math.floor(lvl / 2)))) : chance(0.3) ? 10 * (1 + rnd(3)) : 0) : 0,
        force: !!SUB.force && (role === 'caster' || (role === 'martial' && chance(0.35))), abil: role === 'caster' ? pick(['Wis', 'Wis', 'Cha', 'Int']) : 'Wis' };
      // its elements: as many common ones as its Elemental Affinity gives by now (the Jutsu Master gets more at 5th, 10th
      // and 15th), or the one asked for: a unique element needs the Elemental Bloodline feat, and a common one before the class gives one needs
      // the Extra Elemental Affinity feat
      if (SUB.elements && SWD.elements.length) {
        var aff = (d.special || []).map(function (t, i) { return /Elemental Affinity/i.test(t) ? i + 1 : 0; }).filter(function (x) { return x && x <= lvl; }).length
          + (role === 'caster' ? [5, 10, 15].filter(function (x) { return x <= lvl; }).length : 0);
        var els = [], need = [], extraEls = SWD.extraElements || [];
        if (opts.element) {
          els.push(opts.element);
          if (extraEls.indexOf(opts.element) >= 0) need.push('Elemental Bloodline (' + opts.element.toLowerCase() + ')'); // its 1st-level feat (bloodline techniques)
          else if (aff > 0) aff--; else need.push('Extra Elemental Affinity');
        }
        for (; aff > 0; aff--) { var ne = SWD.elements.filter(function (x) { return els.indexOf(x) < 0; }); if (!ne.length) break; els.push(pick(ne)); }
        if (!els.length && chance(0.3)) { els.push(pick(SWD.elements)); need.push('Extra Elemental Affinity'); }
        S.sw.elements = els; S.sw.element = els[0] || ''; S.sw.needFeats = need; S.sw.elementChosen = !!opts.element;
      }
      if (role === 'martial') setAbil(['Str', 'Con', 'Dex', 'Wis', 'Int', 'Cha'], [16, 14, 14, 12, 10, 8]);
      else if (role === 'specialist') setAbil(['Dex', 'Int', 'Con', 'Wis', 'Cha', 'Str'], [16, 14, 13, 12, 10, 10]);
      else setAbil([S.sw.abil, 'Dex', 'Con', S.sw.abil === 'Wis' ? 'Cha' : 'Wis', 'Str', S.sw.abil === 'Int' ? 'Cha' : 'Int'], [16, 14, 14, 12, 10, 10]);
      var main = role === 'martial' ? 'Str' : role === 'specialist' ? 'Dex' : S.sw.abil;
      grow(main, Math.floor(lvl / 4) + 2 * Math.floor(lvl / 7)); grow('Con', Math.floor(lvl / 8));
      if (opts.size) { S.size = opts.size; var swSZ = SIZE_STR[S.size] || 0; S.abil.Str += swSZ; S.abil.Con += swSZ / 2; S.abil.Dex -= Math.max(0, swSZ / 2); }
      // class feature choices, within the points of each choice and the Iconic and OP limits
      // only features an enemy built to fight would take: no shapechanging, companions or exploration-only ones, and
      // the ones that fit its role are likelier (a caster's spells and DCs, a martial's attacks and AC)
      var by = swEntries(d.key), used = {}, iconic = false, opLow = false, opHigh = false;
      var entries = Object.keys(by).map(function (k) { return by[k]; }).filter(function (e) { return !PICK_BAN.test(e.n) && !FLAVOR_BAN.test(e.n); });
      var fit = ROLE_FIT[role], weight = function (e) {
        var t = e.n + ' ' + ((SW_INFO[e.n + '|' + e.link] || {}).text || e.text || '');
        var hits = (t.match(fit) || []).length;
        // a caster rarely takes a feature that is only about weapons
        return 1 + 3 * Math.min(3, hits) - (role === 'caster' && !hits && (e.n.match(ROLE_FIT.martial) || []).length ? 0.9 : 0);
      };
      var take = function (slot, price) {
        var pool = entries.filter(function (e) { return e.price === price && e.lvl <= slot && !used[e.n]; });
        if (!pool.length) return false;
        var ws = pool.map(weight), r = Math.random() * ws.reduce(function (a, b) { return a + b; }, 0), e = pool[pool.length - 1];
        for (var i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) { e = pool[i]; break; } }
        used[e.n] = 1;
        c.picks.push({ slot: slot, n: e.n, link: e.link, price: e.price, lvl: e.lvl, text: e.text || '' });
        return true;
      };
      swSlots(d, lvl).forEach(function (sl) {
        var r = Math.random(), done = false;
        if (!sl.small) {
          var opFree = sl.lvl <= 10 ? !opLow : !opHigh;
          if (!iconic && r < 0.2 && take(sl.lvl, 'iconic')) { iconic = true; done = true; }
          else if (opFree && r < 0.45 && take(sl.lvl, 'op')) { if (sl.lvl <= 10) opLow = true; else opHigh = true; done = true; }
          if (!done) {
            if (r < 0.92 && take(sl.lvl, 'common')) { if (!take(sl.lvl, 'common')) { take(sl.lvl, 'weak'); take(sl.lvl, 'weak'); } }
            else for (var q = 0; q < 4; q++) take(sl.lvl, 'weak');
          }
        } else if (r < 0.6) { take(sl.lvl, 'common') || take(sl.lvl, 'weak'); }
        else { take(sl.lvl, 'weak'); take(sl.lvl, 'weak'); }
      });
      // weapons: Star Wars, a lightsaber for the Force users and blasters for the rest; Naruto, ninja weapons; Heroes, fists or guns
      if (MODE === 'starwars') {
        var sabers = SWD.weapons.filter(function (w) { return !w.blaster; }), blasters = SWD.weapons.filter(function (w) { return w.blaster; });
        var saber = S.sw.force ? makeAttack(pick(sabers).n) : null;
        if (saber) S.weapons.push(saber);
        if (role !== 'caster' || chance(0.3)) { var bl = makeAttack(pick(role === 'specialist' ? blasters.filter(function (w) { return /pistol|revolver|rifle|shotgun|smg|sniper/i.test(w.n); }) : blasters).n); bl.opt = saber ? 2 : 1; S.weapons.push(bl); }
      } else if (MODE === 'chakra') {
        S.weapons.push(makeAttack(role === 'martial' ? firstWeapon(['Katana', 'Wakizashi', 'Nodachi', 'Kusarigama', 'Ninja-to'], ['one-handed', 'two-handed']) : firstWeapon(['Kunai', 'Wakizashi', 'Short sword'], ['light'])));
        var thrown = makeAttack(firstWeapon(['Shuriken', 'Kunai', 'Dart'], ['ranged', 'light']), 'thrown'); thrown.opt = 2; S.weapons.push(thrown);
      } else {
        if (role === 'specialist') { var gun = makeAttack(firstWeapon(['Pistol', 'Revolver', 'Assault Rifle', 'Rifle', 'Pistol, Automatic'], ['ranged'])); S.weapons.push(gun); }
        S.weapons.push(makeAttack(role === 'martial' && chance(0.5) ? firstWeapon(['Warhammer', 'Longsword', 'Battleaxe', 'Club'], ['one-handed']) : 'unarmed strike'));
      }
      if (!S.weapons.length) S.weapons.push(makeAttack('unarmed strike'));
      // powers: regular spells under the setting's names (as the subsystem allows), as many of each level as the class
      // table knows (up to 3, so the stat block stays usable), and a few of the subsystem's own free ones
      var known = d.powers[lvl - 1] || [], flavor = powerFlavor(role), fp = [];
      if (flavor) {
        (SWD.powers || []).filter(function (p) { return (p.free || p.lvl === 0) && !UNIQUE_POWER.test(p.n) && (MODE !== 'starwars' || S.sw.force); })
          .sort(function () { return Math.random() - 0.5; }).slice(0, 2).forEach(function (p) { fp.push({ n: p.n, fp: true, lvl: p.lvl, uses: '' }); });
        known.forEach(function (n, pl) { subPowers(flavor, pl, Math.min(n, 3), fp.map(function (x) { return x.u || x.n; })).forEach(function (x) { fp.push(x); }); });
      }
      if (fp.length) S.casters.push({ kind: 'Force Powers', cls: '', cl: lvl, abil: S.sw.abil, spells: fp, title: flavor && flavor.title });
      if (role !== 'caster' && MODE !== 'superheroes') { S.armor = bestArmor(role === 'martial' ? (lvl >= 6 && MODE === 'starwars' ? 'heavy' : 'medium') : 'light'); }
      S.languages = SUB.lang;
      typeKey = MODE + '-' + role;
    } else {
      // a chosen type: a concept that fits it (an ooze or a plant can only be a brute)
      var concepts = ['brute', 'brute', 'warrior', 'skirmisher', 'caster'];
      if (opts.type) concepts = concepts.filter(function (k) { return CONCEPT_TYPES[k].indexOf(opts.type) >= 0; });
      concept = RAND_FORCE ? RAND_FORCE.concept : opts.cls ? classConcept(opts.cls) : pick(concepts.length ? concepts : ['brute']);
      var types = CONCEPT_TYPES[concept];
      if (cr < 3) types = types.filter(function (t) { return t !== 'construct' && t !== 'dragon'; });
      S.type = RAND_FORCE || opts.cls ? opts.type || 'humanoid' : opts.type || pick(types);
      var td = TYPES[S.type]; S.die = td.die; S.bab = td.bab; S.ranks = td.ranks;
      S.good = { Fort: td.good.indexOf('Fort') >= 0, Ref: td.good.indexOf('Ref') >= 0, Will: td.good.indexOf('Will') >= 0 };
      // a humanoid is of one of the wiki's humanoid races (its modifiers, size, speed and subtypes)
      var race = null;
      if (S.type === 'humanoid') {
        S.good.Fort = true;
        var hums = SWM ? [] : raceList().filter(function (x) { return x.type === 'humanoid'; });
        if (hums.length) { race = pick(hums); applyRace(race.n); }
        else S.subtypes = pick(['human', 'human', 'orc', 'goblinoid', 'elf', 'dwarf', 'gnoll', 'halfling', 'gnome', 'kobold', 'lizardfolk', 'tiefling']);
      }
      // size by CR for the brutes
      if (concept === 'brute') S.size = cr < 1 ? pick(['Small', 'Medium']) : cr < 3 ? 'Medium' : cr < 5 ? pick(['Medium', 'Large']) : cr < 9 ? 'Large' : cr < 15 ? pick(['Large', 'Huge']) : pick(['Huge', 'Gargantuan']);
      else if (!race && chance(0.15) && S.type !== 'outsider') S.size = 'Small';
      if (opts.size) S.size = opts.size;
      var SZ = SIZE_STR[S.size] || 0;
      if (concept === 'brute') setAbil(['Str', 'Con', 'Dex', 'Wis', 'Cha', 'Int'], [18, 16, 12, 12, 10, 6]);
      else if (concept === 'warrior') setAbil(['Str', 'Con', 'Dex', 'Wis', 'Int', 'Cha'], [17, 14, 13, 12, 10, 8]);
      else if (concept === 'skirmisher') setAbil(['Dex', 'Con', 'Wis', 'Str', 'Int', 'Cha'], [18, 14, 12, 12, 10, 10]);
      else setAbil(['Cha', 'Dex', 'Con', 'Wis', 'Int', 'Str'], [18, 14, 14, 12, 12, 8]);
      S.abil.Str = Math.max(1, S.abil.Str + SZ); S.abil.Con = Math.max(3, S.abil.Con + SZ / 2); S.abil.Dex -= Math.max(0, SZ / 2);
      if (SZ < 0) S.abil.Dex -= SZ / 2; // smaller is quicker
      var mainA = concept === 'brute' || concept === 'warrior' ? 'Str' : concept === 'skirmisher' ? 'Dex' : 'Cha';
      grow(mainA, 2 * Math.floor(big / 4)); grow('Con', 2 * Math.floor(big / 6));
      // a race's "+2 to one ability score" goes on its main ability
      if (race && race.any) { var anyOk = race.any.from || ABIL; S.race.any = anyOk.indexOf(mainA) >= 0 ? mainA : anyOk[0]; S.race.adj = raceMods(race, S.race.any); }
      if (S.type === 'animal' || S.type === 'vermin' || S.type === 'ooze' || S.type === 'plant') S.abil.Int = S.type === 'animal' ? 2 : 1;
      if (S.type === 'ooze') { S.abil.Dex = 1; S.align = 'N'; }
      if (S.type === 'animal') { S.abil.Cha = Math.min(S.abil.Cha, 8); S.align = 'N'; }
      // a humanoid gets class levels (or the class asked for, on any type); a monster, racial Hit Dice
      var CLS = RANDOM_CLS[concept];
      var clsSlug = RAND_FORCE ? RAND_FORCE.cls : opts.cls ? opts.cls : S.type === 'humanoid' && CLS ? pick(CLS.filter(function (s) { return CLASS_BY[s]; })) || null : null;
      RAND_LAST = { concept: concept, cls: clsSlug };
      if (clsSlug) {
        classed = true; S.hd = 0;
        S.classes = [{ s: clsSlug, lvl: Math.max(1, Math.min(20, cr < 1 ? 1 : Math.round(cr) + 1)), arch: [], off: [] }];
        loadArch(clsSlug);
        randomArchetype(S.classes[0]);
        randomDip(S.classes[0], concept);
      } else {
        var conM = S.type === 'undead' ? mod(score('Cha')) : S.type === 'construct' ? 0 : mod(score('Con'));
        var per = (S.maxHp ? S.die : (S.die + 1) / 2) + conM + (S.type === 'construct' ? 0 : 0);
        var extra = S.type === 'construct' ? (SIZES[S.size] || SIZES.Medium).construct : 0;
        S.hd = Math.max(1, Math.min(40, Math.round((T.hp - extra) / Math.max(2, per))));
      }
      // attacks
      if (concept === 'brute') {
        var sets = { dragon: [['bite'], ['claw', 2], ['wing', 2]], 'magical beast': pick([[['bite'], ['claw', 2]], [['gore'], ['hoof', 2]], [['bite'], ['tail slap']]]),
          animal: pick([[['bite']], [['bite'], ['claw', 2]], [['gore'], ['hoof', 2]]]), aberration: [['bite'], ['tentacle', 2 + rnd(3)]], outsider: [['claw', 2], ['bite']],
          undead: pick([[['claw', 2], ['bite']], [['slam', 2]]]), construct: [['slam', 2]], vermin: [['bite'], ['sting']], 'monstrous humanoid': [['claw', 2], ['bite']],
          plant: pick([[['slam', 2]], [['tentacle', 2], ['bite']]]), ooze: [['slam']], fey: [['claw', 2]], humanoid: [['slam', 2]] }[S.type] || [['slam', 2]];
        if (S.type === 'monstrous humanoid' && chance(0.5)) { S.weapons.push(makeAttack(firstWeapon(['Greataxe', 'Greatclub', 'Falchion', 'Glaive', 'Greatsword'], ['two-handed']))); S.armor = bestArmor('light'); }
        else sets.forEach(function (x) { var w = makeAttack(x[0]); w.count = x[1] || 1; S.weapons.push(w); });
      } else if (concept === 'warrior') {
        if (chance(0.5)) S.weapons.push(makeAttack(firstWeapon(['Greatsword', 'Greataxe', 'Falchion', 'Glaive', 'Halberd', 'Earth breaker'], ['two-handed'])));
        else { S.weapons.push(makeAttack(firstWeapon(['Longsword', 'Battleaxe', 'Warhammer', 'Heavy mace', 'Morningstar', 'Flail'], ['one-handed']))); S.shield = pick(['Shield, heavy steel', 'Shield, heavy wooden']); if (!armorData(S.shield)) S.shield = ''; }
        var rw = makeAttack(firstWeapon(['Composite longbow', 'Longbow', 'Heavy crossbow', 'Javelin'], ['ranged'])); S.weapons.push(rw);
        S.armor = bestArmor(big >= 4 ? 'heavy' : 'medium');
      } else if (concept === 'skirmisher') {
        if (chance(0.5)) { S.weapons.push(makeAttack(firstWeapon(['Rapier', 'Short sword', 'Kukri', 'Scimitar'], ['light', 'one-handed']))); S.weapons.push(makeAttack(firstWeapon(['Shortbow', 'Light crossbow', 'Composite shortbow'], ['ranged']))); }
        else { S.weapons.push(makeAttack(firstWeapon(['Shortbow', 'Longbow', 'Composite longbow', 'Light crossbow'], ['ranged']))); S.weapons.push(makeAttack(firstWeapon(['Short sword', 'Dagger', 'Rapier'], ['light']))); }
        S.weapons.forEach(function (w) { if (/^(melee|off)$/.test(w.mode)) w.finesse = true; });
        if (/gunslinger|deadeye-hexer/.test(clsSlug || '')) S.weapons = [makeAttack(firstWeapon(['Pistol', 'Musket', 'Pistol, double-barreled', 'Rifle'], ['ranged']))].concat(S.weapons.filter(function (w) { return !/^(ranged|thrown)$/.test(w.mode); }));
        S.armor = bestArmor('light');
      } else {
        S.weapons.push(makeAttack(S.type === 'humanoid' ? firstWeapon(['Quarterstaff', 'Dagger', 'Light mace'], ['one-handed', 'light']) : pick(['claw', 'slam', 'bite'])));
        if (!/^nat/.test(S.weapons[0].mode) && S.weapons[0].mode === 'melee' && /quarterstaff/.test(S.weapons[0].n)) S.weapons[0].mode = 'two';
      }
      // monks fight unarmored with their fists (and sometimes a monk weapon); a brawler with fists in light armor
      if (/^(monk|unchained-monk|brawler)$/.test(clsSlug || '')) {
        S.weapons = [makeAttack('unarmed strike')];
        var mw = chance(0.5) && makeAttack(firstWeapon(['Kama', 'Nunchaku', 'Siangham', 'Sword, temple', 'Quarterstaff'], ['light', 'one-handed']));
        if (mw) { if (/quarterstaff/.test(mw.n)) mw.mode = 'two'; mw.opt = 2; S.weapons.push(mw); }
        var sh = makeAttack(firstWeapon(['Shuriken', 'Javelin'], ['ranged'])); sh.mode = 'thrown'; sh.opt = 2; S.weapons.push(sh);
        S.shield = ''; S.armor = clsSlug === 'brawler' ? bestArmor('light') : '';
        if (clsSlug !== 'brawler') { S.abil.Wis = Math.max(S.abil.Wis, 14); S.abil.Dex = Math.max(S.abil.Dex, 14); }
      }
      // the omdura and the medium only know simple weapons (and the omdura medium armor and shields)
      if (/^(omdura|medium)$/.test(clsSlug || '')) {
        var two = chance(0.4);
        S.weapons = [makeAttack(two ? firstWeapon(['Longspear', 'Quarterstaff'], ['two-handed']) : firstWeapon(['Heavy mace', 'Morningstar', 'Spear'], ['one-handed'])),
          makeAttack(firstWeapon(['Heavy crossbow', 'Light crossbow', 'Javelin'], ['ranged']))];
        if (/quarterstaff|spear/.test(S.weapons[0].n) && two) S.weapons[0].mode = 'two';
        S.armor = bestArmor(clsSlug === 'omdura' ? 'medium' : 'light');
        S.shield = clsSlug === 'omdura' && !two && armorData('Shield, heavy wooden') ? 'Shield, heavy wooden' : '';
      }
      typeKey = clsSlug ? concept : S.type;
      if (S.type !== 'humanoid') S.senses = S.type === 'animal' ? 'low-light vision, scent' : S.type === 'fey' || S.type === 'plant' ? 'low-light vision' : S.type === 'ooze' ? 'blindsight 60 ft.' : 'darkvision 60 ft.';
      else if (race) S.senses = race.senses || '';
      else if (S.subtypes !== 'human') S.senses = 'darkvision 60 ft.';
      S.languages = S.type === 'animal' || S.type === 'vermin' || S.type === 'ooze' || S.type === 'plant' ? '' : S.type === 'outsider' ? pick(['Abyssal', 'Infernal', 'Celestial']) + ', Common' : S.type === 'construct' ? '' : 'Common';
      if (S.type === 'dragon') { var bdc = Math.max(1, Math.ceil(big / 2)); S.specialAttacks = 'breath weapon (' + (big >= 10 ? 60 : 30) + '-ft. cone, ' + bdc + 'd6 ' + pick(['fire', 'acid', 'cold', 'electricity']) + ', Reflex DC ' + T.dc + ' half, usable every 1d4 rounds)'; S.speed = '40 ft., fly ' + (big >= 10 ? 200 : 150) + ' ft. (poor)'; }
      if (S.type === 'ooze') S.defense = 'Immune ooze traits (critical hits, flanking, mind-affecting, paralysis, poison, polymorph, sleep, stun)';
      else if (S.type === 'plant') S.defense = 'Immune plant traits (mind-affecting, paralysis, poison, polymorph, sleep, stun)';
      else if (S.type === 'construct') S.defense = 'Immune construct traits' + (big >= 8 ? '; DR ' + (big >= 14 ? 10 : 5) + '/adamantine' : '');
      else if (S.type === 'undead') S.defense = 'Immune undead traits' + (big >= 6 ? '; DR ' + (big >= 12 ? 10 : 5) + '/' + pick(['bludgeoning', 'silver', 'good']) : '');
      else if (S.type === 'outsider' && big >= 5) S.defense = 'DR ' + (big >= 12 ? 10 : 5) + '/' + pick(['good', 'evil', 'cold iron', 'magic']) + '; Resist fire 10' + (big >= 8 ? '; SR ' + (big + 11) : '');
      else if (S.type === 'aberration' && big >= 7) S.defense = 'SR ' + (big + 11);
      if (clsSlug === 'kineticist') randomKineticist(S.classes[0].lvl);
      else if (clsSlug === 'kinetic-shinobi') randomShinobi();
      else if (clsSlug === 'alchemist') randomAlchemist(S.classes[0].lvl, T);
      else if (clsSlug === 'shifter') randomShifter(S.classes[0].lvl);
      // spells: spell-like abilities for monsters, spells for a classed caster
      else if (concept === 'caster') {
        var list = clsSlug ? (CLASSES.indexOf(clsSlug.replace(/^(legendary|unchained)-/, '')) >= 0 ? clsSlug.replace(/^(legendary|unchained)-/, '') : 'sorcerer') : pick(['sorcerer', 'cleric', 'druid', 'witch']);
        var abil = /^(wizard|witch|magus|arcanist|psychic|occultist|legendary-magus|alchemist|legendary-alchemist|investigator)$/.test(clsSlug) ? 'Int' : /^(cleric|druid|inquisitor|shaman|spiritualist|hunter|legendary-cleric|ranger|warpriest|adept)$/.test(clsSlug) ? 'Wis' : 'Cha';
        if (abil !== 'Cha') { var t2 = S.abil[abil]; S.abil[abil] = S.abil.Cha; S.abil.Cha = t2; }
        var clv = clsSlug ? S.classes[0].lvl : Math.max(1, Math.round(big * 1.2));
        // 6-level casters (bard, magus, inquisitor) get spells more slowly
        var six = /^(bard|magus|inquisitor|skald|mesmerist|occultist|spiritualist|hunter|legendary-magus)$/.test(clsSlug) || !!(S.classes[0] || {}).whw;
        var top = Math.max(clsSlug ? 0 : 1, six ? Math.min(6, Math.floor((clv + 2) / 3)) : Math.min(9, clsSlug && /sorcerer|oracle|psychic/.test(clsSlug) ? Math.floor(clv / 2) : Math.ceil(clv / 2)));
        var kind = !clsSlug ? 'Spell-Like Abilities' : /sorcerer|oracle|bard|inquisitor|skald|mesmerist|psychic|spiritualist|occultist|hunter|summoner|medium/.test(clsSlug) ? 'Spells Known' : 'Spells Prepared';
        if (/magus/.test(clsSlug || '')) { S.weapons = [makeAttack(firstWeapon(['Scimitar', 'Longsword', 'Rapier'], ['one-handed']))]; S.armor = bestArmor('light'); }
        var uses = kind === 'Spell-Like Abilities' ? function (l) { return l <= Math.max(1, Math.floor(top / 3)) && l < top ? 'At will' : l === top ? '1/day' : '3/day'; } : kind === 'Spells Prepared' ? function () { return 1 + rnd(2); } : function () { return ''; };
        var sp = randomSpells(list, top, kind === 'Spell-Like Abilities' ? 1 + rnd(2) : 2 + rnd(2), uses);
        if (kind === 'Spell-Like Abilities') sp = sp.filter(function (x) { return x.lvl > 0; });
        // the casting ability so the highest spell's DC is about the CR's primary DC
        S.abil[abil] = Math.max(12, Math.min(40, 10 + 2 * (T.dc - 10 - top) + 1));
        S.casters.push({ kind: kind, cls: list, cl: clv, abil: abil, spells: sp });
      }
    }
    // a fighting enemy of a spellcasting class (ranger, paladin, bloodrager, warpriest...): its own spells, at its pace
    // (4-level casters from 4th level at caster level -3, 6-level casters from 1st), instead of the class's "Spells" text
    if (!SWM && classed && !S.casters.length && S.classes[0]) {
      var cs = S.classes[0].s.replace(/^(legendary|unchained)-/, ''), cL = S.classes[0].lvl || 1;
      var cList = { 'deadeye-hexer': 'witch' }[cs] || cs; // the deadeye hexer casts from the witch's list
      if ((CLASSES.indexOf(cList) >= 0 || cList === 'omdura') && !/^(alchemist|investigator|kineticist|shifter|kinetic-shinobi)$/.test(cs)) {
        // the medium is a 4-level caster at its full level, with knacks (cantrips)
        var four = /^(ranger|paladin|antipaladin|bloodrager|medium)$/.test(cs), sixC = /^(bard|magus|inquisitor|skald|warpriest|hunter|mesmerist|occultist|spiritualist|summoner|omdura|deadeye-hexer)$/.test(cs);
        var cTop = four ? (cL >= 13 ? 4 : cL >= 10 ? 3 : cL >= 7 ? 2 : cL >= 4 ? 1 : 0) : sixC ? Math.min(6, Math.floor((cL + 2) / 3)) : Math.min(9, Math.ceil(cL / 2));
        if (cTop) {
          var cKind = /^(bloodrager|bard|skald|inquisitor|hunter|mesmerist|occultist|spiritualist|summoner|medium|sorcerer|oracle|psychic|omdura)$/.test(cs) ? 'Spells Known' : 'Spells Prepared';
          var cSp = randomSpells(cList, cTop, 2, cKind === 'Spells Prepared' ? function () { return 1; } : function () { return ''; });
          if (four && cs !== 'medium') cSp = cSp.filter(function (x) { return x.lvl > 0; });
          var cAbil = /^(magus|occultist|wizard|witch|arcanist|psychic|deadeye-hexer)$/.test(cs) ? 'Int' : /^(ranger|warpriest|inquisitor|hunter|cleric|druid|shaman|spiritualist)$/.test(cs) ? 'Wis' : 'Cha';
          // a fighter's casting score is low; give it at least 14 so the DCs and bonus spells make sense
          if (S.abil[cAbil] < 14) S.abil[cAbil] = 14;
          if (cSp.length) S.casters.push({ kind: cKind, cls: cList, cl: four && cs !== 'medium' ? Math.max(1, cL - 3) : cL, abil: cAbil, spells: cSp,
            title: cList !== cs ? CLASS_BY[S.classes[0].s].n + ' ' + kindLabel(cKind) : undefined });
        }
      }
    }
    if (!SWM) archetypeExtras();
    // skills and feats, then the numbers are nudged toward the CR's
    var D0 = compute();
    S.name = pick(NAME_ADJ) + ' ' + pick(NAME_NOUN[typeKey] || NAME_NOUN[concept] || ['Foe']);
    // skills: a classed enemy's from its concept; a monster's from its type (an animal does not pick locks)
    var setKey = SWM || classed ? concept : SKILL_BY_TYPE[S.type] ? S.type : concept;
    var skList = (SKILL_BY_TYPE[setKey] || SKILL_SETS[setKey]).slice();
    if (!classed && concept === 'caster') skList = skList.concat(['Spellcraft', 'Knowledge (arcana)']);
    var sk = skList.filter(function (n, i) { return D0.skills[n] && skList.indexOf(n) === i; }), pool = D0.rankPool, cap = D0.totalHD;
    if (SWM && D0.sw && D0.sw.cls) sk.slice(0, D0.sw.cls.picks).forEach(function (n) { (S.skills[n] = S.skills[n] || {}).cls = true; });
    sk.forEach(function (n) { var r = Math.min(cap, pool); if (r > 0) { (S.skills[n] = S.skills[n] || {}).r = r; pool -= r; } });
    var noRanged = function () { return !S.weapons.some(function (w) { return /^(ranged|thrown)$/.test(w.mode); }); };
    var F = [], addF = function (n) {
      if (/^(Point-Blank Shot|Rapid Shot|Manyshot)$/.test(n) && noRanged()) return;
      if (n && F.length < D0.featSlots && F.indexOf(n) < 0) F.push(n);
    };
    // one or two builds: feat chains that work together, with what they need (weapons, scores, ranks, a spell)
    // feats an element needs (Naruto), then bonus feats a class gives by name (the White-Haired Witch's Hex Strike), go in first
    ((S.sw && S.sw.needFeats) || []).forEach(function (n) { if (F.indexOf(n) < 0) F.push(n); });
    if ((S.classes || []).some(function (c) { return c.whw && c.lvl >= 5; }) && featOk('Hex Strike')) addF('Hex Strike');
    // (a build its class is known for goes first; two builds that each pick the weapons do not go together)
    var builds = [], allB = shuffle(randomBuilds(concept, D0, sk));
    allB.filter(function (b) { return b.prio; }).concat(allB.filter(function (b) { return !b.prio; })).forEach(function (b) {
      if (builds.length >= (D0.featSlots >= 6 ? 2 : 1)) return;
      if (SWAPS.test(b.label) && builds.some(function (x) { return SWAPS.test(x.label); })) return;
      builds.push(b);
    });
    builds.forEach(function (b) { if (b.setup) b.setup(); });
    builds.forEach(function (b) { b.feats().filter(function (n) { return n && featOk(n.replace(/\s*\(.*$/, '')); }).forEach(addF); });
    var mainW = S.weapons[0], wfOf = function (w) { var g = weaponGroups(w); return 'Weapon Focus (' + (g[0] || w.n) + ')'; };
    if (SWM) {
      if (S.weapons.some(function (w) { return /lightsaber/i.test(w.n); })) {
        var style = pick(['Shii-cho', 'Makashi', 'Soresu', 'Ataru', 'Shien', 'Djem-so', 'Niiman', 'Vapaad']);
        SWD.forms.filter(function (f) { return f.n.indexOf(style) === 0 && f.lvl <= D0.totalHD; }).forEach(function (f) { addF(f.n); });
      }
      if (mainW && featOk('Weapon Focus')) addF(wfOf(mainW));
      shuffle(['Improved Initiative', 'Toughness', 'Iron Will', 'Dodgility', 'Lightning Reflexes', 'Great Fortitude', 'Point-Blank Shot', 'Precise Shot', 'Combat Reflexes', 'Alertness']).filter(featOk).forEach(addF);
    } else {
      if (concept === 'skirmisher' && featOk('Weapon Finesse')) addF('Weapon Finesse');
      if (clsSlug === 'alchemist') { addF('Point-Blank Shot'); addF('Weapon Focus (bomb)'); ['Throw Anything', 'Improved Initiative', 'Rapid Shot', 'Extra Bombs', 'Extra Discovery'].filter(featOk).forEach(addF); }
      if (clsSlug === 'shifter') { addF('Weapon Focus (natural)'); ['Improved Initiative', 'Vital Strike', 'Toughness'].filter(featOk).forEach(addF); }
      if (clsSlug === 'kineticist') { addF('Point-Blank Shot'); addF('Weapon Focus (' + S.weapons[0].n + ')'); ['Extra Wild Talent', 'Improved Initiative', 'Toughness'].filter(featOk).forEach(addF); }
      if (mainW && featOk('Weapon Focus') && !/^(kineticist|alchemist|shifter)$/.test(clsSlug || '')) addF(wfOf(mainW));
      if (mainW && D0.bab >= 8 && featOk('Improved Critical')) addF('Improved Critical (' + mainW.n + ')');
      shuffle(FEAT_SETS[concept]).filter(featOk).forEach(addF);
      if (featOk('Skill Focus')) addF('Skill Focus (perception)');
    }
    // more feats than the concept's list: any of the others, then Skill Focus in its skills
    shuffle([].concat.apply([], Object.keys(FEAT_SETS).map(function (k) { return FEAT_SETS[k]; }))).filter(featOk).forEach(addF);
    if (featOk('Skill Focus')) sk.forEach(function (n) { addF('Skill Focus (' + n.toLowerCase() + ')'); });
    S.feats = F;
    tuneToCR(T, cr, classed);
    vitalRow();
    if (!SWM && !classed) monsterAbilities(cr);
    if ((S.classes || []).some(function (c) { return c.s === 'barbarian'; })) randomRagePowers();
    if (tierN) randomMythic(tierN, concept);
    return S;
  }
  // nudges a built enemy toward the CR's AC, attack, damage, saves and hp with gear and racial bonuses
  function tuneToCR(T, cr, classed) {
    var big = Math.max(0, Math.round(cr)), D = compute(), gear = [];
    var top = function (D) { var g = D.groups.melee[0] || D.groups.ranged[0]; return g && g[0] ? g[0].bonuses[0] : null; };
    // too strong for its CR: a weaker attacking ability, then a penalty
    var a = top(D);
    if (a != null && a > T.atk + 1) {
      var w0 = (D.groups.melee[0] ? S.weapons.filter(function (w) { return !/^(ranged|thrown)$/.test(w.mode); }) : S.weapons)[0] || {};
      var ab = /^(ranged|thrown)$/.test(w0.mode) || w0.finesse ? 'Dex' : 'Str';
      S.abil[ab] = Math.max(8, S.abil[ab] - 2 * (a - T.atk - 1));
      a = top(compute());
      if (a > T.atk + 1) S.weapons.forEach(function (w) { w.misc = (w.misc || 0) - (a - T.atk - 1); });
    }
    // too much AC: no shield, then lighter armor
    D = compute();
    var over = D.ac - T.ac;
    if (over > 2 && S.shield) { S.shield = ''; over = compute().ac - T.ac; }
    if (over > 2 && S.armor) { var ak = (armorData(S.armor) || {}).k; S.armor = over > 5 || ak === 'light' ? '' : bestArmor(ak === 'heavy' ? 'medium' : 'light'); }
    D = compute();
    // AC: magic armor, a ring of protection, then natural armor (or an amulet)
    var gap = T.ac - D.ac, want = { armor: 0, shield: 0, ring: 0, amulet: 0, weapon: 0, cloak: 0 };
    if (gap > 0 && S.armor) { want.armor = Math.min(gap, 5, Math.floor(big / 3)); gap -= want.armor; }
    if (gap > 0 && S.shield) { want.shield = Math.min(gap, 5, Math.floor(big / 4)); gap -= want.shield; }
    if (gap > 0 && classed) { want.ring = Math.min(gap, 5, Math.floor(big / 4)); gap -= want.ring; }
    if (gap > 0) { want.amulet = classed ? Math.min(gap, 5, Math.floor(big / 4)) : gap; gap -= want.amulet; }
    // attack: magic weapons, then a racial (or a buff's) bonus
    a = top(D);
    if (a != null && a < T.atk) want.weapon = Math.min(T.atk - a, 5, Math.floor(big / 3));
    // saves: a cloak of resistance
    ['Fort', 'Ref', 'Will'].forEach(function (k) {
      var ws = D.saves[k] >= (T.good + T.poor) / 2 ? T.good : T.poor, d = ws - D.saves[k];
      if (d > 0) want.cloak = Math.max(want.cloak, classed ? Math.min(d, Math.max(1, Math.ceil(big / 3))) : d);
    });
    // the weapons it fights with (its first attack option's), and whether they are its fists (an amulet of mighty fists)
    var magicOk = function (w) { return !/^nat/.test(w.mode) && !w.single && !w.fixed && !w.dmgAbil && !w.innate; };
    var firstOpt = S.weapons.filter(function (w) { return magicOk(w) && (w.opt || 1) === 1 && !/^(ranged|thrown)$/.test(w.mode); });
    if (!firstOpt.length) firstOpt = S.weapons.filter(function (w) { return magicOk(w) && (w.opt || 1) === 1; });
    var fists = firstOpt.some(function (w) { return w.n === 'unarmed strike'; }), blades = firstOpt.filter(function (w) { return w.n !== 'unarmed strike'; }).length;
    var got = { armor: 0, shield: 0, ring: 0, amulet: 0, weapon: 0, cloak: 0 }, gold = Infinity, potions = [];
    if (!classed) { got = want; got.ring = 0; }
    else {
      // a classed enemy buys its items with at most 300 gp per level: a +1 item when it can (even if its numbers are
      // already there), more only for the CR's numbers; martials buy their weapon first, casters their armor and cloak
      var lv = Math.max(1, (S.classes || []).reduce(function (t, c) { return t + (c.lvl || 0); }, 0));
      gold = 300 * lv;
      if (big >= 3) { if (S.armor) want.armor = Math.max(1, want.armor); if (firstOpt.length) want.weapon = Math.max(1, want.weapon); want.cloak = Math.max(1, want.cloak); if (S.shield) want.shield = Math.max(1, want.shield); }
      if (fists) want.amulet = 0; // one amulet: mighty fists
      var price = { weapon: function (e) { return 2000 * e * e * blades + (fists ? 4000 * e * e : 0); }, armor: function (e) { return 1000 * e * e; }, shield: function (e) { return 1000 * e * e; },
        cloak: function (e) { return 1000 * e * e; }, ring: function (e) { return 2000 * e * e; }, amulet: function (e) { return 2000 * e * e; } };
      var order = S.casters.length && !/^(melee|two)$/.test((firstOpt[0] || {}).mode || '') ? ['armor', 'cloak', 'ring', 'weapon', 'shield', 'amulet'] : ['weapon', 'armor', 'cloak', 'shield', 'ring', 'amulet'];
      for (var more = true; more;) {
        more = false;
        order.forEach(function (k) {
          if (got[k] >= want[k]) return;
          var c = price[k](got[k] + 1) - price[k](got[k]);
          if (c <= gold) { gold -= c; got[k]++; more = true; }
        });
      }
      // no magic weapon yet: masterwork ones
      if (!got.weapon) firstOpt.forEach(function (w) { if (w.n !== 'unarmed strike' && gold >= 300) { w.mwk = true; gold -= 300; } });
      // what is left: healing potions
      if (!SWM) {
        if (gold >= 750 && big >= 7) { potions.push('potion of cure serious wounds'); gold -= 750; }
        var nm = Math.min(2, Math.floor(gold / 300)); if (nm) { potions.push(nm + ' potion' + (nm > 1 ? 's' : '') + ' of cure moderate wounds'); gold -= 300 * nm; }
        var nl = Math.min(3, Math.floor(gold / 50)); if (nl) { potions.push(nl + ' potion' + (nl > 1 ? 's' : '') + ' of cure light wounds'); gold -= 50 * nl; }
      }
    }
    S.armorEnh = got.armor; S.shieldEnh = got.shield; S.deflection = got.ring; S.natural = got.amulet;
    if (got.weapon) (classed ? firstOpt : S.weapons.filter(magicOk)).forEach(function (w) { w.enh = got.weapon; });
    D = compute();
    a = top(D);
    if (a != null && a < T.atk) {
      var rest = T.atk - a;
      S.weapons.forEach(function (w) { w.misc = (w.misc || 0) + (classed ? Math.ceil(rest / 2) : rest); });
    }
    // damage: the average of the first full attack
    D = compute();
    var g = D.groups.melee[0] || D.groups.ranged[0];
    var countHits = function (g) { return g.reduce(function (t, x) { return t + x.count * x.bonuses.length; }, 0); };
    // a big monster with one or two natural attacks gets a pair of claws (or slams) rather than one huge hit
    if (g && !classed && big >= 5 && countHits(g) < 3 && S.weapons.length && S.weapons.every(function (w) { return /^nat/.test(w.mode); }) && !S.casters.length) {
      var extraN = makeAttack(/^(construct|undead|ooze|plant)$/.test(S.type) ? 'slam' : 'claw'); extraN.count = 2;
      if (S.weapons.some(function (w) { return w.n === extraN.n; })) S.weapons.forEach(function (w) { if (w.n === extraN.n) w.count = Math.max(2, w.count || 1); });
      else S.weapons.push(extraN);
      D = compute(); g = D.groups.melee[0];
    }
    if (g) {
      var hits = countHits(g), avg = 0;
      g.forEach(function (x) { var n = x.count * x.bonuses.length; avg += n * (diceAvg(x.dice) + x.mod); });
      // the rest of the damage as a bonus on each hit, at most about the CR per hit
      var per = Math.min((T.dmg * (S.casters.length ? 0.6 : 1) - avg) / Math.max(1, hits), Math.max(3, big));
      // (a kinetic blast's damage is the rules' own: dice + Con)
      if (per >= 1) S.weapons.forEach(function (w) { if (!w.single && !w.fixed) w.dmgMisc = (w.dmgMisc || 0) + Math.round(classed ? per / 2 : per); });
      else if (avg > T.dmg * 1.25 && per <= -1) S.weapons.forEach(function (w) { if (!w.single && !w.fixed) w.dmgMisc = (w.dmgMisc || 0) + Math.round(per); });
    }
    // saves: a cloak of resistance, or racial bonuses
    D = compute();
    var res = got.cloak;
    ['Fort', 'Ref', 'Will'].forEach(function (k) {
      if (classed) { S.saveMisc[k] = res; return; } // the cloak's bonus, on all three
      var ws = D.saves[k] >= (T.good + T.poor) / 2 ? T.good : T.poor, d = ws - D.saves[k];
      if (d > 0) S.saveMisc[k] = d;
    });
    // hit points
    D = compute();
    var hpGap = T.hp - D.hp;
    if (hpGap > 0) S.hpMisc = classed ? Math.round(hpGap / 2) : hpGap;
    if (classed) {
      var wEnh = S.weapons.filter(function (w) { return w.enh; })[0];
      if (S.armorEnh) gear.push('+' + S.armorEnh + ' ' + S.armor.toLowerCase());
      else if (S.armor) gear.push(S.armor.toLowerCase());
      if (S.shield) gear.push((S.shieldEnh ? '+' + S.shieldEnh + ' ' : '') + S.shield.toLowerCase());
      S.weapons.filter(function (w) { return !/^nat/.test(w.mode) && !w.single && !w.fixed && !w.innate && w.n !== 'unarmed strike'; })
        .forEach(function (w) { gear.push((w.enh ? '+' + w.enh + ' ' : w.mwk ? 'masterwork ' : '') + w.n); });
      if (fists && got.weapon) gear.push('amulet of mighty fists +' + got.weapon);
      if (S.deflection) gear.push('ring of protection +' + S.deflection);
      if (S.natural) gear.push('amulet of natural armor +' + S.natural);
      if (res && !SWM) gear.push('cloak of resistance +' + res);
      gear = gear.concat(potions);
      if (gold >= 1 && gold < Infinity && !SWM) gear.push(Math.floor(gold) + ' gp');
      S.gear = gear.join(', ');
      if (wEnh && SWM) S.gear = S.gear.replace(/\+(\d) (?=\S*(?:lightsaber|rifle|pistol))/gi, 'mod +$1 ');
    }
  }
  function randomButton(cls) {
    return h('button', { type: 'button', class: 'md-button ' + (cls || 'eb-add'), text: 'Random enemy…', title: 'Make a random enemy of the CR you choose (it replaces the current one)', onclick: function () {
      randomForm(makeRandom);
    } });
  }
  // the Random enemy form: CR (required), and if wanted a creature type (a class in Star Wars) and a size
  function randomForm(onOk) {
    var old = document.querySelector('.eb-dialog'); if (old) old.remove();
    var crIn = h('input', { type: 'text', class: 'eb-t', value: S.cr || '1', inputMode: 'decimal', required: true });
    var kindSel = SWM
      ? h('select', { class: 'eb-s' }, [h('option', { value: '', text: 'any class' })].concat(SWD.classes.map(function (c) { return h('option', { value: c.s, text: c.n }); })))
      : h('select', { class: 'eb-s' }, [h('option', { value: '', text: 'any type' })].concat(Object.keys(TYPES).map(function (t) { return h('option', { value: t, text: t }); })));
    var tierIn = h('input', { type: 'number', class: 'eb-t eb-short', value: 0, min: 0, max: 10 });
    var elemSel = MODE === 'chakra' ? h('select', { class: 'eb-s' }, [h('option', { value: '', text: 'any (as its class gives)' }),
      h('optgroup', { label: 'Elements' }, (SWD.elements || []).map(function (e) { return h('option', { value: e, text: e }); })),
      h('optgroup', { label: 'Unique elements (Elemental Bloodline feat)' }, (SWD.extraElements || []).map(function (e) { return h('option', { value: e, text: e }); }))]) : null;
    var clsSel = SWM ? null : h('select', { class: 'eb-s' }, [h('option', { value: '', text: 'any (or none)' }),
      h('optgroup', { label: 'Classes' }, DATA.classes.filter(function (c) { return !c.npc; }).map(function (c) { return h('option', { value: c.s, text: c.n }); })),
      h('optgroup', { label: 'NPC classes' }, DATA.classes.filter(function (c) { return c.npc; }).map(function (c) { return h('option', { value: c.s, text: c.n }); }))]);
    var sizeSel = h('select', { class: 'eb-s' }, [h('option', { value: '', text: 'any size' })].concat(SIZE_ORDER.map(function (s) { return h('option', { value: s, text: s }); })));
    var msg = h('p', { class: 'eb-over' });
    var dlg = h('dialog', { class: 'eb-dialog md-typeset' });
    var form = h('form', { method: 'dialog' },
      h('h3', { text: 'Random enemy' }),
      h('p', { class: 'eb-note', text: 'It replaces the current enemy. Only the CR is needed; leave the rest on “any” for a surprise.' }),
      field('CR', crIn, '1/8, 1/4, 1/2, 1, 2… 30'),
      field(SWM ? 'Class' : 'Creature type', kindSel),
      clsSel ? field('Class', clsSel, 'empty: as the creature type goes') : null,
      elemSel ? field('Element', elemSel, 'empty: as its class gives') : null,
      field('Size', sizeSel),
      field('Mythic tier', tierIn, '0 = not mythic; Unbound Path'),
      msg,
      h('div', { class: 'eb-actions' },
        h('button', { type: 'submit', class: 'md-button md-button--primary', text: 'Make it' }),
        h('button', { type: 'button', class: 'md-button', text: 'Cancel', onclick: function () { dlg.close(); } })));
    form.addEventListener('submit', function (e) {
      var t = crIn.value.trim().replace(/\s+/g, ''), v = crValue(t);
      if (!(v > 0) || v > 30) { e.preventDefault(); msg.textContent = 'That is not a CR: try 1/2, 3 or 12.'; crIn.focus(); return; }
      if (v >= 1) t = String(Math.round(v)); else if (CRS.indexOf(t) < 0) t = ['1/8', '1/6', '1/4', '1/3', '1/2'].reduce(function (b, k) { return Math.abs(crValue(k) - v) < Math.abs(crValue(b) - v) ? k : b; });
      var opts = { size: sizeSel.value || '', tier: Math.max(0, Math.min(10, parseInt(tierIn.value, 10) || 0)) };
      if (elemSel) opts.element = elemSel.value || '';
      if (SWM) opts.cls = kindSel.value || ''; else { opts.type = kindSel.value || ''; opts.cls = clsSel.value || ''; }
      setTimeout(function () { dlg.remove(); onOk(t, opts); }, 0);
    });
    dlg.addEventListener('close', function () { setTimeout(function () { if (dlg.isConnected && !dlg.open) dlg.remove(); }, 0); });
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.showModal(); crIn.select();
  }
  function makeRandom(t, opts) {
    {
      var done = function () { store(); redrawAll(); window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY - 80); };
      RAND_LAST = null; randomEnemy(t, opts);
      // a class whose features are not loaded yet: load them, then build that class again so its bonus feats and bonuses count
      var last = RAND_LAST;
      var need = SWM || !last ? [] : (S.classes || []).map(function (c) { return c.s; }).filter(function (sl) { return CLASS_BY[sl] && CLASS_BY[sl].arch && (!ARCH[sl] || ARCH[sl] === 'loading'); });
      if (need.length) {
        need.forEach(loadArch);
        var wait = setInterval(function () {
          if (need.some(function (sl) { return ARCH[sl] === 'loading'; })) return;
          clearInterval(wait);
          RAND_FORCE = last; try { randomEnemy(t, opts); } finally { RAND_FORCE = null; }
          done();
        }, 50);
      } else done();
    }
  }

  // ---------- UI ----------
  var refreshers = [];
  var timer = null;
  function changed() {
    store();
    clearTimeout(timer);
    timer = setTimeout(refresh, 30);
  }
  function refresh() {
    var D = compute(), m = roll20Data(D);
    refreshers = refreshers.filter(function (f) { return !f.el || f.el.isConnected; });
    refreshers.slice().forEach(function (f) { if (!f.el || f.el.isConnected) f(D, m); });
    root.querySelectorAll('[data-calc]').forEach(function (e) {
      var k = e.getAttribute('data-calc'), v = k.split('.').reduce(function (o, p) { return o == null ? o : o[p]; }, D);
      if (typeof v === 'number') v = k.indexOf('ranks') === 0 || /^(ac|touch|ff|cmd|hp|featSlots|rankPool|ranksUsed|totalHD)$/.test(k) ? v : sgn(v);
      e.textContent = v == null ? '' : v;
    });
    lastD = D;
    window.__enemy = { S: S, D: D, m: m };
  }
  // clears everything for a new enemy (it asks first; saved enemies stay)
  function newEnemyButton(cls) {
    return h('button', { type: 'button', class: 'md-button ' + (cls || 'eb-add'), text: 'New enemy', title: 'Clear every field and start over', onclick: function () {
      if (confirm('Start a new enemy? The current one is lost unless you saved it.')) { S = blank(); store(); redrawAll(); window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY - 80); }
    } });
  }
  function card(title, body, cls, extra) { return h('section', { class: 'eb-card' + (cls ? ' ' + cls : '') }, h('h2', { class: 'eb-h' }, title, extra || null), body); }
  function watch(el, fn) { fn.el = el; refreshers.push(fn); }
  function slot(fn) { var box = h('div'); var draw = function () { box.innerHTML = ''; box.appendChild(fn(draw)); }; draw(); return box; }

  function basics() {
    var types = Object.keys(TYPES);
    var applyType = function (t) { if (!TYPES[t]) return; typeDefaults(t); redrawAll(); };
    return card('Creature', h('div', { class: 'eb-grid' },
      field('Name', textBox(function () { return S.name; }, function (v) { S.name = v; }, { cls: 'eb-wide' })),
      field('CR', crBox(), h('span', { class: 'eb-xp' })),
      field('Alignment', select(ALIGN, function () { return S.align; }, function (v) { S.align = v; })),
      field('Size', select(SIZE_ORDER, function () { return S.size; }, function (v) { S.size = v; })),
      field('Type', select(types, function () { return S.type; }, function (v) { S.type = v; }, applyType)),
      field('Subtypes', textBox(function () { return S.subtypes; }, function (v) { S.subtypes = v; }, { ph: 'goblinoid, fire...' })),
      field('Racial Hit Dice', numBox(function () { return S.hd; }, function (v) { S.hd = v; }, { min: 0, max: 40 }), '0 for a humanoid with class levels'),
      field('Racial hit die', select([[6, 'd6'], [8, 'd8'], [10, 'd10'], [12, 'd12']], function () { return S.die; }, function (v) { S.die = +v; })),
      field('Racial BAB', select([['full', 'Full (HD)'], ['3/4', '3/4 HD'], ['1/2', '1/2 HD']], function () { return S.bab; }, function (v) { S.bab = v; }), h('span', { class: 'eb-out' }, 'BAB ', calc('bab'))),
      field('Racial good saves', h('span', null, ['Fort', 'Ref', 'Will'].map(function (k) { return check(function () { return S.good[k]; }, function (v) { S.good[k] = v; }, k); }))),
      field('Speed', textBox(function () { return S.speed; }, function (v) { S.speed = v; })),
      field('Senses', textBox(function () { return S.senses; }, function (v) { S.senses = v; }, { ph: 'darkvision 60 ft., scent' })),
      field('Languages', textBox(function () { return S.languages; }, function (v) { S.languages = v; })),
      field('Aura', textBox(function () { return S.aura; }, function (v) { S.aura = v; }))
    ), null, h('span', { class: 'eb-head-btns' }, randomButton('eb-head-btn'), newEnemyButton('eb-head-btn')));
  }

  // the class feature choices a Star Wars class gets: "Class Feature N" in its table; at 12th, 16th and 18th they are small
  // each copy of the Extra Class Feature feat gives one more class feature choice (1 Common or 2 Weak)
  function extraCount() { return (S.feats || []).filter(function (f) { return /^extra class feature\b/i.test(String(f).trim()); }).length; }
  function swSlots(d, L) {
    var out = [];
    d.special.slice(0, L).forEach(function (t, i) {
      if (/Class Feature \d+/.test(t)) out.push({ lvl: i + 1, small: /\(Common\)/.test(t), n: +t.match(/Class Feature (\d+)/)[1] });
    });
    return out;
  }
  // the class a listed feature comes from, read from its link target ("…/fighter-archetypes/#x" -> Fighter, "…/darechaser/" -> Darechaser)
  function swSourceClass(link) {
    var seg = String(link || '').split('#')[0].replace(/\.md$/, '').split('/').filter(Boolean).pop() || '';
    seg = seg.replace(/-archetypes$/, '');
    return seg ? seg.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ') : '';
  }
  // every feature a class type can copy, plus the generic ones: [entry], keyed by the text shown in the picker
  function swEntries(key) {
    if (SW_ENTRIES[key]) return SW_ENTRIES[key];
    var by = {};
    SWD.lists[key].forEach(function (e) { by[e[0] + ' — ' + PRICE_LABEL[e[2]] + ', ' + ord(e[3])] = { n: e[0], link: e[1], price: e[2], lvl: e[3], from: swSourceClass(e[1]) }; });
    SWD.generic.forEach(function (g) {
      if (g.levels[key]) by[g.n + ' — ' + PRICE_LABEL[g.price] + ', ' + ord(g.levels[key]) + ' (generic)'] = { n: g.n, link: g.link, price: g.price, lvl: g.levels[key], text: g.text, generic: true };
    });
    return (SW_ENTRIES[key] = by);
  }
  // the search box of a class feature choice: its own list, sorted by level; the features above maxLvl go last, in grey, with their level
  function swPicker(by, maxLvl, priceOf, placeholder, pick) {
    var input = h('input', { type: 'text', class: 'eb-t eb-wide', placeholder: placeholder, autocomplete: 'off' });
    var list = h('div', { class: 'eb-picklist', hidden: true });
    var cur = -1, shown = [];
    var mark = function () { Array.prototype.forEach.call(list.children, function (o, i) { o.classList.toggle('eb-on', i === cur); }); if (list.children[cur]) list.children[cur].scrollIntoView({ block: 'nearest' }); };
    var render = function () {
      var q = input.value.trim().toLowerCase(), p = priceOf();
      shown = Object.keys(by).filter(function (n) { return (p === 'all' || by[n].price === p) && (!q || (n + ' ' + (by[n].from || '')).toLowerCase().indexOf(q) >= 0); });
      shown.sort(function (a, b) {
        var A = by[a], B = by[b];
        return ((A.lvl > maxLvl) - (B.lvl > maxLvl)) || A.lvl - B.lvl || a.localeCompare(b);
      });
      list.innerHTML = ''; cur = -1;
      shown.forEach(function (n) {
        var e = by[n], hi = e.lvl > maxLvl;
        list.appendChild(h('div', { class: 'eb-pickopt' + (hi ? ' eb-higher' : ''), title: hi ? 'A feature of ' + ord(e.lvl) + ' level, above this choice' : '',
          onmousedown: function (ev) { ev.preventDefault(); pick(e); } }, n, e.from ? h('small', { text: ' · ' + e.from }) : null, hi ? h('small', { text: ' · level ' + e.lvl }) : null));
      });
      list.hidden = !shown.length;
    };
    input.addEventListener('focus', render);
    input.addEventListener('blur', function () { list.hidden = true; });
    input.addEventListener('input', function () { if (by[input.value]) pick(by[input.value]); else render(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault(); if (list.hidden) render();
        if (shown.length) { cur = (cur + (ev.key === 'ArrowDown' ? 1 : shown.length - 1) + (cur < 0 && ev.key === 'ArrowUp' ? 1 : 0)) % shown.length; mark(); }
      } else if (ev.key === 'Enter') {
        var n = cur >= 0 ? shown[cur] : by[input.value] ? input.value : shown.length === 1 ? shown[0] : null;
        if (n) { ev.preventDefault(); pick(by[n]); }
      } else if (ev.key === 'Escape') list.hidden = true;
    });
    return { input: input, render: render, el: h('span', { class: 'eb-pick' }, input, list) };
  }
  function swCard() {
    return card((MODE === 'starwars' ? 'Star Wars' : MODE === 'chakra' ? 'Shinobi' : 'Hero') + ' class', slot(function (redraw) {
      var D = compute();
      var c = (S.classes || []).filter(function (x) { return CLASS_BY[x.s] && CLASS_BY[x.s].sw; })[0];
      var d = c && CLASS_BY[c.s];
      var pick = select([['', SUB.noClass]].concat(SWD.classes.map(function (x) { return ['sw-' + x.s, x.n]; })),
        function () { return c ? c.s : ''; }, function (v) {
          if (!v) S.classes = [];
          else if (c) { if (c.s !== v) { c.s = v; c.picks = []; c.choices = {}; } }
          else { S.classes = [{ s: v, lvl: 1, picks: [] }]; if (S.hd === 1 && S.type === 'humanoid') S.hd = 0; }
        }, function () { redrawAll(); });
      var head = h('div', { class: 'eb-grid' },
        field('Class', pick),
        c ? field('Level', numBox(function () { return c.lvl; }, function (v) { c.lvl = v; }, { min: 1, max: 20 })) : null,
        !SUB.force ? null : field('Force Sensitive', d && d.role === 'caster' ? h('span', { class: 'eb-note', text: 'free (' + d.n + ')' }) : check(function () { return S.sw.force; }, function (v) { S.sw.force = v; }, 'feat')),
        field(capFirst(SUB.res) + ' / casting ability', select(['Wis', 'Int', 'Cha'], function () { return S.sw.abil; }, function (v) { S.sw.abil = v; })),
        !SUB.karma ? null : field('Karma', numBox(function () { return S.sw.karma || 0; }, function (v) { S.sw.karma = v; }, { min: -100, max: 100 }), '–100 dark side · +100 light side'));
      var info = h('p', { class: 'eb-out' });
      watch(info, function (D2) {
        var parts = [];
        if (D2.sw.cls) {
          var picked = SKILLS.filter(function (sk) { return (S.skills[sk[0]] || {}).cls; }).length;
          parts.push('d' + D2.sw.cls.die + ' HD · ' + SUB.res + ' ' + D2.sw.stamina + ' (' + D2.sw.cls.stamina + ' + ' + S.sw.abil + ' per level) · ' + D2.sw.cls.ranks + ' + Int ranks per level · class skills: tick ' + D2.sw.cls.picks + ' (' + picked + ' ticked)');
        }
        if (D2.sw.fsDodge) parts.push('Force Sensitive: +' + D2.sw.fsDodge + ' dodge AC');
        var k = D2.sw.karma;
        if (S.sw.karma) parts.push('karma: ' + [k.cl ? 'CL +' + k.cl : '', k.dc ? 'power DC ' + sgn(k.dc) : '', k.will ? 'Will ' + sgn(k.will) : '', k.cha ? 'Cha checks ' + sgn(k.cha) : '', k.intim ? 'Intimidate +' + k.intim : ''].filter(Boolean).join(', '));
        info.textContent = parts.join('  ·  ');
      });
      var body = [head, info];
      if (c) {
        var slots = swSlots(d, c.lvl), by = swEntries(d.key);
        c.picks = c.picks || [];
        var all = c.picks.filter(function (p) { return p.slot <= c.lvl && !(p.extra && p.extra > extraCount()); });
        var iconic = all.filter(function (p) { return p.price === 'iconic'; }).length;
        var opLow = all.filter(function (p) { return p.price === 'op' && p.slot <= 10; }).length, opHigh = all.filter(function (p) { return p.price === 'op' && p.slot >= 11; }).length;
        var limits = [];
        if (iconic > 1) limits.push('only 1 Iconic class feature');
        if (opLow > 1) limits.push('only 1 OP chosen at levels 1–10');
        if (opHigh > 1) limits.push('only 1 OP chosen at levels 11–20');
        body.push(h('div', { class: 'eb-slots' }, slots.map(function (sl) {
          var mine = c.picks.filter(function (p) { return p.slot === sl.lvl && !p.extra; });
          var pts = mine.reduce(function (t, p) { return t + PRICE_PTS[p.price]; }, 0), cap = sl.small ? 2 : 4;
          var big = mine.some(function (p) { return p.price === 'op' || p.price === 'iconic'; });
          var higher = mine.filter(function (p) { return p.lvl > sl.lvl; });
          var bad = pts > cap || (big && mine.length > 1) || (sl.small && big) || higher.length > 0;
          var msg = h('small', { class: 'eb-over' });
          var priceSel = h('select', { class: 'eb-s' }, [['all', 'any price'], ['iconic', 'Iconic'], ['op', 'OP'], ['common', 'Common'], ['weak', 'Weak']]
            .filter(function (o) { return !sl.small || !/iconic|op/.test(o[0]); }).map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
          var picker = swPicker(by, sl.lvl, function () { return priceSel.value; }, 'type to search the ' + d.n + ' list…', function (e) {
            if (sl.small && (e.price === 'op' || e.price === 'iconic')) { msg.textContent = 'At ' + ord(sl.lvl) + ' level the choice is only 1 Common or 2 Weak.'; return; }
            c.picks.push({ slot: sl.lvl, n: e.n, link: e.link, price: e.price, lvl: e.lvl, text: e.text || '' });
            picker.input.value = ''; changed(); redraw();
            var again = root.querySelector('.eb-slot[data-slot="' + sl.lvl + '"] input'); if (again) again.focus();
          });
          priceSel.addEventListener('change', function () { picker.input.focus(); picker.render(); });
          return h('div', { class: 'eb-slot' + (bad ? ' eb-bad' : ''), 'data-slot': sl.lvl },
            h('div', { class: 'eb-slothead' }, h('b', { text: ord(sl.lvl) + ' level' }), ' · Class Feature ' + sl.n + (sl.small ? ' (1 Common or 2 Weak)' : '') + ' · ',
              h('span', { class: bad ? 'eb-over' : '', text: pts + '/' + cap + ' points' })),
            h('div', { class: 'eb-chips' }, mine.map(function (p) {
              var fx = D.features.filter(function (x) { return x.sw && x.name === p.n && x.lvl === p.slot; })[0];
              return h('span', { class: 'eb-chip eb-' + p.price, title: fx ? (fx.label || p.n) + '\n\n' + (fx.note ? 'In the numbers: ' + fx.note + '.\n\n' : '') + fx.text : p.n },
                h('a', { href: new URL(p.link, BASE).href, target: '_blank', text: fx && fx.label || p.n }), ' ', h('small', { text: PRICE_LABEL[p.price] }),
                fx && fx.note ? h('small', { class: 'eb-fx', text: ' · ' + fx.note }) : null,
                h('button', { type: 'button', class: 'eb-x', text: '×', onclick: function () { c.picks.splice(c.picks.indexOf(p), 1); changed(); redraw(); } }));
            })),
            pts < cap ? h('div', { class: 'eb-inline' }, priceSel, picker.el) : null,
            higher.length ? h('small', { class: 'eb-over', text: 'Feature above the level of this choice: ' + higher.map(function (p) { return p.n + ' (' + ord(p.lvl) + ')'; }).join(', ') + '. The GM decides if it stays.' }) : null,
            msg);
        })));
        var cboxes = D.features.filter(function (x) { return x.sw && x.choice && x.cls === c; }).map(function (x) { return choiceBox(x, redraw); });
        if (cboxes.length) body.push(h('div', { class: 'eb-slots' }, cboxes));
        var nExtra = extraCount();
        for (var xi = 1; xi <= nExtra; xi++) (function (xi) {
          var mineX = c.picks.filter(function (p) { return p.extra === xi; });
          var ptsX = mineX.reduce(function (t, p) { return t + PRICE_PTS[p.price]; }, 0);
          var msgX = h('small', { class: 'eb-over' });
          var priceX = h('select', { class: 'eb-s' }, [['common', 'Common'], ['weak', 'Weak']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
          var pickerX = swPicker(by, c.lvl, function () { return priceX.value; }, 'type to search the ' + d.n + ' list…', function (e) {
            if (e.price === 'op' || e.price === 'iconic') { msgX.textContent = 'Extra Class Feature gives only 1 Common or 2 Weak.'; return; }
            c.picks.push({ slot: 1, extra: xi, n: e.n, link: e.link, price: e.price, lvl: e.lvl, text: e.text || '' });
            pickerX.input.value = ''; changed(); redraw();
          });
          priceX.addEventListener('change', function () { pickerX.input.focus(); pickerX.render(); });
          body.push(h('div', { class: 'eb-slot' + (ptsX > 2 ? ' eb-bad' : '') },
            h('div', { class: 'eb-slothead' }, h('b', { text: 'Extra Class Feature' + (nExtra > 1 ? ' ' + xi : '') }), ' · feat (1 Common or 2 Weak) · ', h('span', { class: ptsX > 2 ? 'eb-over' : '', text: ptsX + '/2 points' })),
            h('div', { class: 'eb-chips' }, mineX.map(function (p) {
              return h('span', { class: 'eb-chip eb-' + p.price, title: p.n }, h('a', { href: new URL(p.link, BASE).href, target: '_blank', text: p.n }), ' ', h('small', { text: PRICE_LABEL[p.price] }),
                h('button', { type: 'button', class: 'eb-x', text: '×', onclick: function () { c.picks.splice(c.picks.indexOf(p), 1); changed(); redraw(); } }));
            })),
            ptsX < 2 ? h('div', { class: 'eb-inline' }, priceX, pickerX.el) : null, msgX));
        })(xi);
        if (limits.length) body.push(h('p', { class: 'eb-over', text: 'Over the limit: ' + limits.join('; ') + '.' }));
        if (c.lvl >= 20) body.push(h('p', { class: 'eb-note', text: 'Capstone at 20th level: agree it with the GM and add it under Special abilities.' }));
        body.push(h('p', { class: 'eb-note', text: 'Each choice: 1 Iconic, 1 OP, 2 Common or 4 Weak (Iconic and OP are 4 points, Common 2, Weak 1). From 12th level, the choices at 12th, 16th and 18th are 1 Common or 2 Weak. At most 1 Iconic, 1 OP chosen at levels 1–10 and 1 OP chosen at 11–20. A feature can be taken at its own level or later: the list shows them by level, and the ones above the choice go last, in grey; you can still pick one, the choice turns red and the GM decides. Filter by price, then type a name. Each feature brings its text from its page and grows with your level as in its class table (a prestige class feature, with your level less 3); the ones that change the numbers say how in color and are already in the stat block. Modes you turn on, such as rage, go in by hand.' }));
      }
      var box = h('div', null, body);
      var sig = c ? c.lvl + c.s + '|' + extraCount() : '';
      watch(box, function () { var c2 = (S.classes || []).filter(function (x) { return CLASS_BY[x.s] && CLASS_BY[x.s].sw; })[0]; if ((c2 ? c2.lvl + c2.s + '|' + extraCount() : '') !== sig) setTimeout(redrawAll, 0); });
      return box;
    }), 'eb-classes');
  }
  function classesCard() {
    return card('Classes', slot(function () {
      var D = compute();
      var opts = function () {
        return [h('option', { value: '', text: '— pick a class —' }),
          h('optgroup', { label: 'Classes' }, DATA.classes.filter(function (c) { return !c.npc; }).map(function (c) { return h('option', { value: c.s, text: c.n }); })),
          h('optgroup', { label: 'NPC classes' }, DATA.classes.filter(function (c) { return c.npc; }).map(function (c) { return h('option', { value: c.s, text: c.n }); }))];
      };
      var rows = S.classes.map(function (c, i) {
        var d = CLASS_BY[c.s], A = d && ARCH[c.s];
        var pick = h('select', { class: 'eb-s' }, opts());
        pick.value = c.s || '';
        pick.addEventListener('change', function () {
          c.s = pick.value; c.arch = []; c.off = []; c.choices = {};
          // a humanoid with class levels has no racial Hit Dice
          if (CLASS_BY[c.s] && S.classes.length === 1 && S.hd === 1 && S.type === 'humanoid') S.hd = 0;
          loadArch(c.s); changed(); redrawAll();
        });
        var archSel = null;
        if (A && A !== 'loading' && A.archetypes.length) {
          archSel = h('select', { class: 'eb-s' }, [h('option', { value: '', text: '+ archetype…' })].concat(A.archetypes.filter(function (a) { return (c.arch || []).indexOf(a.name) < 0; })
            .map(function (a) { return h('option', { value: a.name, text: a.name }); })));
          archSel.addEventListener('change', function () { if (archSel.value) { (c.arch = c.arch || []).push(archSel.value); changed(); redrawAll(); } });
        }
        var chips = (c.arch || []).map(function (n, j) {
          return h('span', { class: 'eb-chip' }, n, h('button', { type: 'button', class: 'eb-x', text: '×', onclick: function () { c.arch.splice(j, 1); changed(); redrawAll(); } }));
        });
        var feats = D.features.filter(function (x) { return x.cls === c; });
        var boxes = feats.filter(function (x) { return x.choice && x.on; }).map(function (x) { return choiceBox(x, redrawClasses); });
        var flist = h('div', { class: 'eb-features' }, feats.filter(function (x) { return !x.picked; }).map(function (x) {
          return h('label', { class: 'eb-feature' + (x.arch ? ' eb-arch' : ''), title: (x.note ? 'In the numbers: ' + x.note + '.\n\n' : '') + x.text },
            h('input', { type: 'checkbox', checked: x.on, onchange: function (e) {
              c.off = (c.off || []).filter(function (n) { return n !== x.name; }); if (!e.target.checked) c.off.push(x.name); changed();
            } }),
            h('small', { text: x.lvl + ' ' }), (x.label || x.name) + (x.type ? ' (' + x.type + ')' : '') + ' ',
            x.note ? h('small', { class: 'eb-fx', text: x.note + ' ' }) : null,
            h('a', { href: new URL(x.link, BASE).href, target: '_blank', text: '↗', onclick: function (e) { e.stopPropagation(); } }));
        }));
        return h('div', { class: 'eb-classrow' },
          h('div', { class: 'eb-grid' },
            field('Class', pick),
            field('Level', numBox(function () { return c.lvl; }, function (v) { c.lvl = v; }, { min: 1, max: 20 })),
            archSel ? field('Archetypes', archSel) : null,
            chips.length ? h('span', { class: 'eb-chips' }, chips) : null,
            d ? h('small', { class: 'eb-note', text: 'd' + d.die + ', ' + d.ranks + ' + Int ranks per level' }) : null,
            h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Remove class', onclick: function () { S.classes.splice(i, 1); changed(); redrawAll(); } })),
          A === 'loading' ? h('p', { class: 'eb-note', text: 'Loading class features…' }) : feats.length ? flist : null,
          boxes.length ? h('div', { class: 'eb-slots' }, boxes) : null);
      });
      var box = h('div', null, rows,
        h('button', { type: 'button', class: 'md-button eb-add', text: '+ Class', onclick: function () { S.classes.push({ s: '', lvl: 1, arch: [], off: [] }); changed(); redrawAll(); } }),
        h('p', { class: 'eb-out' }, 'Total Hit Dice ', calc('totalHD'), ' · BAB ', calc('bab'), ' · Fort ', calc('saves.Fort'), ' Ref ', calc('saves.Ref'), ' Will ', calc('saves.Will')),
        h('p', { class: 'eb-note', text: 'No class: a plain monster, from its type. With a class, its table gives Hit Dice, BAB, saves, skill ranks, class skills and class features; racial Hit Dice add on top (a bugbear fighter: 3 racial HD + fighter levels). Untick a feature to leave it out of the stat block; hover it for its text. Features that change the numbers (armor and weapon training, AC bonus, Divine Grace, fast movement, damage reduction...) say how in color and are already in the stat block; modes you turn on, such as rage, go in by hand.' }));
      // the feature list changes with the level: draw it again then
      var sig = JSON.stringify(D.features.map(function (x) { return x.name; }));
      watch(box, function (D2) { if (JSON.stringify(D2.features.map(function (x) { return x.name; })) !== sig) setTimeout(redrawClasses, 0); });
      return box;
    }), 'eb-classes');
  }
  function redrawClasses() {
    var old = root.querySelector('.eb-classes'); if (!old) return;
    var focused = document.activeElement, inOld = old.contains(focused);
    old.replaceWith(classesCard()); refresh();
    if (inOld) { var n = root.querySelector('.eb-classes .eb-n'); if (n) n.focus(); }
  }
  // the race: one of the wiki's (its modifiers, size, speed, type and subtypes, all still editable), a custom one (its six
  // modifiers; size, speed and subtypes are the Creature card's) or none. Its modifiers add to the scores below.
  function raceRow() {
    var list = raceList();
    if (!list.length) return null;
    var custom = S.race && S.race.n === 'custom', r = S.race && !custom ? raceData(S.race.n) : null;
    var txt = function (x) {
      var p = ABIL.filter(function (a) { return x.adj[a]; }).map(function (a) { return sgn(x.adj[a]) + ' ' + a; });
      if (x.any) p.unshift('+' + x.any.v + ' to ' + (x.any.from ? x.any.from.join('/') : 'one'));
      return p.join(', ');
    };
    var opts = [['custom', 'Custom race'], ['', '— none —']].concat(list.map(function (x) { return [x.n, x.n + ' (' + txt(x) + ')']; }));
    var row = [field('Race', select(opts, function () { return S.race ? S.race.n : ''; }, applyRace, redrawAll),
      r ? h('small', null, 'Sets size, speed, type and subtypes. ', h('a', { href: new URL(r.u, BASE).href, target: '_blank', text: 'Its other racial traits' })) :
        custom ? 'Size, speed and subtypes: in the Creature card' : 'Its ability modifiers add to the scores')];
    if (r && r.any) row.push(field('+' + r.any.v + ' to', select(r.any.from || ABIL, function () { return S.race.any || ''; },
      function (v) { S.race.any = v; S.race.adj = raceMods(r, v); })));
    var boxes = custom ? h('div', { class: 'eb-abils' }, ABIL.map(function (a) {
      return h('div', { class: 'eb-abil' }, h('b', { text: a }),
        numBox(function () { return S.race.adj[a] || 0; }, function (v) { S.race.adj[a] = v; }, { min: -10, max: 10 }));
    })) : null;
    return h('div', null, h('div', { class: 'eb-grid' }, row), boxes);
  }
  function abilities() {
    return card('Ability scores', slot(function () {
      var rows = ABIL.map(function (a) {
        var dead = a === 'Con' && (S.type === 'undead' || S.type === 'construct');
        return h('div', { class: 'eb-abil' + (dead ? ' eb-off' : '') }, h('b', { text: a }),
          numBox(function () { return S.abil[a]; }, function (v) { S.abil[a] = v; }, { min: 0, max: 60 }),
          h('span', { class: 'eb-race', 'data-race': a }),
          h('span', { class: 'eb-mod', 'data-abil': a }));
      });
      var cost = h('p', { class: 'eb-note' });
      refreshers.push(function (D) {
        root.querySelectorAll('[data-race]').forEach(function (e) { var a = e.getAttribute('data-race'), r = raceAdj(a); e.textContent = r ? sgn(r) + ' = ' + score(a) : ''; });
        root.querySelectorAll('[data-abil]').forEach(function (e) { var a = e.getAttribute('data-abil'); e.textContent = sgn(mod(score(a))); });
        var total = 0, ok = true;
        ABIL.forEach(function (a) { var c = POINT_COST[S.abil[a]]; if (c == null) ok = false; else total += c; });
        cost.textContent = ok ? 'Point buy: ' + total + ' points (15 low fantasy · 20 standard · 25 high)' : 'Point buy: some scores are outside 7–18';
      });
      return h('div', null, raceRow(), h('div', { class: 'eb-abils' }, rows), cost,
        h('p', { class: 'eb-note', text: 'Click − / +, type the number, or click it and roll the mouse wheel while the pointer stays on it (Shift + wheel: 5 at a time); otherwise the wheel just scrolls the page.' }));
    }));
  }

  function defense() {
    var armors = [['', 'none']].concat(DATA.armors.filter(function (a) { return a.k !== 'shield'; }).map(function (a) { return [a.n, a.n + ' (+' + a.b + ', ' + a.k + ')']; }));
    var shields = [['', 'none']].concat(DATA.armors.filter(function (a) { return a.k === 'shield'; }).map(function (a) { return [a.n, a.n + ' (+' + a.b + ')']; }));
    return card('Defense', h('div', null,
      h('div', { class: 'eb-grid' },
        field('Armor', select(armors, function () { return S.armor; }, function (v) { S.armor = v; })),
        field('Armor +', numBox(function () { return S.armorEnh; }, function (v) { S.armorEnh = v; }, { min: 0, max: 5 })),
        field('Shield', select(shields, function () { return S.shield; }, function (v) { S.shield = v; })),
        field('Shield +', numBox(function () { return S.shieldEnh; }, function (v) { S.shieldEnh = v; }, { min: 0, max: 5 })),
        field('Natural armor', numBox(function () { return S.natural; }, function (v) { S.natural = v; }, { min: 0, max: 60 })),
        field('Deflection', numBox(function () { return S.deflection; }, function (v) { S.deflection = v; }, { min: 0, max: 20 })),
        field('Dodge / other', numBox(function () { return S.dodge; }, function (v) { S.dodge = v; }, { min: -10, max: 20 })),
        field('Max hp', check(function () { return S.maxHp !== false; }, function (v) { S.maxHp = v; }), 'every Hit Die at its maximum'),
        field('Extra hp', numBox(function () { return S.hpMisc; }, function (v) { S.hpMisc = v; }, { min: -999, max: 999 }), 'on top of HD, Con and Toughness'),
        field('Fort misc', numBox(function () { return S.saveMisc.Fort; }, function (v) { S.saveMisc.Fort = v; })),
        field('Ref misc', numBox(function () { return S.saveMisc.Ref; }, function (v) { S.saveMisc.Ref = v; })),
        field('Will misc', numBox(function () { return S.saveMisc.Will; }, function (v) { S.saveMisc.Will = v; })),
        field('Init misc', numBox(function () { return S.initMisc; }, function (v) { S.initMisc = v; }))),
      field('DR, immunities, resistances, SR, weaknesses', textBox(function () { return S.defense; }, function (v) { S.defense = v; }, { ph: 'DR 5/magic; Immune fire; SR 15', cls: 'eb-full' })),
      h('p', { class: 'eb-out' }, h('b', { text: 'AC ' }), calc('acText'), h('br'), h('b', { text: 'hp ' }), calc('hpText'), h('br'),
        h('b', { text: 'Fort ' }), calc('saves.Fort'), ', ', h('b', { text: 'Ref ' }), calc('saves.Ref'), ', ', h('b', { text: 'Will ' }), calc('saves.Will'),
        '; ', h('b', { text: 'Init ' }), calc('init'), '; ', h('b', { text: 'CMB ' }), calc('cmb'), '; ', h('b', { text: 'CMD ' }), calc('cmd'))
    ));
  }

  function skills() {
    return card('Skills', h('div', null,
      h('div', { class: 'eb-grid' },
        field('Racial ranks per HD', numBox(function () { return S.ranks; }, function (v) { S.ranks = v; }, { min: 0, max: 12 }), '+ Int modifier, set by type'),
        field('Bonus ranks', numBox(function () { return S.bonusRanks; }, function (v) { S.bonusRanks = v; }, { min: -99, max: 999 })),
        h('p', { class: 'eb-out eb-ranks' }, 'Ranks used ', calc('ranksUsed'), ' / ', calc('rankPool'))),
      h('div', { class: 'eb-sklegend' }, h('span', { text: 'Skill' }), h('span', { text: 'Class' }), h('span', { text: 'Ranks' }), h('span', { text: 'Misc' }), h('span', { text: 'Total' })),
      h('div', { class: 'eb-skillgrid' }, SKILLS.map(function (sk) {
        var n = sk[0], st = function () { return S.skills[n] || (S.skills[n] = {}); };
        var label = (SWM && SW_SKILL[n]) || n.replace(/^Knowledge \((.*)\)$/, 'Know. ($1)');
        return h('div', { class: 'eb-sk', 'data-skill': n, title: n + ' (' + sk[1] + ')' },
          h('span', { class: 'eb-skn', text: label }),
          check(function () { return st().cls; }, function (v) { st().cls = v; }),
          numBox(function () { return st().r || 0; }, function (v) { st().r = v; }, { min: 0, max: function () { return lastD ? lastD.totalHD : Math.max(1, S.hd); } }),
          numBox(function () { return st().misc || 0; }, function (v) { st().misc = v; }, { min: -20, max: 40 }),
          calc('skills.' + n + '.disp'));
      })),
      h('p', { class: 'eb-note', text: 'Class: +3 once it has a rank. Misc: racial and other bonuses. Size and armor check penalties are added. Only skills with ranks or misc go in the stat block.' })
    ));
  }
  refreshers.push(function (D) {
    root.querySelectorAll('.eb-sk[data-skill]').forEach(function (tr) {
      var cb = tr.querySelector('input[type=checkbox]'), sn = tr.getAttribute('data-skill'), fromClass = !!D.classSkill[sn];
      cb.disabled = fromClass; cb.checked = fromClass || !!(S.skills[sn] || {}).cls; cb.title = fromClass ? 'a class skill of its class' : ''; tr.classList.toggle('eb-used', D.skills[tr.getAttribute('data-skill')].shown); });
    var r = root.querySelector('.eb-ranks'); if (r) r.classList.toggle('eb-over', D.ranksUsed > D.rankPool);
  });

  function feats() {
    return card('Feats', slot(function (redraw) {
      var D = compute(), n = Math.max(D.featSlots, S.feats.length);
      var list = h('div', { class: 'eb-feats' });
      watch(list, function (D2) { if (D2.featSlots !== D.featSlots) redraw(); });
      for (var i = 0; i < n; i++) (function (i) {
        var over = i >= D.featSlots;
        var info = h('span', { class: 'eb-featinfo' });
        var input = textBox(function () { return S.feats[i] || ''; }, function (v) { S.feats[i] = v; }, { list: 'eb-feat-list', ph: 'feat ' + (i + 1), after: function () { paint(); } });
        var paint = function () {
          var v = (S.feats[i] || '').trim(), fd = v && featData(v), u = fd && fd.u, auto = compute().auto[v.toLowerCase()];
          if (fd && fd.gone) auto = 'no longer a feat: it is part of ' + fd.gone;
          info.innerHTML = (u ? '<a href="' + esc(new URL(u.indexOf('/') >= 0 ? u : 'rules/feats/' + u + '/', BASE).href) + '" target="_blank">↗</a> ' : '') + (auto ? '<span class="eb-auto">' + esc(auto) + '</span>' : '');
        };
        paint();
        list.appendChild(h('div', { class: 'eb-feat' + (over ? ' eb-over' : '') }, input, info,
          over ? h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Remove', onclick: function () { S.feats.splice(i, 1); changed(); redraw(); } }) : null));
      })(i);
      return h('div', null,
        h('div', { class: 'eb-grid' },
          h('p', { class: 'eb-out' }, 'Feats: ', calc('featSlots'), ' (one at 1st Hit Die and every odd one after' + (D.classBonusFeats ? ', +' + D.classBonusFeats + ' class bonus feats' : '') + ')'),
          field('Bonus feats', numBox(function () { return S.bonusFeats; }, function (v) { S.bonusFeats = v; redraw(); }, { min: 0, max: 30 }))),
        list,
        h('button', { type: 'button', class: 'md-button eb-add', text: '+ Extra feat', onclick: function () { S.feats.length = Math.max(S.feats.length, n); S.feats.push(''); changed(); redraw(); } }),
        h('p', { class: 'eb-note', text: 'Worked out for you: Improved Initiative, Toughness, the save feats, Dodge / Dodgility, Weapon Finesse, Weapon Focus (a weapon group, as the wiki has it: +1 BAB with that group, extra attacks included; pick it from the list, such as Weapon Focus (natural)), Greater Weapon Focus, Weapon Specialization, Improved Critical (these three by weapon), Skill Focus, Alertness, Improved Natural Armor, Two-Weapon Fighting, Double Slice, Multiattack, Rapid Shot, Spell Focus and Greater Spell Focus (by school) and Spell Specialization (by spell). Power Attack and Deadly Aim need no feat on this wiki: set them as a Buff on the Roll20 sheet.' }));
    }));
  }

  function attacks() {
    return card('Attacks', slot(function (redraw) {
      var rows = S.weapons.map(function (w, i) {
        var out = h('div', { class: 'eb-atkout' });
        watch(out, function (D) {
          var a = D.attacks[i]; if (!a || a.row !== w) return;
          var g = D.groups[a.ranged ? 'ranged' : 'melee'], line = '';
          g.forEach(function (grp) { grp.forEach(function (x, j) { if (x.name === a.name && !line) line = atkText([x]); }); });
          out.textContent = line + (S.size !== 'Medium' && a.dice !== w.d ? '  ·  ' + w.d + ' Medium → ' + a.dice + ' ' + S.size : '');
        });
        var fill = function (v) {
          var n = v.trim().toLowerCase(), d = weaponData(n), nat = NATURAL[n];
          if (d) { w.d = d.d; w.t = d.t; w.x = d.x; w.cat = d.c; w.mode = d.c === 'ranged' ? 'ranged' : d.c === 'two-handed' ? 'two' : 'melee'; w.strDmg = d.p !== 'blaster' && (/sling|throw/i.test(d.n) || (d.c === 'ranged' && !/bow|crossbow|gun|pistol|musket|rifle|firearm/i.test(d.n))); }
          else if (nat) { w.d = nat[0]; w.t = 20; w.x = 2; w.cat = 'natural'; w.mode = nat[1] ? 'nat2' : 'nat1'; }
          else return;
          changed(); redraw();
          var again = root.querySelector('[data-wname="' + i + '"]');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        };
        var critBox = textBox(function () { return (w.t < 20 ? w.t + '-20/' : '') + 'x' + (w.x || 2); }, function (v) {
          var m = v.replace(/×/g, 'x').match(/(?:(\d+)\s*-\s*20)?\s*\/?\s*x?(\d)?/); if (!m) return;
          w.t = m[1] ? +m[1] : 20; if (m[2]) w.x = +m[2];
        }, { cls: 'eb-short' });
        return h('div', { class: 'eb-atk' },
          h('div', { class: 'eb-grid' },
            field('Weapon or natural attack', (function () { var t = textBox(function () { return w.n; }, function (v) { w.n = v; }, { list: 'eb-weapon-list', after: fill }); t.setAttribute('data-wname', i); return t; })()),
            field('Use', select([['melee', 'Melee, one hand'], ['two', 'Melee, two hands'], ['off', 'Off hand'], ['ranged', 'Ranged'], ['thrown', 'Thrown'],
              ['nat1', 'Natural, primary'], ['nat2', 'Natural, secondary']], function () { return w.mode; }, function (v) { w.mode = v; }, redraw)),
            field('Enhancement', numBox(function () { return w.enh || 0; }, function (v) { w.enh = v; }, { min: 0, max: 5 })),
            /^nat/.test(w.mode) ? field('How many', numBox(function () { return w.count || 1; }, function (v) { w.count = v; }, { min: 1, max: 12 })) :
              field('Masterwork', check(function () { return w.mwk; }, function (v) { w.mwk = v; })),
            field('Damage (Medium)', textBox(function () { return w.d; }, function (v) { w.d = v.trim(); }, { cls: 'eb-short' })),
            field('Critical', critBox),
            w.mode === 'ranged' ? field('Str to damage', check(function () { return w.strDmg; }, function (v) { w.strDmg = v; })) : null,
            /^(melee|off|two)$/.test(w.mode) ? field('Finesse', check(function () { return w.finesse; }, function (v) { w.finesse = v; }), 'Dex to attack') : null,
            field('Damage with', select([['', 'Auto'], ['Str', 'Strength'], ['Dex', 'Dexterity'], ['Con', 'Constitution'], ['Int', 'Intelligence'], ['Wis', 'Wisdom'], ['Cha', 'Charisma'], ['none', 'None']],
              function () { return w.dmgAbil || ''; }, function (v) { if (v) w.dmgAbil = v; else delete w.dmgAbil; }), 'Auto: Str, or Dex with Weapon Finesse'),
            field('Attack misc', numBox(function () { return w.misc || 0; }, function (v) { w.misc = v; }, { min: -20, max: 20 })),
            field('Damage misc', numBox(function () { return w.dmgMisc || 0; }, function (v) { w.dmgMisc = v; }, { min: -20, max: 40 })),
            field('Option', select([[1, '1'], [2, '2 (or)'], [3, '3 (or)']], function () { return w.opt || 1; }, function (v) { w.opt = +v; }), 'same number = full attack together'),
            field('Extra effect', textBox(function () { return w.rider; }, function (v) { w.rider = v; }, { ph: 'plus grab, plus 1d6 fire' })),
            h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Remove', onclick: function () { S.weapons.splice(i, 1); changed(); redrawAll(); } })),
          out);
      });
      return h('div', null, rows.length ? rows : h('p', { class: 'eb-note', text: 'No attacks yet.' }),
        h('button', { type: 'button', class: 'md-button eb-add', text: '+ Attack', onclick: function () { S.weapons.push({ n: '', mode: 'melee', d: '1d4', t: 20, x: 2, opt: 1 }); changed(); redrawAll(); } }),
        h('p', { class: 'eb-note', text: 'Pick a weapon from the wiki\'s tables (or bite, claw, gore, slam...) and its damage and critical fill in; damage scales with size by itself. Iterative attacks come from BAB. Natural attacks beside weapons count as secondary.' }),
        field('Special attacks', textBox(function () { return S.specialAttacks; }, function (v) { S.specialAttacks = v; }, { ph: 'breath weapon (30-ft. cone, 6d6 fire, DC 15), channel negative energy 3d6 (DC 13)', cls: 'eb-full' })));
    }));
  }

  // Force powers known by level, against the class table
  function knownLine(c) {
    var p = h('p', { class: 'eb-note' });
    watch(p, function (D) {
      if (!D.sw || !D.sw.cls) { p.textContent = 'Pick a class to see how many powers of each level it knows.'; return; }
      var have = {}; c.spells.forEach(function (x) { have[x.lvl] = (have[x.lvl] || 0) + 1; });
      p.innerHTML = 'Known at ' + ord(D.sw.lvl) + ' level: ' + D.sw.known.map(function (n, i) {
        if (!n && !have[i]) return '';
        var over = (have[i] || 0) > n;
        return '<span class="' + (over ? 'eb-over' : '') + '">' + (i ? ord(i) : '0th') + ' ' + (have[i] || 0) + '/' + n + '</span>';
      }).filter(Boolean).join(' · ') + ' · ' + SUB.res + ' ' + D.sw.stamina;
    });
    return p;
  }
  function spells() {
    var classes = [['', 'any class']].concat(CLASSES.map(function (c) { return [c, c]; }));
    return card(SWM ? SUB.powers + ' and spells' : 'Spells', slot(function (redraw) {
      var blocks = S.casters.map(function (c, ci) {
        var list = h('div', { class: 'eb-spells' });
        var drawList = function () {
          list.innerHTML = '';
          var sorted = c.spells.map(function (s, i) { return [s, i]; }).sort(function (a, b) { return (a[0].lvl - b[0].lvl) || a[0].n.localeCompare(b[0].n); });
          sorted.forEach(function (pair) {
            var sp = pair[0], i = pair[1];
            var out = h('span', { class: 'eb-spellout' });
            watch(out, function (D) {
              var cc = D.casters[ci]; if (!cc || cc.c !== c) return;
              var b = cc.spells[i]; if (!b) return;
              var t = [];
              if (b.cost) t.push(SUB.res + ' ' + b.cost);
              if (b.dc) t.push('DC ' + b.dc + ' ' + b.save);
              if (b.touch) t.push((b.rays > 1 ? b.rays + ' rays, ' : '') + 'ranged touch ' + sgn(D.rangedTouch));
              if (b.melee) t.push('melee touch ' + sgn(D.meleeTouch));
              if (b.damage) t.push(b.damage + ' ' + (b.damageLabel || 'damage'));
              if (b.heal) t.push('heals ' + b.heal);
              if (b.effect) t.push(b.effect.replace(/\[\[|\]\]/g, ''));
              if (b.duration) t.push(b.duration);
              out.textContent = t.join(' · ');
            });
            var usesCtl = c.kind === 'Force Powers' ? null : c.kind === 'Spell-Like Abilities'
              ? textBox(function () { return sp.uses; }, function (v) { sp.uses = v; }, { list: 'eb-uses', cls: 'eb-short' })
              : c.kind === 'Spells Prepared'
                ? h('span', { class: 'eb-inline' }, '×', numBox(function () { return +sp.uses || 1; }, function (v) { sp.uses = v; }, { min: 1, max: 9 }))
                : h('span', { class: 'eb-inline' }, textBox(function () { return sp.uses; }, function (v) { sp.uses = v; }, { ph: 'per day', cls: 'eb-short' }));
            list.appendChild(h('div', { class: 'eb-spell' },
              h('a', { href: new URL(sp.fp ? SUB.powersPage : 'magic/spells/' + sp.u + '/', BASE).href, target: '_blank', text: (sp.as ? sp.as + (sp.as.toLowerCase().indexOf(sp.n.toLowerCase()) >= 0 ? '' : ' (' + sp.n + ')') : sp.n) + (sp.conv ? ' [' + sp.conv + ']' : '') }),
              h('span', { class: 'eb-inline' }, 'lvl', numBox(function () { return sp.lvl; }, function (v) { sp.lvl = v; }, { min: 0, max: 9 })),
              usesCtl, out,
              h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Remove', onclick: function () { c.spells.splice(i, 1); changed(); redraw(); } })));
          });
        };
        drawList();
        var adder = h('input', { type: 'text', class: 'eb-t', placeholder: 'type a spell name and pick it…' });
        adder.setAttribute('list', 'eb-spell-list');
        var add = function () {
          var fpw = FP_BY[adder.value.trim().toLowerCase()];
          if (fpw) { c.spells.push({ n: fpw.n, fp: true, lvl: fpw.lvl, uses: '' }); adder.value = ''; changed(); redraw(); return; }
          var s = SPELL_BY_NAME[adder.value.trim().toLowerCase()]; if (!s) return;
          var lv = s.l || {}, lvl = c.cls && lv[c.cls] != null ? lv[c.cls] : Math.min.apply(null, Object.keys(lv).map(function (k) { return lv[k]; }).concat([9]));
          c.spells.push({ n: s.n, u: s.u, lvl: lvl, uses: c.kind === 'Spell-Like Abilities' ? '3/day' : c.kind === 'Spells Prepared' ? 1 : '' });
          adder.value = ''; changed(); redraw();
          var next = root.querySelectorAll('.eb-caster')[ci]; next = next && next.querySelector('input[list="eb-spell-list"]'); if (next) next.focus();
        };
        adder.addEventListener('change', add); adder.addEventListener('input', function () { var v = adder.value.trim().toLowerCase(); if (SPELL_BY_NAME[v] || FP_BY[v]) add(); });
        return h('div', { class: 'eb-caster' },
          h('div', { class: 'eb-grid' },
            field('Kind', select(SWM ? [['Force Powers', SUB.powers], 'Spells Prepared', 'Spell-Like Abilities'] : ['Spell-Like Abilities', 'Spells Prepared', 'Spells Known'], function () { return c.kind; }, function (v) { c.kind = v; }, redraw)),
            SWM ? null : field('Class (for spell levels)', select(classes, function () { return c.cls || ''; }, function (v) { c.cls = v; })),
            field('Caster level', numBox(function () { return c.cl; }, function (v) { c.cl = v; }, { min: 1, max: 20 })),
            field('Casting ability', select(ABIL.slice(3), function () { return c.abil; }, function (v) { c.abil = v; })),
            h('p', { class: 'eb-out' }, 'Concentration ', calc('casters.' + ci + '.conc')),
            h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Remove this block', onclick: function () { S.casters.splice(ci, 1); changed(); redrawAll(); } })),
          c.kind === 'Force Powers' ? knownLine(c) : null, list, adder);
      });
      return h('div', null, blocks.length ? blocks : h('p', { class: 'eb-note', text: 'No spells yet.' }),
        h('button', { type: 'button', class: 'md-button eb-add', text: SWM ? '+ Power block' : '+ Spell block', onclick: function () { S.casters.push({ kind: SWM ? 'Force Powers' : 'Spell-Like Abilities', cls: '', cl: lastD ? lastD.totalHD : Math.max(1, S.hd), abil: SWM ? (S.sw.abil || 'Wis') : 'Cha', spells: [] }); changed(); redrawAll(); } }),
        h('p', { class: 'eb-note', text: 'DC = 10 + spell level + casting ability modifier. Damage, healing, rays, bonuses and durations are worked out at the caster level, as on the monster pages.' }));
    }));
  }

  function specials() {
    return card('Special abilities and extras', slot(function (redraw) {
      var rows = S.special.map(function (s, i) {
        return h('div', { class: 'eb-special' },
          h('div', { class: 'eb-grid' },
            field('Name', textBox(function () { return s.name; }, function (v) { s.name = v; })),
            field('Type', select(['Ex', 'Su', 'Sp', ''], function () { return s.type; }, function (v) { s.type = v; })),
            h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Remove', onclick: function () { S.special.splice(i, 1); changed(); redraw(); } })),
          textBox(function () { return s.text; }, function (v) { s.text = v; }, { area: true, cls: 'eb-full', ph: 'What it does. Dice (2d6) roll in Roll20.' }));
      });
      return h('div', null, rows,
        h('button', { type: 'button', class: 'md-button eb-add', text: '+ Special ability', onclick: function () { S.special.push({ name: '', type: 'Ex', text: '' }); changed(); redraw(); } }),
        h('div', { class: 'eb-grid' },
          field('SQ', textBox(function () { return S.sq; }, function (v) { S.sq = v; })),
          field('Gear', textBox(function () { return S.gear; }, function (v) { S.gear = v; }, { cls: 'eb-wide' }))));
    }));
  }

  function output() {
    var preview = h('div', { class: 'eb-preview' });
    var who = h('input', { type: 'text', class: 'r20-name', placeholder: 'selected token' });
    var flash = function (b, t) { var o = b.textContent; b.textContent = t; setTimeout(function () { b.textContent = o; }, 1500); };
    var copyR20 = h('button', { type: 'button', class: 'md-button md-button--primary eb-big', text: 'Copy for Roll20', onclick: function () {
      var api = window.canefinderRoll20;
      if (!api) { flash(copyR20, 'Roll20 export not loaded'); return; }
      var D = compute(), m = roll20Data(D);
      api.copyHtml(api.bioHtml(m, who.value.replace(/[()|]/g, '').replace(/\s+/g, ' ').trim() || 'selected'), m.name + (m.cr ? ' (CR ' + m.cr + ')' : ''), copyR20);
    } });
    var copyMd = h('button', { type: 'button', class: 'md-button eb-add', text: 'Copy stat block (Markdown)', onclick: function () {
      var D = compute(), text = statBlock(D, roll20Data(D), true);
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { flash(copyMd, 'Copied!'); }, function () { flash(copyMd, 'Copy failed'); });
    } });
    refreshers.push(function (D, m) {
      preview.innerHTML = statBlock(D, m, false);
      var xp = root.querySelector('.eb-xp'); if (xp) xp.textContent = XP[S.cr] ? XP[S.cr].toLocaleString('en-US') + ' XP' : '';
    });
    return card('Stat block', h('div', null,
      h('div', { class: 'eb-actions' }, copyR20, randomButton(), newEnemyButton(), h('label', { class: 'r20-hint' }, 'Roll20 character name (optional): ', who)),
      h('p', { class: 'eb-note', html: 'Paste it into the Bio &amp; Info of a blank <b>Pathfinder by Roll20</b> character, as explained in <a href="' + esc(new URL('monsters/roll20/', BASE).href) + '">Monsters in Roll20</a>.' }),
      preview, h('div', { class: 'eb-actions' }, copyMd)), 'eb-sticky');
  }

  function saving() {
    return card('Saved enemies', slot(function (redraw) {
      var lib = library(), names = Object.keys(lib).sort();
      var save = function (obj) { try { localStorage.setItem(LIB, JSON.stringify(obj)); } catch (e) {} };
      var fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
      fileIn.addEventListener('change', function () {
        var f = fileIn.files[0]; if (!f) return;
        f.text().then(function (t) { try { S = Object.assign(blank(), JSON.parse(t)); store(); redrawAll(); } catch (e) { alert('That file is not an enemy.'); } });
      });
      return h('div', null,
        h('div', { class: 'eb-actions' },
          h('button', { type: 'button', class: 'md-button eb-add', text: 'Save in this browser', onclick: function () { lib[S.name || 'Enemy'] = clone(S); save(lib); redraw(); } }),
          h('button', { type: 'button', class: 'md-button eb-add', text: 'Download file', onclick: function () {
            var a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })), download: slug(S.name || 'enemy') + '.json' });
            document.body.appendChild(a); a.click(); a.remove();
          } }),
          h('button', { type: 'button', class: 'md-button eb-add', text: 'Open file', onclick: function () { fileIn.click(); } }), fileIn,
          newEnemyButton()),
        names.length ? h('ul', { class: 'eb-lib' }, names.map(function (n) {
          return h('li', null, h('a', { href: '#', text: n, onclick: function (e) { e.preventDefault(); S = Object.assign(blank(), clone(lib[n])); store(); redrawAll(); } }), ' ',
            h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Delete', onclick: function () { if (confirm('Delete ' + n + '?')) { delete lib[n]; save(lib); redraw(); } } }));
        })) : h('p', { class: 'eb-note', text: 'Saved enemies are kept in this browser only.' }));
    }));
  }

  function datalists() {
    var dl = function (id, values) { return h('datalist', { id: id }, values.map(function (v) { return h('option', { value: v }); })); };
    return h('div', null,
      dl('eb-weapon-list', Object.keys(NATURAL).concat(DATA.weapons.map(function (w) { return w.n; }))),
      dl('eb-feat-list', allGroups().map(function (g) { return 'Weapon Focus (' + g + ')'; }).concat(DATA.feats.map(function (f) { return f.n; }))),
      dl('eb-spell-list', (SWD ? SWD.powers.map(function (p) { return p.n; }) : []).concat(Object.keys(SPELLS).map(function (u) { return SPELLS[u].n; }))),
      dl('eb-uses', ['At will', 'Constant', '1/day', '2/day', '3/day', '1/week']),
      h('datalist', { id: 'eb-mythic-list' }, Object.keys(mythicEntries()).map(function (k) { return h('option', { value: k }); })));
  }

  function redrawAll() {
    refreshers = [];
    root.innerHTML = '';
    root.appendChild(datalists());
    root.appendChild(h('div', { class: 'eb-layout' },
      basics(), SWM ? swCard() : classesCard(), mythicCard(), abilities(), defense(), skills(), feats(), attacks(), spells(), specials(), saving(), output()));
    store();
    refresh();
  }

  root.innerHTML = '<p>Loading the wiki\'s weapons, feats and spells…</p>';
  Promise.all([
    fetch(new URL('tools/enemy-builder-data.json', BASE)).then(function (r) { if (!r.ok) throw new Error('enemy-builder-data.json ' + r.status); return r.json(); }),
    fetch(new URL('tools/spell-data.json', BASE)).then(function (r) { if (!r.ok) throw new Error('spell-data.json ' + r.status); return r.json(); }),
    SWM ? fetch(new URL('tools/' + SUB.data, BASE)).then(function (r) { if (!r.ok) throw new Error(SUB.data + ' ' + r.status); return r.json(); }) : null
  ]).then(function (res) {
    DATA = res[0];
    var cls = {};
    res[1].spells.forEach(function (s) { SPELLS[s.u] = s; SPELL_BY_NAME[s.n.toLowerCase()] = s; Object.keys(s.l || {}).forEach(function (k) { cls[k] = 1; }); });
    CLASSES = Object.keys(cls).sort();
    (DATA.classes || []).forEach(function (c) { CLASS_BY[c.s] = c; });
    if (SWM) {
      SWD = res[2];
      SWD.classes.forEach(function (c) {
        CLASS_BY['sw-' + c.s] = { s: 'sw-' + c.s, key: c.s, n: c.n, die: c.die, ranks: c.ranks, skills: [], table: c.table, special: c.special, sw: true,
          stamina: c.stamina, powers: c.powers, picks: c.skillPicks, prof: c.prof, role: c.role, page: SUB.page + (MODE === 'starwars' ? '#' + c.s : '') };
      });
      DATA.weapons = SWD.weapons.map(function (w) { return { n: w.n, p: w.blaster ? 'blaster' : 'lightsaber', c: w.c, d: w.d, t: w.t, x: w.x, r: w.r, ty: 'Energy', sp: w.sp }; }).concat(DATA.weapons);
      DATA.feats = SWD.forms.map(function (x) { return { n: x.n, u: null }; }).concat(DATA.feats);
      DATA.feats.push({ n: 'Extra Class Feature', u: MODE === 'starwars' ? 'campaign-systems/star-wars/' : 'campaign-systems/' + (MODE === 'chakra' ? 'chakra' : 'superheroes') + '/class-features-and-prices/' });
      // the chakra system's own feats (class-features-and-prices), in the normal feat list in alphabetical order
      if (MODE === 'chakra') {
        ['Individual Blood Contract', 'Improved Chakra Control', 'Extra Elemental Affinity'].forEach(function (n) {
          if (!featData(n)) DATA.feats.push({ n: n, u: 'campaign-systems/chakra/class-features-and-prices/' });
        });
        DATA.feats.sort(function (a, b) { return a.n.localeCompare(b.n); });
      }
      SWD.powers.forEach(function (p) { FP_BY[p.n.toLowerCase()] = p; });
      Object.keys(SWD.lists).forEach(function (k) { SWD.lists[k].forEach(function (e) { SW_INFO[e[0] + '|' + e[1]] = { text: (SWD.texts || [])[e[5]] || '', feats: e[6] || null, prog: e[7] || null }; }); });
    }
    (S.classes || []).forEach(function (c) { loadArch(c.s); });
    redrawAll();
  }).catch(function (e) { root.innerHTML = '<p>The builder could not load its data (' + esc(e.message) + ').</p>'; });
})();
