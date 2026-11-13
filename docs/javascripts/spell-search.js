// Spell Search (tools/spell-search.md): filters every spell of the wiki by class, level, school, subschool,
// descriptor and domain. With no filters it lists every spell. Its data is built by tools/build-spells.js.
(function () {
  'use strict';
  var root = document.getElementById('spell-search');
  if (!root) return;

  var cfg = JSON.parse(document.getElementById('__config').textContent);
  var BASE = new URL(cfg.base.replace(/\/?$/, '/'), location.href);
  var PAGE_SIZE = 200;

  var CLASS_ORDER = ['sorcerer', 'wizard', 'arcanist', 'cleric', 'oracle', 'warpriest', 'druid', 'hunter', 'shaman', 'witch',
    'bard', 'skald', 'inquisitor', 'magus', 'bloodrager', 'alchemist', 'investigator', 'paladin', 'antipaladin', 'ranger',
    'summoner', 'unchained summoner', 'psychic', 'mesmerist', 'occultist', 'spiritualist', 'medium', 'adept', 'pesh adept', 'red mantis assassin'];
  var SHORT = { sorcerer: 'sor', wizard: 'wiz', arcanist: 'arc', cleric: 'clr', oracle: 'ora', warpriest: 'wpr', druid: 'drd', hunter: 'hun',
    shaman: 'sha', witch: 'wit', bard: 'brd', skald: 'ska', inquisitor: 'inq', magus: 'mag', bloodrager: 'bldr', alchemist: 'alc',
    investigator: 'inv', paladin: 'pal', antipaladin: 'apal', ranger: 'rgr', summoner: 'sum', 'unchained summoner': 'sum (unch)',
    psychic: 'psy', mesmerist: 'mes', occultist: 'occ', spiritualist: 'spi', medium: 'med', adept: 'adept', 'pesh adept': 'pesh', 'red mantis assassin': 'rma' };

  var cap = function (s) { return s.replace(/(^|[\s(-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ''); }

  var spells = [], state = { text: '', cls: new Set(), lvl: new Set(), sch: new Set(), sub: new Set(), dsc: new Set(), dom: new Set(), sort: 'name', dir: 1, shown: PAGE_SIZE };
  var FILTERS = [
    ['cls', 'Class'], ['lvl', 'Level'], ['sch', 'School'], ['sub', 'Subschool'], ['dsc', 'Descriptor'], ['dom', 'Domain'],
  ];

  root.innerHTML = '<p class="ss-loading">Loading the spells…</p>';

  fetch(new URL('tools/spell-data.json', BASE)).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (data) {
    spells = data.spells;
    spells.forEach(function (s) { s.key = fold(s.n + ' ' + (s.x || '')); s.nameKey = fold(s.n); });
    build(data);
  }).catch(function (e) { root.innerHTML = '<p>The spell list could not load (' + esc(e.message) + ').</p>'; });

  function values(field, data) {
    var count = new Map();
    spells.forEach(function (s) {
      var v = field === 'cls' ? Object.keys(s.l) : field === 'sch' ? [s.s] : field === 'sub' ? (s.ss || []) : field === 'dsc' ? (s.d || []) : field === 'dom' ? Object.keys(s.dom || {}) : [];
      v.forEach(function (x) { count.set(x, (count.get(x) || 0) + 1); });
    });
    if (field === 'lvl') return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return [String(n), n === 0 ? '0 (cantrips, orisons)' : String(n)]; });
    var list = Array.from(count.keys());
    if (field === 'cls') list.sort(function (a, b) { var i = CLASS_ORDER.indexOf(a), j = CLASS_ORDER.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b); });
    else if (field === 'dom') list = data.domains.filter(function (d) { return count.has(d); });
    else list.sort();
    return list.map(function (x) { return [x, cap(x) + ' <span>' + count.get(x) + '</span>']; });
  }

  function build(data) {
    var html = '<div class="ss-top"><input class="ss-text" type="search" placeholder="Name or words in the description" aria-label="Spell name or words">' +
      '<button type="button" class="md-button ss-clear">Clear filters</button></div><div class="ss-filters">';
    FILTERS.forEach(function (f) {
      html += '<details class="ss-filter" data-f="' + f[0] + '"><summary>' + f[1] + ' <b class="ss-count"></b></summary><div class="ss-opts">' +
        values(f[0], data).map(function (v) { return '<label><input type="checkbox" value="' + esc(v[0]) + '"> ' + v[1] + '</label>'; }).join('') +
        '</div></details>';
    });
    html += '</div><p class="ss-note">Within one filter a spell needs any of the ticked options; across filters it needs all of them. ' +
      'Level counts for the ticked classes when there are any.</p><p class="ss-status" aria-live="polite"></p>' +
      '<div class="ss-table-wrap"><table class="ss-table"><thead><tr>' +
      '<th data-sort="name">Name</th><th data-sort="school">School</th><th data-sort="level">Level</th><th>Casting Time</th><th>Range</th><th>Duration</th><th>Save / SR</th><th>Description</th>' +
      '</tr></thead><tbody></tbody></table></div><p class="ss-morewrap"><button type="button" class="md-button ss-more">Show more</button></p>';
    root.innerHTML = html;

    var text = root.querySelector('.ss-text'), t;
    text.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.text = text.value; state.shown = PAGE_SIZE; update(true); }, 150); });
    root.querySelectorAll('.ss-filter').forEach(function (det) {
      det.addEventListener('change', function (e) {
        var set = state[det.dataset.f];
        if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
        state.shown = PAGE_SIZE; update(true);
      });
    });
    root.querySelector('.ss-clear').addEventListener('click', function () {
      FILTERS.forEach(function (f) { state[f[0]].clear(); });
      state.text = ''; text.value = ''; state.shown = PAGE_SIZE;
      root.querySelectorAll('.ss-filter input').forEach(function (i) { i.checked = false; });
      update(true);
    });
    root.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.sort; state.dir = state.sort === k ? -state.dir : 1; state.sort = k; update(true);
      });
    });
    root.querySelector('.ss-more').addEventListener('click', function () { state.shown += PAGE_SIZE; update(false); });

    fromUrl();
    root.querySelectorAll('.ss-filter').forEach(function (det) {
      det.querySelectorAll('input').forEach(function (i) { i.checked = state[det.dataset.f].has(i.value); });
    });
    text.value = state.text;
    update(false);
  }

  function relevantLevels(s) {
    var out = [];
    for (var c in s.l) if (!state.cls.size || state.cls.has(c)) out.push(s.l[c]);
    return out;
  }

  function matches(s) {
    if (state.text) {
      var words = fold(state.text).split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (s.key.indexOf(words[i]) < 0) return false;
    }
    if (state.cls.size && !Object.keys(s.l).some(function (c) { return state.cls.has(c); })) return false;
    if (state.lvl.size && !relevantLevels(s).some(function (l) { return state.lvl.has(String(l)); })) return false;
    if (state.sch.size && !state.sch.has(s.s)) return false;
    if (state.sub.size && !(s.ss || []).some(function (x) { return state.sub.has(x); })) return false;
    if (state.dsc.size && !(s.d || []).some(function (x) { return state.dsc.has(x); })) return false;
    if (state.dom.size && !Object.keys(s.dom || {}).some(function (x) { return state.dom.has(x); })) return false;
    return true;
  }

  function levelText(s) {
    var keys = Object.keys(s.l).filter(function (c) { return !state.cls.size || state.cls.has(c); });
    keys.sort(function (a, b) { return CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b); });
    var parts = keys.map(function (c) { return (SHORT[c] || c) + ' ' + s.l[c]; });
    if (state.dom.size) Object.keys(s.dom || {}).filter(function (d) { return state.dom.has(d); }).forEach(function (d) { parts.push(d + ' ' + s.dom[d]); });
    return parts.join(', ');
  }

  function update(push) {
    var list = spells.filter(matches);
    var minLvl = function (s) { var l = relevantLevels(s); return l.length ? Math.min.apply(null, l) : 99; };
    list.sort(function (a, b) {
      var r = 0;
      if (state.sort === 'school') r = a.s.localeCompare(b.s);
      else if (state.sort === 'level') r = minLvl(a) - minLvl(b);
      if (!r && state.text) r = (b.nameKey.indexOf(fold(state.text)) === 0) - (a.nameKey.indexOf(fold(state.text)) === 0);
      return (r || a.n.localeCompare(b.n)) * (r ? state.dir : state.sort === 'name' ? state.dir : 1);
    });
    var body = root.querySelector('tbody');
    body.innerHTML = list.slice(0, state.shown).map(function (s) {
      var school = cap(s.s) + (s.ss ? ' (' + s.ss.join(', ') + ')' : '') + (s.d ? ' [' + s.d.join(', ') + ']' : '');
      return '<tr><td><a href="' + new URL('magic/spells/' + s.u + '/', BASE) + '">' + esc(s.n) + '</a></td><td>' + esc(school) + '</td><td>' + esc(levelText(s)) +
        '</td><td>' + esc(s.ct) + '</td><td>' + esc(s.r) + '</td><td>' + esc(s.du) + '</td><td>' + esc([s.sv, s.sr].filter(Boolean).join(' / ')) + '</td><td class="ss-desc">' + esc(s.x) + '</td></tr>';
    }).join('');
    root.querySelector('.ss-status').textContent = list.length === spells.length ? 'All ' + spells.length + ' spells.' : list.length + ' of ' + spells.length + ' spells.';
    root.querySelector('.ss-morewrap').hidden = list.length <= state.shown;
    root.querySelector('.ss-more').textContent = 'Show more (' + (list.length - state.shown) + ' left)';
    root.querySelectorAll('.ss-filter').forEach(function (det) {
      var n = state[det.dataset.f].size; det.querySelector('.ss-count').textContent = n ? n : '';
    });
    root.querySelectorAll('th[data-sort]').forEach(function (th) { th.classList.toggle('ss-sorted', th.dataset.sort === state.sort); th.dataset.dir = state.dir > 0 ? '▲' : '▼'; });
    toUrl(push);
  }

  function toUrl(push) {
    var url = new URL(location.href);
    ['text', 'cls', 'lvl', 'sch', 'sub', 'dsc', 'dom', 'sort'].forEach(function (k) { url.searchParams.delete(k); });
    if (state.text) url.searchParams.set('text', state.text);
    FILTERS.forEach(function (f) { if (state[f[0]].size) url.searchParams.set(f[0], Array.from(state[f[0]]).join('|')); });
    if (state.sort !== 'name' || state.dir < 0) url.searchParams.set('sort', state.sort + (state.dir < 0 ? '-' : ''));
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  function fromUrl() {
    var p = new URLSearchParams(location.search);
    state.text = p.get('text') || '';
    FILTERS.forEach(function (f) { state[f[0]] = new Set((p.get(f[0]) || '').split('|').filter(Boolean)); });
    var s = p.get('sort') || 'name'; state.dir = /-$/.test(s) ? -1 : 1; state.sort = s.replace(/-$/, '');
  }
})();
