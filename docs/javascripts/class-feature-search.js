// Class Feature Search (tools/class-feature-search.md): every class feature of the Build Your Own Class lists
// (Star Wars, Chakra, Superheroes) with its price and level band in each of the three class types. Filters by
// class type, price, level band, highest level, kind and source class. Its data is built by tools/build-starwars-builder.js
// from docs/campaign-systems/class-features/.
(function () {
  'use strict';
  var root = document.getElementById('class-feature-search');
  if (!root) return;

  var cfg = JSON.parse(document.getElementById('__config').textContent);
  var BASE = new URL(cfg.base.replace(/\/?$/, '/'), location.href);
  var PAGE_SIZE = 200;
  var TIERS = ['iconic', 'op', 'common', 'weak'];
  var TIER_NAME = { iconic: 'Iconic', op: 'OP', common: 'Common', weak: 'Weak' };
  var BANDS = ['1–8', '9–15', '16–20'];
  var KINDS = ['Class', 'Archetype', 'Prestige class', 'Generic'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ''); }

  var data, feats = [], sys;
  // role, tier and band filters apply to one same placement ("OP for the Warrior"), the others to the feature
  var FILTERS = [['rol', 'Class type'], ['tie', 'Price'], ['bnd', 'Levels'], ['knd', 'Kind'], ['cls', 'Class']];
  var state = { sys: '', text: '', lvl: '', rol: new Set(), tie: new Set(), bnd: new Set(), knd: new Set(), cls: new Set(), sort: 'name', dir: 1, shown: PAGE_SIZE };

  root.innerHTML = '<p class="ss-loading">Loading the class features…</p>';

  fetch(new URL('tools/class-feature-data.json', BASE)).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (d) {
    data = d;
    feats = d.features.map(function (f) {
      return { n: f.n, l: f.l, g: f.g, c: f.c, k: f.k, x: f.x || '', t: f.t != null ? d.texts[f.t] : '',
        p: f.p.map(function (p) { return { r: p[0], lo: p[1], hi: p[2], tier: p[3], at: p[4], sys: p[5], band: p[1] + '–' + p[2] }; }),
        key: fold(f.n + ' ' + f.c), nameKey: fold(f.n) };
    });
    build();
  }).catch(function (e) { root.innerHTML = '<p>The class feature list could not load (' + esc(e.message) + ').</p>'; });

  function places(f) { return f.p.filter(function (p) { return !p.sys || p.sys === sys.id; }); }

  function values(f) {
    if (f === 'rol') return sys.roles.map(function (n, i) { return [String(i), n]; });
    if (f === 'tie') return TIERS.map(function (t) { return [t, TIER_NAME[t]]; });
    if (f === 'bnd') return BANDS.map(function (b) { return [b, 'Levels ' + b]; });
    var count = new Map();
    feats.forEach(function (i) { var v = f === 'knd' ? i.k : i.c; count.set(v, (count.get(v) || 0) + 1); });
    var list = Array.from(count.keys());
    if (f === 'knd') list.sort(function (a, b) { return KINDS.indexOf(a) - KINDS.indexOf(b); }); else list.sort();
    return list.map(function (x) { return [x, esc(x) + ' <span>' + count.get(x) + '</span>']; });
  }

  function build() {
    var html = '<div class="ss-top"><input class="ss-text" type="search" placeholder="Class feature or class name" aria-label="Class feature or class name">' +
      '<label class="ss-price">Subsystem <select class="cf-sys" aria-label="Subsystem">' +
      data.systems.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.n) + '</option>'; }).join('') + '</select></label>' +
      '<label class="ss-price">Up to level <input class="cf-lvl" type="number" min="1" max="20" placeholder="1–20" aria-label="Highest level"></label>' +
      '<button type="button" class="md-button ss-clear">Clear filters</button></div><div class="ss-filters">';
    FILTERS.forEach(function (f) {
      html += '<details class="ss-filter" data-f="' + f[0] + '"><summary>' + f[1] + ' <b class="ss-count"></b></summary><div class="ss-opts"></div></details>';
    });
    html += '</div><p class="ss-note">Within one filter a feature needs any of the ticked options; across filters it needs all of them. ' +
      'Class type, Price, Levels and Up to level apply together to one same list: Warrior with OP finds what is OP for the Warrior. ' +
      'The level shown is the one the original class gains the feature at (prestige classes 3 levels higher), or the start of its band.</p>' +
      '<p class="ss-status" aria-live="polite"></p>' +
      '<div class="ss-table-wrap"><table class="ss-table cf-table"><thead><tr>' +
      '<th data-sort="name">Name</th><th data-sort="class">Class</th><th data-sort="r0" class="cf-r0"></th><th data-sort="r1" class="cf-r1"></th><th data-sort="r2" class="cf-r2"></th><th>Description</th>' +
      '</tr></thead><tbody></tbody></table></div><p class="ss-morewrap"><button type="button" class="md-button ss-more">Show more</button></p>';
    root.innerHTML = html;

    var text = root.querySelector('.ss-text'), lvl = root.querySelector('.cf-lvl'), sel = root.querySelector('.cf-sys'), t;
    text.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.text = text.value; state.shown = PAGE_SIZE; update(true); }, 150); });
    lvl.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.lvl = lvl.value; state.shown = PAGE_SIZE; update(true); }, 250); });
    sel.addEventListener('change', function () { setSystem(sel.value); update(true); });
    root.querySelectorAll('.ss-filter').forEach(function (det) {
      det.addEventListener('change', function (e) {
        var set = state[det.dataset.f];
        if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
        state.shown = PAGE_SIZE; update(true);
      });
    });
    root.querySelector('.ss-clear').addEventListener('click', function () {
      FILTERS.forEach(function (f) { state[f[0]].clear(); });
      state.text = ''; state.lvl = ''; text.value = ''; lvl.value = ''; state.shown = PAGE_SIZE;
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
    sel.value = state.sys;
    setSystem(sel.value);
    text.value = state.text; lvl.value = state.lvl;
    update(false);
  }

  // the subsystem names the class types and the generic features' page
  function setSystem(id) {
    sys = data.systems.filter(function (s) { return s.id === id; })[0] || data.systems[0];
    state.sys = sys.id;
    sys.roles.forEach(function (n, i) { root.querySelector('.cf-r' + i).textContent = n; });
    root.querySelectorAll('.ss-filter').forEach(function (det) {
      var f = det.dataset.f;
      det.querySelector('.ss-opts').innerHTML = values(f).map(function (v) {
        return '<label><input type="checkbox" value="' + esc(v[0]) + '"' + (state[f].has(v[0]) ? ' checked' : '') + '> ' + v[1] + '</label>';
      }).join('');
    });
  }

  function placeOk(p) {
    return (!state.rol.size || state.rol.has(String(p.r))) && (!state.tie.size || state.tie.has(p.tier)) &&
      (!state.bnd.size || state.bnd.has(p.band)) && (state.lvl === '' || p.at <= Number(state.lvl));
  }

  function matches(f) {
    if (state.text) {
      var words = fold(state.text).split(/\s+/).filter(Boolean);
      for (var k = 0; k < words.length; k++) if (f.key.indexOf(words[k]) < 0) return false;
    }
    if (state.knd.size && !state.knd.has(f.k)) return false;
    if (state.cls.size && !state.cls.has(f.c)) return false;
    var ps = places(f);
    return ps.length > 0 && ps.some(placeOk);
  }

  // a role column's sort key: its best price, then its level; features not in that list go last
  function roleKey(f, r) {
    var best = null;
    places(f).forEach(function (p) {
      if (p.r !== r) return;
      var k = TIERS.indexOf(p.tier) * 100 + p.at;
      if (best === null || k < best) best = k;
    });
    return best === null ? 1e6 : best;
  }

  function cell(f, r) {
    return places(f).filter(function (p) { return p.r === r; }).map(function (p) {
      return '<span class="cf-tier cf-' + p.tier + '">' + TIER_NAME[p.tier] + '</span> <a href="' + new URL(sys.pages[r] + '#levels-' + p.band.replace('–', ''), BASE) +
        '" title="Levels ' + p.band + ' of the ' + esc(sys.roles[r]) + ' list">' + p.at + '</a>';
    }).join('<br>');
  }

  function update(push) {
    var list = feats.filter(matches);
    var q = fold(state.text);
    list.sort(function (a, b) {
      var r = 0;
      if (state.sort === 'class') r = a.c.localeCompare(b.c);
      else if (/^r\d$/.test(state.sort)) { var i = +state.sort[1]; r = roleKey(a, i) - roleKey(b, i); }
      if (!r && q) r = (b.nameKey.indexOf(q) === 0) - (a.nameKey.indexOf(q) === 0);
      return (r || a.nameKey.localeCompare(b.nameKey)) * (r ? state.dir : state.sort === 'name' ? state.dir : 1);
    });
    root.querySelector('tbody').innerHTML = list.slice(0, state.shown).map(function (f) {
      var href = f.g ? sys.dir + f.l : f.l;
      return '<tr><td><a href="' + new URL(href, BASE) + '">' + esc(f.n) + '</a></td><td>' + esc(f.c) + (f.k !== 'Class' && f.k !== 'Generic' ? ' <small>(' + esc(f.k.toLowerCase()) + ')</small>' : '') +
        '</td><td>' + cell(f, 0) + '</td><td>' + cell(f, 1) + '</td><td>' + cell(f, 2) + '</td><td class="ss-desc">' + esc(f.x ? f.x.replace(/\*/g, '') + ' ' : '') + esc(f.t) + '</td></tr>';
    }).join('');
    root.querySelector('.ss-status').textContent = list.length + ' of ' + feats.length + ' class features.';
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
    ['sys', 'text', 'lvl', 'sort'].concat(FILTERS.map(function (f) { return f[0]; })).forEach(function (k) { url.searchParams.delete(k); });
    if (state.sys !== data.systems[0].id) url.searchParams.set('sys', state.sys);
    if (state.text) url.searchParams.set('text', state.text);
    if (state.lvl !== '') url.searchParams.set('lvl', state.lvl);
    FILTERS.forEach(function (f) { if (state[f[0]].size) url.searchParams.set(f[0], Array.from(state[f[0]]).join('|')); });
    if (state.sort !== 'name' || state.dir < 0) url.searchParams.set('sort', state.sort + (state.dir < 0 ? '-' : ''));
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  function fromUrl() {
    var p = new URLSearchParams(location.search);
    state.sys = p.get('sys') || data.systems[0].id; state.text = p.get('text') || ''; state.lvl = p.get('lvl') || '';
    FILTERS.forEach(function (f) { state[f[0]] = new Set((p.get(f[0]) || '').split('|').filter(Boolean)); });
    var s = p.get('sort') || 'name'; state.dir = /-$/.test(s) ? -1 : 1; state.sort = s.replace(/-$/, '');
  }
})();
