// Item Search (tools/item-search.md): filters every magic item of the wiki by type, slot, aura school, aura strength,
// book and price. With no filters it lists every item. Its data is built by tools/build-items.js.
(function () {
  'use strict';
  var root = document.getElementById('item-search');
  if (!root) return;

  var cfg = JSON.parse(document.getElementById('__config').textContent);
  var BASE = new URL(cfg.base.replace(/\/?$/, '/'), location.href);
  var PAGE_SIZE = 200;
  var TYPE_ORDER = ['Armor', 'Shield', 'Weapon', 'Armor Special Ability', 'Weapon Special Ability', 'Potion or Oil', 'Ring', 'Rod', 'Staff', 'Wand', 'Scroll',
    'Wondrous Item', 'Artifact', 'Cursed Item', 'Intelligent Item',
    'Weapon (mundane)', 'Armor (mundane)', 'Shield (mundane)', 'Adventuring Gear', 'Tools and Skill Kits', 'Clothing', 'Food, Drink and Lodging', 'Mounts, Animals and Barding',
    'Transport', 'Services', 'Alchemical Items, Poisons and Drugs', 'Special Material', 'Technological Gear'];
  var SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation', 'universal'];
  var STRENGTHS = ['faint', 'moderate', 'strong', 'overwhelming'];

  var cap = function (s) { return s.replace(/(^|[\s(-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ''); }

  var items = [];
  var FILTERS = [['knd', 'Kind'], ['typ', 'Type'], ['slt', 'Slot'], ['sch', 'School'], ['str', 'Aura'], ['src', 'Book']];
  var state = { text: '', knd: new Set(), typ: new Set(), slt: new Set(), sch: new Set(), str: new Set(), src: new Set(), min: '', max: '', sort: 'name', dir: 1, shown: PAGE_SIZE };

  root.innerHTML = '<p class="ss-loading">Loading the items…</p>';

  fetch(new URL('tools/item-data.json', BASE)).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (data) {
    items = data.items;
    items.forEach(function (i) {
      i.tt = i.m && /^(Weapon|Armor|Shield)$/.test(i.t) ? i.t + ' (mundane)' : i.t;
      i.key = fold(i.n + ' ' + (i.x || ''));
      i.nameKey = fold(i.n);
      var au = fold(i.au || '');
      i.schools = SCHOOLS.filter(function (s) { return au.indexOf(s) >= 0; });
      i.strengths = STRENGTHS.filter(function (s) { return au.indexOf(s) >= 0; });
      i.slotKey = !i.m && i.t === 'Wondrous Item' ? (i.sl || 'slotless') : '';
    });
    build();
  }).catch(function (e) { root.innerHTML = '<p>The item list could not load (' + esc(e.message) + ').</p>'; });

  function valuesOf(i, f) {
    return f === 'knd' ? [i.m ? 'Mundane' : 'Magic'] : f === 'typ' ? [i.tt] : f === 'slt' ? (i.slotKey ? [i.slotKey] : []) : f === 'sch' ? i.schools : f === 'str' ? i.strengths : [i.b];
  }

  function values(f) {
    var count = new Map();
    items.forEach(function (i) { valuesOf(i, f).forEach(function (x) { count.set(x, (count.get(x) || 0) + 1); }); });
    var list = Array.from(count.keys());
    if (f === 'knd') list.sort().reverse();
    else if (f === 'typ') list.sort(function (a, b) { var x = TYPE_ORDER.indexOf(a), y = TYPE_ORDER.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b); });
    else if (f === 'sch') list.sort(function (a, b) { return SCHOOLS.indexOf(a) - SCHOOLS.indexOf(b); });
    else if (f === 'str') list.sort(function (a, b) { return STRENGTHS.indexOf(a) - STRENGTHS.indexOf(b); });
    else list.sort();
    return list.map(function (x) { return [x, (f === 'src' || f === 'typ' || f === 'knd' ? x : cap(x)) + ' <span>' + count.get(x) + '</span>']; });
  }

  function build() {
    var html = '<div class="ss-top"><input class="ss-text" type="search" placeholder="Name or words in the description" aria-label="Item name or words">' +
      '<label class="ss-price">Price <input class="ss-min" type="number" min="0" placeholder="min gp" aria-label="Minimum price in gp"> – ' +
      '<input class="ss-max" type="number" min="0" placeholder="max gp" aria-label="Maximum price in gp"></label>' +
      '<button type="button" class="md-button ss-clear">Clear filters</button></div><div class="ss-filters">';
    FILTERS.forEach(function (f) {
      html += '<details class="ss-filter" data-f="' + f[0] + '"><summary>' + f[1] + ' <b class="ss-count"></b></summary><div class="ss-opts">' +
        values(f[0]).map(function (v) { return '<label><input type="checkbox" value="' + esc(v[0]) + '"> ' + v[1] + '</label>'; }).join('') +
        '</div></details>';
    });
    html += '</div><p class="ss-note">Within one filter an item needs any of the ticked options; across filters it needs all of them. ' +
      'The Slot filter only applies to wondrous items. Items sold at a variable price or without a price are left out when a price range is set.</p>' +
      '<p class="ss-status" aria-live="polite"></p>' +
      '<div class="ss-table-wrap"><table class="ss-table"><thead><tr>' +
      '<th data-sort="name">Name</th><th data-sort="type">Type</th><th>Aura</th><th data-sort="cl">CL</th><th data-sort="price">Price</th><th>Weight</th><th>Book</th><th>Description</th>' +
      '</tr></thead><tbody></tbody></table></div><p class="ss-morewrap"><button type="button" class="md-button ss-more">Show more</button></p>';
    root.innerHTML = html;

    var text = root.querySelector('.ss-text'), min = root.querySelector('.ss-min'), max = root.querySelector('.ss-max'), t;
    text.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.text = text.value; state.shown = PAGE_SIZE; update(true); }, 150); });
    function prices() { clearTimeout(t); t = setTimeout(function () { state.min = min.value; state.max = max.value; state.shown = PAGE_SIZE; update(true); }, 250); }
    min.addEventListener('input', prices); max.addEventListener('input', prices);
    root.querySelectorAll('.ss-filter').forEach(function (det) {
      det.addEventListener('change', function (e) {
        var set = state[det.dataset.f];
        if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
        state.shown = PAGE_SIZE; update(true);
      });
    });
    root.querySelector('.ss-clear').addEventListener('click', function () {
      FILTERS.forEach(function (f) { state[f[0]].clear(); });
      state.text = ''; state.min = ''; state.max = ''; text.value = ''; min.value = ''; max.value = ''; state.shown = PAGE_SIZE;
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
    text.value = state.text; min.value = state.min; max.value = state.max;
    update(false);
  }

  function clNum(i) { var m = String(i.cl || '').match(/\d+/); return m ? parseInt(m[0], 10) : 99; }

  function matches(i) {
    if (state.text) {
      var words = fold(state.text).split(/\s+/).filter(Boolean);
      for (var k = 0; k < words.length; k++) if (i.key.indexOf(words[k]) < 0) return false;
    }
    for (var n = 0; n < FILTERS.length; n++) {
      var f = FILTERS[n][0], set = state[f];
      if (set.size && !valuesOf(i, f).some(function (x) { return set.has(x); })) return false;
    }
    if (state.min !== '' || state.max !== '') {
      if (i.p == null) return false;
      if (state.min !== '' && i.p < Number(state.min)) return false;
      if (state.max !== '' && i.p > Number(state.max)) return false;
    }
    return true;
  }

  function update(push) {
    var list = items.filter(matches);
    list.sort(function (a, b) {
      var r = 0;
      if (state.sort === 'type') r = TYPE_ORDER.indexOf(a.tt) - TYPE_ORDER.indexOf(b.tt) || (a.sl || '').localeCompare(b.sl || '');
      else if (state.sort === 'price') r = (a.p == null ? 1e12 : a.p) - (b.p == null ? 1e12 : b.p);
      else if (state.sort === 'cl') r = clNum(a) - clNum(b);
      if (!r && state.text) r = (b.nameKey.indexOf(fold(state.text)) === 0) - (a.nameKey.indexOf(fold(state.text)) === 0);
      return (r || a.n.localeCompare(b.n)) * (r ? state.dir : state.sort === 'name' ? state.dir : 1);
    });
    var body = root.querySelector('tbody');
    body.innerHTML = list.slice(0, state.shown).map(function (i) {
      var type = i.tt + (i.slotKey ? ' (' + i.slotKey + ')' : '');
      return '<tr><td><a href="' + new URL(i.u + '#' + i.a, BASE) + '">' + esc(i.n) + '</a></td><td>' + esc(type) + '</td><td>' + esc(i.au || '') + '</td><td>' + esc(i.cl || '') +
        '</td><td>' + esc(i.pt || '') + '</td><td>' + esc(i.w || '') + '</td><td>' + esc(i.b) + '</td><td class="ss-desc">' + esc(i.x) + '</td></tr>';
    }).join('');
    root.querySelector('.ss-status').textContent = list.length === items.length ? 'All ' + items.length + ' items.' : list.length + ' of ' + items.length + ' items.';
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
    ['text', 'knd', 'typ', 'slt', 'sch', 'str', 'src', 'min', 'max', 'sort'].forEach(function (k) { url.searchParams.delete(k); });
    if (state.text) url.searchParams.set('text', state.text);
    FILTERS.forEach(function (f) { if (state[f[0]].size) url.searchParams.set(f[0], Array.from(state[f[0]]).join('|')); });
    if (state.min !== '') url.searchParams.set('min', state.min);
    if (state.max !== '') url.searchParams.set('max', state.max);
    if (state.sort !== 'name' || state.dir < 0) url.searchParams.set('sort', state.sort + (state.dir < 0 ? '-' : ''));
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  function fromUrl() {
    var p = new URLSearchParams(location.search);
    state.text = p.get('text') || ''; state.min = p.get('min') || ''; state.max = p.get('max') || '';
    FILTERS.forEach(function (f) { state[f[0]] = new Set((p.get(f[0]) || '').split('|').filter(Boolean)); });
    var s = p.get('sort') || 'name'; state.dir = /-$/.test(s) ? -1 : 1; state.sort = s.replace(/-$/, '');
  }
})();
