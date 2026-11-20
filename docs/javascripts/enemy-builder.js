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
  var KEY = 'enemy-builder:current', LIB = 'enemy-builder:saved';

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
  // a number with − / + buttons; the mouse wheel over it raises or lowers it (Shift: by 5)
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
    wrap.addEventListener('wheel', function (e) { e.preventDefault(); step((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1)); }, { passive: false });
    return wrap;
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
    wrap.addEventListener('wheel', function (e) { e.preventDefault(); step((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1)); }, { passive: false });
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
      abil: { Str: 10, Dex: 10, Con: 10, Int: 10, Wis: 10, Cha: 10 }, skills: {}, feats: [],
      armor: '', armorEnh: 0, shield: '', shieldEnh: 0, natural: 0, deflection: 0, dodge: 0, hpMisc: 0, maxHp: true, initMisc: 0,
      saveMisc: { Fort: 0, Ref: 0, Will: 0 }, speed: '30 ft.', senses: '', languages: 'Common', defense: '', aura: '', sq: '', gear: '',
      specialAttacks: '', weapons: [], casters: [], special: [], classes: [] };
  }
  var S = blank();
  try { var saved = JSON.parse(localStorage.getItem(KEY)); if (saved) S = Object.assign(blank(), saved); } catch (e) {}
  function store() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function library() { try { return JSON.parse(localStorage.getItem(LIB)) || {}; } catch (e) { return {}; } }

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
  function classFeatures(c) {
    var d = CLASS_BY[c.s], L = c.lvl || 1, out = [], bonus = 0;
    if (!d) return { list: out, bonusFeats: 0 };
    var typeOf = function (t) { var m = String(t).match(/\((Ex|Su|Sp)\)|-(ex|su|sp)$/i); return m ? capFirst((m[1] || m[2]).toLowerCase()) : ''; };
    if (!d.arch) {
      (d.special || []).slice(0, L).forEach(function (sp, i) {
        String(sp).split(/,\s*/).filter(function (x) { return x && !/^[—–-]$/.test(x); }).forEach(function (x) {
          var base = x.replace(/\s*[+\d/].*$/, '').toLowerCase();
          out = out.filter(function (o) { return o.base !== base; });
          out.push({ name: capFirst(x), base: base, type: '', text: '', link: d.page, lvl: i + 1 });
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
      if (/^bonus feat/i.test(u.base)) bonus++;
      if (!latest[u.base] || u.idx >= latest[u.base].idx) latest[u.base] = u;
    });
    Object.keys(latest).forEach(function (k) {
      var u = latest[k], label = capFirst(u.label);
      if (/^bonus feat/i.test(k)) return; // counted in the feat slots instead
      if (count[k] > 1 && !/\d/.test(label)) label += ' ×' + count[k];
      out.push({ name: label, type: typeOf(u.sec || ''), text: (d.sec || {})[u.sec] || '', link: d.page + (u.sec ? '#' + u.sec : ''), lvl: u.lvl });
    });
    chosen.forEach(function (a) {
      a.abilities.forEach(function (b) {
        var ids = b.replaces.concat(b.modifies);
        var lvl = b.lvl || (ids.length ? Math.min.apply(null, ids.map(function (id) { return unitById[id] ? unitById[id].lvl : 1; })) : 0);
        if (!lvl || lvl > L || /proficien|class skills|^skills/i.test(b.name)) return;
        out.push({ name: b.name.replace(/\s*\((Ex|Su|Sp)\)\s*$/i, ''), type: typeOf(b.name), text: shortText(stripHtml(b.html), 700),
          link: (a.page || '') + '#' + (a.anchor || ''), lvl: lvl, arch: a.name });
      });
    });
    out.sort(function (x, y) { return x.lvl - y.lvl; });
    return { list: out, bonusFeats: bonus };
  }
  function weaponData(n) {
    n = String(n || '').toLowerCase().trim();
    for (var i = 0; i < DATA.weapons.length; i++) if (DATA.weapons[i].n.toLowerCase() === n) return DATA.weapons[i];
    return null;
  }
  function armorData(n) { for (var i = 0; i < DATA.armors.length; i++) if (DATA.armors[i].n === n) return DATA.armors[i]; return null; }
  function featSlug(n) {
    var base = String(n).replace(/\s*\(.*$/, '').trim().toLowerCase();
    for (var i = 0; i < DATA.feats.length; i++) if (DATA.feats[i].n.toLowerCase() === base) return DATA.feats[i].u;
    return null;
  }

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
      f.list.forEach(function (x) { x.on = (c.off || []).indexOf(x.name) < 0; x.cls = c; D.features.push(x); });
    });
    var noCon = S.type === 'undead' || S.type === 'construct';
    var M = {}; ABIL.forEach(function (a) { M[a] = mod(S.abil[a]); });
    if (noCon) M.Con = 0;
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
    var maxDex = [arm && arm.md, sh && sh.md].filter(function (x) { return x != null; });
    var dexAC = maxDex.length ? Math.min(M.Dex, Math.min.apply(null, maxDex)) : M.Dex;
    var natural = (S.natural || 0) + has('Improved Natural Armor');
    if (has('Improved Natural Armor')) autoNote('Improved Natural Armor', '+' + has('Improved Natural Armor') + ' natural armor');
    var dodgeFeat = has('Dodge') || has('Dodgility') ? 1 : 0;
    if (has('Dodge')) autoNote('Dodge', '+1 dodge AC'); if (has('Dodgility')) autoNote('Dodgility', '+1 dodge AC');
    var dodge = (S.dodge || 0) + dodgeFeat;
    D.ac = 10 + armB + shB + dexAC + sz.ac + natural + (S.deflection || 0) + dodge;
    D.touch = 10 + dexAC + sz.ac + (S.deflection || 0) + dodge;
    D.ff = D.ac - Math.max(0, dexAC) - dodge;
    var parts = [];
    if (armB) parts.push(sgn(armB) + ' armor'); if (shB) parts.push(sgn(shB) + ' shield'); if (dexAC) parts.push(sgn(dexAC) + ' Dex');
    if (dodge) parts.push(sgn(dodge) + ' dodge'); if (S.deflection) parts.push(sgn(S.deflection) + ' deflection');
    if (natural) parts.push(sgn(natural) + ' natural'); if (sz.ac) parts.push(sgn(sz.ac) + ' size');
    D.acText = D.ac + ', touch ' + D.touch + ', flat-footed ' + D.ff + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    D.acp = (arm ? arm.acp : 0) + (sh ? sh.acp : 0);
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
      D.saves[k] = good(k) + ab + f + (S.saveMisc[k] || 0);
    });
    // initiative, CMB, CMD
    var ii = has('Improved Initiative') ? 4 : 0;
    if (ii) autoNote('Improved Initiative', '+4 initiative');
    D.init = M.Dex + ii + (S.initMisc || 0);
    var finesse = has('Weapon Finesse') > 0; // the wiki's Weapon Finesse includes Agile Maneuvers
    if (finesse) autoNote('Weapon Finesse', 'Dex to attack with light and finesse weapons and natural attacks, and to CMB');
    var cmbAb = finesse ? Math.max(M.Str, M.Dex) : M.Str;
    D.cmb = D.bab + cmbAb + sz.cmb;
    D.cmd = 10 + D.bab + M.Str + M.Dex + sz.cmb + dodge + (S.deflection || 0);
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
      var t = r + M[sk[1]] + ((st.cls || D.classSkill[n]) && r > 0 ? 3 : 0) + (st.misc || 0);
      if (n === 'Stealth') t += sz.stealth; if (n === 'Fly') t += sz.fly;
      if (ACP_SKILLS[n]) t += D.acp;
      if (focus.indexOf(n.toLowerCase()) >= 0) { t += r >= 10 ? 6 : 3; autoNote('Skill Focus (' + n.toLowerCase() + ')', sgn(r >= 10 ? 6 : 3) + ' ' + n); }
      if (has('Alertness') && (n === 'Perception' || n === 'Sense Motive')) { t += r >= 10 ? 4 : 2; autoNote('Alertness', '+2 Perception and Sense Motive (+4 at 10 ranks)'); }
      D.skills[n] = { total: t, shown: r > 0 || !!st.misc || !!st.show };
    });

    // attacks
    var wf = featArg('Weapon Focus'), gwf = featArg('Greater Weapon Focus'), ws = featArg('Weapon Specialization'), gws = featArg('Greater Weapon Specialization'), ic = featArg('Improved Critical');
    var hits = function (list, n) { n = n.toLowerCase(); return list.filter(function (x) { return x && (n === x || n.indexOf(x) >= 0 || x.indexOf(n) >= 0 || x.replace(/s$/, '') === n); }).length; };
    var twf = has('Two-Weapon Fighting'), itwf = has('Improved Two-Weapon Fighting') || has('Greater Two-Weapon Fighting');
    var multi = has('Multiattack'), rapid = has('Rapid Shot');
    var naturals = S.weapons.filter(function (w) { return /^nat/.test(w.mode); });
    D.attacks = S.weapons.map(function (w) {
      var a = { row: w }, nat = /^nat/.test(w.mode), ranged = w.mode === 'ranged' || w.mode === 'thrown';
      var n = String(w.n || 'attack').trim().toLowerCase();
      var light = w.cat === 'light' || nat;
      var useDex = ranged || ((finesse || w.finesse) && (light || FINESSE.test(n)) && M.Dex > M.Str);
      var enh = w.enh || 0, mw = !enh && w.mwk && !nat ? 1 : 0;
      var focusN = hits(wf, n) + hits(gwf, n);
      if (focusN) autoNote('Weapon Focus (' + n + ')', '+1 attack with ' + n);
      a.atk = D.bab + (useDex ? M.Dex : M.Str) + sz.ac + enh + mw + focusN + (w.misc || 0);
      if (w.mode === 'nat2') a.atk -= multi ? 2 : 5;
      if (multi && w.mode === 'nat2') autoNote('Multiattack', 'secondary natural attacks at –2');
      var strD = M.Str;
      if (w.mode === 'two' || (w.mode === 'nat1' && naturals.length === 1 && (w.count || 1) === 1 && S.weapons.length === 1)) strD = M.Str > 0 ? Math.floor(M.Str * 1.5) : M.Str;
      if (w.mode === 'off' || w.mode === 'nat2') strD = M.Str > 0 ? Math.floor(M.Str / 2) : M.Str;
      if (w.mode === 'ranged' && !w.strDmg) strD = Math.min(0, M.Str); // bows: a Str penalty, no bonus (composite: tick Str to damage)
      var spec = (hits(ws, n) + hits(gws, n)) * 2;
      if (spec) autoNote('Weapon Specialization (' + n + ')', '+2 damage with ' + n);
      a.dmgMod = strD + enh + spec + (w.dmgMisc || 0);
      a.dice = sizeDice(w.d || '1d4', S.size);
      a.threat = w.t || 20; a.mult = w.x || 2;
      if (hits(ic, n)) { a.threat = 21 - (21 - a.threat) * 2; autoNote('Improved Critical (' + n + ')', 'threat ' + a.threat + '–20'); }
      a.name = (enh ? '+' + enh + ' ' : mw ? 'mwk ' : '') + n;
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
          if (a.row.mode === 'off') { if (itwf) { bonuses.push(atk - 5); if (D.bab >= 11) bonuses.push(atk - 10); autoNote('Improved Two-Weapon Fighting', 'more off-hand attacks'); } }
          else if (!a.nat) for (var k = 1; k <= 3 && D.bab - 5 * k >= 1; k++) bonuses.push(atk - 5 * k);
          if (kind === 'ranged' && rapid && !a.nat) { bonuses = [bonuses[0] - 2].concat(bonuses.map(function (b) { return b - 2; })); autoNote('Rapid Shot', 'an extra ranged attack, –2 on all'); }
          var dmgMod = a.dmgMod + (a.nat && hasWeapon && a.row.mode === 'nat1' && M.Str > 0 ? Math.floor(M.Str / 2) - M.Str : 0);
          return { name: a.name, count: a.nat ? Math.max(1, a.row.count || 1) : 1, bonuses: bonuses, touch: false, kind: kind === 'ranged' ? 'Ranged' : 'Melee',
            dice: a.dice, mod: dmgMod, threat: a.threat, mult: a.mult, rider: a.row.rider || '' };
        }));
      });
    });
    // spells
    D.casters = S.casters.map(function (c) {
      var am = mod(S.abil[c.abil] || 10), cl = Math.max(1, Math.min(20, c.cl || 1));
      var out = { c: c, cl: cl, conc: cl + am, spells: [] };
      out.spells = c.spells.map(function (sp) {
        var info = SPELLS[sp.u] || {}, lvl = sp.lvl || 0;
        var sv = String(info.sv || '').replace(/\s*\(harmless[^)]*\)/ig, '').trim();
        var noSave = !sv || /^(none|no|—|-)$/i.test(sv) || /see text/i.test(sv) && sv.length < 12;
        var b = { name: (info.n || sp.n || '').toLowerCase(), page: sp.u || '', lvl: lvl, uses: sp.uses };
        if (!noSave) { b.dc = 10 + lvl + am; b.save = sv; }
        var r = (DATA.rolls[sp.u] || [])[cl - 1];
        if (r) Object.keys(r).forEach(function (k) { b[k] = r[k]; });
        var du = durationAt(info.du, cl); if (du) b.duration = du;
        return b;
      });
      return out;
    });
    return D;
  }

  // the creature in the form of the monster pages' Roll20 data (see roll20-export.js)
  function roll20Data(D) {
    var m = { name: S.name || 'Enemy', cr: String(S.cr || ''), xp: XP[S.cr] ? String(XP[S.cr]) : '' };
    m.line = [S.align, S.size, S.type + (S.subtypes ? ' (' + S.subtypes + ')' : '')].filter(Boolean).join(' ');
    var classText = (S.classes || []).filter(function (c) { return CLASS_BY[c.s]; }).map(function (c) {
      return CLASS_BY[c.s].n.toLowerCase() + ' ' + c.lvl + ((c.arch || []).length ? ' (' + c.arch.join(', ').toLowerCase() + ')' : '');
    }).join(' / ');
    if (classText) m.line = capFirst(classText) + '; ' + m.line;
    m.init = D.init;
    m.senses = [S.senses].filter(Boolean).join('; ');
    if (S.aura) m.aura = S.aura;
    m.ac = D.acText.replace(/ \(.*$/, '');
    m.hp = D.hpText;
    m.saves = { Fort: D.saves.Fort, Ref: D.saves.Ref, Will: D.saves.Will };
    if (S.defense) m.defense = S.defense;
    m.speed = S.speed || '30 ft.';
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
        if (!sla && c.c.kind === 'Spells Prepared' && s.uses && /^\d+$/.test(String(s.uses)) && +s.uses > 1) b.note = String(s.uses);
        groups[label].push(b);
      });
      var rank = function (l) { var t = l.label.toLowerCase(); return l.sla ? (/constant/.test(t) ? 0 : /will/.test(t) ? 1 : 100 - (parseInt(t, 10) || 0)) : -l.lvl; };
      order.sort(function (a, b) { return rank(a) - rank(b); });
      return { title: (c.c.cls && !sla ? c.c.cls.replace(/^./, function (x) { return x.toUpperCase(); }) + ' ' : '') + c.c.kind, cl: c.cl, concentration: c.conc,
        levels: order.map(function (l) { return { label: l.label, spells: groups[l.label] }; }) };
    });
    if (!m.spells.length) delete m.spells;
    m.special = S.special.filter(function (s) { return s.name; }).map(function (s) { return { name: s.name, type: s.type || '', text: s.text || '' }; });
    D.features.filter(function (x) { return x.on; }).forEach(function (x) {
      var b = { name: x.name, type: x.type, text: x.text || x.name };
      var dice = x.name.match(/\b\d+d\d+\b/);
      if (dice) b.rolls = [[x.name.replace(/\s*\+?\d+d\d+.*$/, '') || 'roll', dice[0]]];
      m.special.push(b);
    });
    m.abilities = ABIL.map(function (a) { return a + ' ' + ((a === 'Con' && (S.type === 'undead' || S.type === 'construct')) ? '—' : S.abil[a]); }).join(', ');
    m.combat = 'BAB ' + sgn(D.bab).replace('–', '-') + '; CMB ' + sgn(D.cmb).replace('–', '-') + '; CMD ' + D.cmd;
    m.checks = {};
    SKILLS.forEach(function (sk) { if (D.skills[sk[0]].shown) m.checks[sk[0]] = D.skills[sk[0]].total; });
    m.checks.CMB = D.cmb;
    if (D.feats.length) m.feats = D.feats.join(', ');
    if (S.languages) m.languages = S.languages;
    if (S.sq) m.sq = S.sq;
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
    var sk = SKILLS.filter(function (s) { return D.skills[s[0]].shown; }).map(function (s) { return s[0] + ' ' + sgn(D.skills[s[0]].total); });
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
    var applyType = function (t) {
      var d = TYPES[t]; if (!d) return;
      S.die = d.die; S.bab = d.bab; S.ranks = d.ranks;
      S.good = { Fort: d.good.indexOf('Fort') >= 0, Ref: d.good.indexOf('Ref') >= 0, Will: d.good.indexOf('Will') >= 0 };
      if (t === 'humanoid' && !d.good.length) S.good.Fort = true;
      redrawAll();
    };
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
    ), null, newEnemyButton('eb-head-btn'));
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
          c.s = pick.value; c.arch = []; c.off = [];
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
        var flist = h('div', { class: 'eb-features' }, feats.map(function (x) {
          return h('label', { class: 'eb-feature' + (x.arch ? ' eb-arch' : ''), title: x.text },
            h('input', { type: 'checkbox', checked: x.on, onchange: function (e) {
              c.off = (c.off || []).filter(function (n) { return n !== x.name; }); if (!e.target.checked) c.off.push(x.name); changed();
            } }),
            h('small', { text: x.lvl + ' ' }), x.name + (x.type ? ' (' + x.type + ')' : '') + ' ',
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
          A === 'loading' ? h('p', { class: 'eb-note', text: 'Loading class features…' }) : feats.length ? flist : null);
      });
      var box = h('div', null, rows,
        h('button', { type: 'button', class: 'md-button eb-add', text: '+ Class', onclick: function () { S.classes.push({ s: '', lvl: 1, arch: [], off: [] }); changed(); redrawAll(); } }),
        h('p', { class: 'eb-out' }, 'Total Hit Dice ', calc('totalHD'), ' · BAB ', calc('bab'), ' · Fort ', calc('saves.Fort'), ' Ref ', calc('saves.Ref'), ' Will ', calc('saves.Will')),
        h('p', { class: 'eb-note', text: 'No class: a plain monster, from its type. With a class, its table gives Hit Dice, BAB, saves, skill ranks, class skills and class features; racial Hit Dice add on top (a bugbear fighter: 3 racial HD + fighter levels). Untick a feature to leave it out of the stat block; hover it for its text.' }));
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
  function abilities() {
    return card('Ability scores', slot(function () {
      var rows = ABIL.map(function (a) {
        var dead = a === 'Con' && (S.type === 'undead' || S.type === 'construct');
        return h('div', { class: 'eb-abil' + (dead ? ' eb-off' : '') }, h('b', { text: a }),
          numBox(function () { return S.abil[a]; }, function (v) { S.abil[a] = v; }, { min: 0, max: 60 }),
          h('span', { class: 'eb-mod', 'data-abil': a }));
      });
      var cost = h('p', { class: 'eb-note' });
      refreshers.push(function (D) {
        root.querySelectorAll('[data-abil]').forEach(function (e) { var a = e.getAttribute('data-abil'); e.textContent = sgn(mod(S.abil[a])); });
        var total = 0, ok = true;
        ABIL.forEach(function (a) { var c = POINT_COST[S.abil[a]]; if (c == null) ok = false; else total += c; });
        cost.textContent = ok ? 'Point buy: ' + total + ' points (15 low fantasy · 20 standard · 25 high)' : 'Point buy: some scores are outside 7–18';
      });
      return h('div', null, h('div', { class: 'eb-abils' }, rows), cost,
        h('p', { class: 'eb-note', text: 'Click − / +, type the number, or roll the mouse wheel over it (Shift + wheel: 5 at a time).' }));
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
        var label = n.replace(/^Knowledge \((.*)\)$/, 'Know. ($1)');
        return h('div', { class: 'eb-sk', 'data-skill': n, title: n + ' (' + sk[1] + ')' },
          h('span', { class: 'eb-skn', text: label }),
          check(function () { return st().cls; }, function (v) { st().cls = v; }),
          numBox(function () { return st().r || 0; }, function (v) { st().r = v; }, { min: 0, max: function () { return lastD ? lastD.totalHD : Math.max(1, S.hd); } }),
          numBox(function () { return st().misc || 0; }, function (v) { st().misc = v; }, { min: -20, max: 40 }),
          calc('skills.' + n + '.total'));
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
          var v = (S.feats[i] || '').trim(), u = v && featSlug(v), auto = compute().auto[v.toLowerCase()];
          info.innerHTML = (u ? '<a href="' + esc(new URL('rules/feats/' + u + '/', BASE).href) + '" target="_blank">↗</a> ' : '') + (auto ? '<span class="eb-auto">' + esc(auto) + '</span>' : '');
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
        h('p', { class: 'eb-note', text: 'Worked out for you: Improved Initiative, Toughness, the save feats, Dodge / Dodgility, Weapon Finesse, Weapon Focus, Weapon Specialization, Improved Critical, Skill Focus, Alertness, Improved Natural Armor, Two-Weapon Fighting, Multiattack and Rapid Shot. Power Attack and Deadly Aim need no feat on this wiki: set them as a Buff on the Roll20 sheet.' }));
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
          if (d) { w.d = d.d; w.t = d.t; w.x = d.x; w.cat = d.c; w.mode = d.c === 'ranged' ? 'ranged' : d.c === 'two-handed' ? 'two' : 'melee'; w.strDmg = /sling|throw/i.test(d.n) || (d.c === 'ranged' && !/bow|crossbow|gun|pistol|musket|rifle|firearm/i.test(d.n)); }
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

  function spells() {
    var classes = [['', 'any class']].concat(CLASSES.map(function (c) { return [c, c]; }));
    return card('Spells', slot(function (redraw) {
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
              if (b.dc) t.push('DC ' + b.dc + ' ' + b.save);
              if (b.touch) t.push((b.rays > 1 ? b.rays + ' rays, ' : '') + 'ranged touch ' + sgn(D.rangedTouch));
              if (b.melee) t.push('melee touch ' + sgn(D.meleeTouch));
              if (b.damage) t.push(b.damage + ' ' + (b.damageLabel || 'damage'));
              if (b.heal) t.push('heals ' + b.heal);
              if (b.effect) t.push(b.effect.replace(/\[\[|\]\]/g, ''));
              if (b.duration) t.push(b.duration);
              out.textContent = t.join(' · ');
            });
            var usesCtl = c.kind === 'Spell-Like Abilities'
              ? textBox(function () { return sp.uses; }, function (v) { sp.uses = v; }, { list: 'eb-uses', cls: 'eb-short' })
              : c.kind === 'Spells Prepared'
                ? h('span', { class: 'eb-inline' }, '×', numBox(function () { return +sp.uses || 1; }, function (v) { sp.uses = v; }, { min: 1, max: 9 }))
                : h('span', { class: 'eb-inline' }, textBox(function () { return sp.uses; }, function (v) { sp.uses = v; }, { ph: 'per day', cls: 'eb-short' }));
            list.appendChild(h('div', { class: 'eb-spell' },
              h('a', { href: new URL('magic/spells/' + sp.u + '/', BASE).href, target: '_blank', text: sp.n }),
              h('span', { class: 'eb-inline' }, 'lvl', numBox(function () { return sp.lvl; }, function (v) { sp.lvl = v; }, { min: 0, max: 9 })),
              usesCtl, out,
              h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Remove', onclick: function () { c.spells.splice(i, 1); changed(); redraw(); } })));
          });
        };
        drawList();
        var adder = h('input', { type: 'text', class: 'eb-t', placeholder: 'type a spell name and pick it…' });
        adder.setAttribute('list', 'eb-spell-list');
        var add = function () {
          var s = SPELL_BY_NAME[adder.value.trim().toLowerCase()]; if (!s) return;
          var lv = s.l || {}, lvl = c.cls && lv[c.cls] != null ? lv[c.cls] : Math.min.apply(null, Object.keys(lv).map(function (k) { return lv[k]; }).concat([9]));
          c.spells.push({ n: s.n, u: s.u, lvl: lvl, uses: c.kind === 'Spell-Like Abilities' ? '3/day' : c.kind === 'Spells Prepared' ? 1 : '' });
          adder.value = ''; changed(); redraw();
          var next = root.querySelectorAll('.eb-caster')[ci]; next = next && next.querySelector('input[list="eb-spell-list"]'); if (next) next.focus();
        };
        adder.addEventListener('change', add); adder.addEventListener('input', function () { if (SPELL_BY_NAME[adder.value.trim().toLowerCase()]) add(); });
        return h('div', { class: 'eb-caster' },
          h('div', { class: 'eb-grid' },
            field('Kind', select(['Spell-Like Abilities', 'Spells Prepared', 'Spells Known'], function () { return c.kind; }, function (v) { c.kind = v; }, redraw)),
            field('Class (for spell levels)', select(classes, function () { return c.cls || ''; }, function (v) { c.cls = v; })),
            field('Caster level', numBox(function () { return c.cl; }, function (v) { c.cl = v; }, { min: 1, max: 20 })),
            field('Casting ability', select(ABIL.slice(3), function () { return c.abil; }, function (v) { c.abil = v; })),
            h('p', { class: 'eb-out' }, 'Concentration ', calc('casters.' + ci + '.conc')),
            h('button', { type: 'button', class: 'eb-x', text: '×', title: 'Remove this block', onclick: function () { S.casters.splice(ci, 1); changed(); redrawAll(); } })),
          list, adder);
      });
      return h('div', null, blocks.length ? blocks : h('p', { class: 'eb-note', text: 'No spells yet.' }),
        h('button', { type: 'button', class: 'md-button eb-add', text: '+ Spell block', onclick: function () { S.casters.push({ kind: 'Spell-Like Abilities', cls: '', cl: lastD ? lastD.totalHD : Math.max(1, S.hd), abil: 'Cha', spells: [] }); changed(); redrawAll(); } }),
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
      h('div', { class: 'eb-actions' }, copyR20, newEnemyButton(), h('label', { class: 'r20-hint' }, 'Roll20 character name (optional): ', who)),
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
      dl('eb-feat-list', DATA.feats.map(function (f) { return f.n; })),
      dl('eb-spell-list', Object.keys(SPELLS).map(function (u) { return SPELLS[u].n; })),
      dl('eb-uses', ['At will', 'Constant', '1/day', '2/day', '3/day', '1/week']));
  }

  function redrawAll() {
    refreshers = [];
    root.innerHTML = '';
    root.appendChild(datalists());
    root.appendChild(h('div', { class: 'eb-layout' },
      h('div', { class: 'eb-main' }, basics(), classesCard(), abilities(), defense(), skills(), feats(), attacks(), spells(), specials(), saving()),
      h('div', { class: 'eb-side' }, output())));
    store();
    refresh();
  }

  root.innerHTML = '<p>Loading the wiki\'s weapons, feats and spells…</p>';
  Promise.all([
    fetch(new URL('tools/enemy-builder-data.json', BASE)).then(function (r) { if (!r.ok) throw new Error('enemy-builder-data.json ' + r.status); return r.json(); }),
    fetch(new URL('tools/spell-data.json', BASE)).then(function (r) { if (!r.ok) throw new Error('spell-data.json ' + r.status); return r.json(); })
  ]).then(function (res) {
    DATA = res[0];
    var cls = {};
    res[1].spells.forEach(function (s) { SPELLS[s.u] = s; SPELL_BY_NAME[s.n.toLowerCase()] = s; Object.keys(s.l || {}).forEach(function (k) { cls[k] = 1; }); });
    CLASSES = Object.keys(cls).sort();
    (DATA.classes || []).forEach(function (c) { CLASS_BY[c.s] = c; });
    (S.classes || []).forEach(function (c) { loadArch(c.s); });
    redrawAll();
  }).catch(function (e) { root.innerHTML = '<p>The builder could not load its data (' + esc(e.message) + ').</p>'; });
})();
