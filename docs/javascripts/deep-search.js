// Deep Search (tools/deep-search.md): finds every section of the wiki whose text holds the words searched,
// and lists them by category with the matching sentence. Its data is built by tools/build-fulltext.js.
(function () {
  'use strict';
  var root = document.getElementById('deep-search');
  if (!root) return;

  var cfg = JSON.parse(document.getElementById('__config').textContent);
  var BASE = new URL(cfg.base.replace(/\/?$/, '/'), location.href);
  var DATA = new URL('search/deep/', BASE);

  var CATEGORIES = [
    ['characters/classes/legendary/', 'Legendary Classes'],
    ['characters/classes/', 'Classes'],
    ['characters/prestige-classes/', 'Prestige Classes'],
    ['characters/races/', 'Races'],
    ['rules/feats/', 'Feats'],
    ['magic/spells/', 'Spells'],
    ['magic/mythic-spells/', 'Mythic Spells'],
    ['magic/', 'Magic'],
    ['magic-items/', 'Magic Items'],
    ['equipment/', 'Equipment'],
    ['monsters/', 'Monsters'],
    ['characters/', 'Character Options'],
    ['rules/', 'Rules'],
    ['gamemastering/', 'Gamemastering'],
    ['campaign-systems/', 'Campaign Systems'],
    ['', 'Other'],
  ];
  var MAX_SECTIONS = 3000;

  root.innerHTML =
    '<form class="ds-form" role="search">' +
    '<input class="ds-input" type="search" name="find" placeholder="Words or phrase to find in every page" aria-label="Search the whole wiki" autocomplete="off">' +
    '<button class="md-button md-button--primary" type="submit">Search</button>' +
    '<div class="ds-options">' +
    '<label><input type="radio" name="mode" value="phrase" checked> Exact phrase</label>' +
    '<label><input type="radio" name="mode" value="all"> All the words, in any order</label>' +
    '<label><input type="checkbox" name="whole" checked> Whole words only</label>' +
    '</div></form>' +
    '<p class="ds-status" aria-live="polite"></p><nav class="ds-cats"></nav><div class="ds-results"></div>';

  var form = root.querySelector('form'), input = root.querySelector('.ds-input');
  var status = root.querySelector('.ds-status'), cats = root.querySelector('.ds-cats'), results = root.querySelector('.ds-results');

  var manifest = null, shards = [], loading = null, run = 0;

  function load(onProgress) {
    if (loading) return loading;
    loading = fetch(new URL('manifest.json', DATA)).then(function (r) {
      if (!r.ok) throw new Error('The search data is missing (' + r.status + ').');
      return r.json();
    }).then(function (m) {
      manifest = m;
      var done = 0;
      // fetch every shard in parallel, a few at a time
      var queue = m.shards.map(function (name, i) { return [name, i]; });
      function next() {
        var job = queue.shift();
        if (!job) return Promise.resolve();
        return fetch(new URL(job[0], DATA)).then(function (r) { return r.json(); }).then(function (docs) {
          shards[job[1]] = docs; done++; onProgress(done, m.shards.length); return next();
        });
      }
      return Promise.all([next(), next(), next(), next()]);
    });
    loading.catch(function () { loading = null; });
    return loading;
  }

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function pattern(words, whole) {
    var body = words.map(function (w) {
      return reEsc(w).replace(/['’‘]/g, "['’‘]").replace(/\\-/g, '[-–— ]?');
    }).join('\\s+');
    if (whole) body = (/^\w/.test(words[0]) ? '\\b' : '') + body + (/\w$/.test(words[words.length - 1]) ? '\\b' : '');
    return body;
  }

  function categoryOf(loc) {
    for (var i = 0; i < CATEGORIES.length; i++) if (loc.indexOf(CATEGORIES[i][0]) === 0) return i;
    return CATEGORIES.length - 1;
  }

  function snippet(text, re) {
    re.lastIndex = 0;
    var m = re.exec(text);
    if (!m) return esc(text.slice(0, 200)) + (text.length > 200 ? '…' : '');
    var a = Math.max(0, m.index - 110), b = Math.min(text.length, m.index + m[0].length + 140);
    if (a > 0) { var sp = text.indexOf(' ', a); if (sp > -1 && sp < m.index) a = sp + 1; }
    if (b < text.length) { var sp2 = text.lastIndexOf(' ', b); if (sp2 > m.index + m[0].length) b = sp2; }
    var part = text.slice(a, b);
    var hl = new RegExp(re.source, 'gi');
    var out = '', last = 0, x;
    while ((x = hl.exec(part))) { if (!x[0]) { hl.lastIndex++; continue; } out += esc(part.slice(last, x.index)) + '<mark>' + esc(x[0]) + '</mark>'; last = x.index + x[0].length; }
    out += esc(part.slice(last));
    return (a > 0 ? '…' : '') + out + (b < text.length ? '…' : '');
  }

  function search(q, mode, whole) {
    var words = q.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    var res = mode === 'all' ? words.map(function (w) { return new RegExp(pattern([w], whole), 'gi'); }) : [new RegExp(pattern(words, whole), 'gi')];
    var any = mode === 'all' ? new RegExp(words.map(function (w) { return pattern([w], whole); }).join('|'), 'gi') : res[0];
    var found = [], total = 0;
    for (var s = 0; s < shards.length; s++) {
      var docs = shards[s] || [];
      for (var d = 0; d < docs.length; d++) {
        var loc = docs[d][0], title = docs[d][1], text = docs[d][2], hits = 0, ok = true;
        for (var r = 0; r < res.length; r++) {
          res[r].lastIndex = 0;
          var c = (text.match(res[r]) || []).length + (title.match(res[r]) || []).length;
          if (!c) { ok = false; break; }
          hits += c;
        }
        if (!ok) continue;
        total += hits;
        found.push({ loc: loc, title: title, text: text, hits: hits, inTitle: any.test(title) });
        any.lastIndex = 0;
      }
    }
    return { found: found, total: total, any: any };
  }

  function render(q, r) {
    if (!r.found.length) { status.textContent = 'Nothing in the wiki holds “' + q + '”.'; cats.innerHTML = ''; results.innerHTML = ''; return; }
    var groups = CATEGORIES.map(function () { return new Map(); });
    r.found.forEach(function (f) {
      var page = f.loc.split('#')[0];
      var g = groups[categoryOf(page)];
      if (!g.has(page)) g.set(page, { page: page, title: manifest.pages[page] || f.title, hits: 0, inTitle: false, items: [] });
      var e = g.get(page); e.hits += f.hits; e.inTitle = e.inTitle || f.inTitle; e.items.push(f);
    });
    var pagesCount = groups.reduce(function (n, g) { return n + g.size; }, 0);
    status.textContent = r.found.length + ' sections in ' + pagesCount + ' pages hold “' + q + '” (' + r.total + ' times).' + (r.found.length > MAX_SECTIONS ? ' Showing the first ' + MAX_SECTIONS + ' sections.' : '');
    var nav = [], html = [], shown = 0;
    groups.forEach(function (g, i) {
      if (!g.size) return;
      var id = 'ds-cat-' + i, count = 0;
      g.forEach(function (e) { count += e.items.length; });
      nav.push('<a href="#' + id + '">' + esc(CATEGORIES[i][1]) + ' <span>' + g.size + '</span></a>');
      var list = Array.from(g.values()).sort(function (a, b) { return (b.inTitle - a.inTitle) || (b.hits - a.hits) || a.title.localeCompare(b.title); });
      html.push('<section class="ds-cat"><h2 id="' + id + '">' + esc(CATEGORIES[i][1]) + ' <small>' + g.size + ' pages, ' + count + ' sections</small></h2>');
      list.forEach(function (e) {
        if (shown >= MAX_SECTIONS) return;
        html.push('<div class="ds-page"><a class="ds-page__title" href="' + new URL(e.page, BASE) + '">' + esc(e.title) + '</a> <span class="ds-hits">' + e.hits + '</span>');
        e.items.forEach(function (f, k) {
          if (shown >= MAX_SECTIONS) return;
          shown++;
          var head = f.loc === e.page ? '' : '<a class="ds-sec" href="' + new URL(f.loc, BASE) + '">' + esc(f.title) + '</a> ';
          html.push((k === 3 && e.items.length > 4 ? '<details class="ds-more"><summary>' + (e.items.length - 3) + ' more sections on this page</summary>' : '') +
            '<p class="ds-hit">' + head + '<span class="ds-snip">' + snippet(f.text || f.title, new RegExp(r.any.source, 'gi')) + '</span></p>');
        });
        if (e.items.length > 4) html.push('</details>');
        html.push('</div>');
      });
      html.push('</section>');
    });
    cats.innerHTML = nav.join('');
    results.innerHTML = html.join('');
  }

  function go(push) {
    var q = input.value.trim(), mode = form.mode.value, whole = form.whole.checked;
    var url = new URL(location.href);
    if (q) url.searchParams.set('find', q); else url.searchParams.delete('find');
    if (mode === 'all') url.searchParams.set('mode', 'all'); else url.searchParams.delete('mode');
    if (!whole) url.searchParams.set('whole', '0'); else url.searchParams.delete('whole');
    history[push ? 'pushState' : 'replaceState'](null, '', url);
    if (!q) { status.textContent = ''; cats.innerHTML = ''; results.innerHTML = ''; return; }
    if (q.replace(/\s/g, '').length < 2) { status.textContent = 'Write at least 2 letters.'; return; }
    var my = ++run;
    status.textContent = 'Loading the wiki’s text…';
    load(function (done, all) { if (my === run) status.textContent = 'Loading the wiki’s text… ' + Math.round(100 * done / all) + '%'; })
      .then(function () {
        if (my !== run) return;
        status.textContent = 'Searching…';
        setTimeout(function () { if (my === run) render(q, search(q, mode, whole)); }, 0);
      })
      .catch(function (e) { status.textContent = 'The search could not load: ' + e.message; });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); go(true); });
  form.addEventListener('change', function (e) { if (e.target.name !== 'find' && input.value.trim()) go(false); });

  function fromUrl() {
    var p = new URLSearchParams(location.search);
    input.value = p.get('find') || '';
    form.mode.value = p.get('mode') === 'all' ? 'all' : 'phrase';
    form.whole.checked = p.get('whole') !== '0';
    if (input.value) go(false); else input.focus();
  }
  window.addEventListener('popstate', fromUrl);
  fromUrl();
})();
