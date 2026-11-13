// Archetype picker for class pages: tick one or more archetypes and the page shows the class as you would get it.
// Replaced class features are hidden, modified ones get a note, and the archetype abilities appear in their own section
// and in the class table. Archetypes that change the same class feature are marked as conflicting.
// Data: tools/archetypes/<class>.json, built by tools/build-archetypes.js.
(function () {
  'use strict';
  var m = location.pathname.match(/\/characters\/classes\/([a-z0-9-]+)\/?$/);
  var h2 = document.getElementById('class-features');
  if (!m || !h2) return;
  var cfg = JSON.parse(document.getElementById('__config').textContent);
  var base = new URL(cfg.base.replace(/\/?$/, '/'), location.href);
  var cls = m[1];
  fetch(new URL('tools/archetypes/' + cls + '.json', base)).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.archetypes.length) init(d); }).catch(function () {});

  var ORD = function (n) { var s = n % 100 > 10 && n % 100 < 14 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'; return n + s; };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function fixLinks(html) { return html.replace(/href="@@([^"]*)"/g, function (_, h) { return 'href="' + (/^[a-z]+:/.test(h) ? h : new URL(h, base).href) + '"'; }); }

  function init(d) {
    var units = {}; d.units.forEach(function (u) { units[u.id] = u; });
    d.archetypes.forEach(function (a, i) {
      a.i = i; a.touch = {};
      a.abilities.forEach(function (b) { b.replaces.concat(b.modifies).forEach(function (id) { a.touch[id] = true; }); });
    });
    var byAnchor = {}; d.archetypes.forEach(function (a) { byAnchor[a.anchor] = a; });

    // ---- the picker ----
    var box = el('details', 'ap');
    box.innerHTML = '<summary><span class="ap-title">Archetypes</span> <span class="ap-count"></span><span class="ap-hint">Tick archetypes to see the class with them</span></summary>' +
      '<div class="ap-body"><div class="ap-top"><input type="search" class="ap-search" placeholder="Filter archetypes…" aria-label="Filter archetypes">' +
      '<button type="button" class="ap-clear md-button">Clear</button></div>' +
      '<div class="ap-msg" role="status"></div><div class="ap-list"></div></div>';
    h2.parentNode.insertBefore(box, h2);
    var list = box.querySelector('.ap-list'), msg = box.querySelector('.ap-msg'), count = box.querySelector('.ap-count');
    d.archetypes.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (a) {
      var lab = el('label', 'ap-item');
      lab.innerHTML = '<input type="checkbox" value="' + a.i + '"> <span class="ap-name">' + esc(a.name) + '</span>' +
        ' <a class="ap-ext" href="' + new URL(a.page + '#' + a.anchor, base).href + '" title="Open the archetype" target="_blank" rel="noopener">↗</a><span class="ap-why"></span>';
      a.label = lab; a.box = lab.querySelector('input');
      list.appendChild(lab);
    });
    box.querySelector('.ap-search').addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      d.archetypes.forEach(function (a) { a.label.hidden = q && a.name.toLowerCase().indexOf(q) < 0; });
    });
    box.querySelector('.ap-clear').addEventListener('click', function () { d.archetypes.forEach(function (a) { a.box.checked = false; }); update(); });
    list.addEventListener('change', update);

    // ---- page parts we change ----
    var table = [].slice.call(document.querySelectorAll('.md-typeset table')).find(function (t) {
      return [].some.call(t.querySelectorAll('th'), function (th) { return /^special$/i.test(th.textContent.trim()); });
    });
    var special = [];
    if (table) {
      var si = [].findIndex.call(table.querySelectorAll('thead th'), function (th) { return /^special$/i.test(th.textContent.trim()); });
      [].forEach.call(table.querySelectorAll('tbody tr'), function (tr) {
        var td = tr.children[si], lvl = parseInt(tr.children[0].textContent, 10);
        if (td) special.push({ td: td, lvl: lvl, orig: td.innerHTML });
      });
    }
    // sections: heading id -> elements until the next heading of the same or a higher level
    function section(id) {
      var h = document.getElementById(id); if (!h || !/^H[1-6]$/.test(h.tagName)) return null;
      var lv = +h.tagName[1], els = [], n = h.nextElementSibling;
      while (n && !(/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= lv) && !n.classList.contains('ap')) { els.push(n); n = n.nextElementSibling; }
      return { h: h, els: els };
    }
    var secs = {};
    d.units.forEach(function (u) { if (u.sec && !secs[u.sec]) { var s = section(u.sec); if (s) secs[u.sec] = s; } });
    var added = el('div', 'ap-added'); added.hidden = true;
    var firstH3 = h2.nextElementSibling; while (firstH3 && !/^H[1-3]$/.test(firstH3.tagName)) firstH3 = firstH3.nextElementSibling;
    h2.parentNode.insertBefore(added, firstH3);

    function update() {
      var sel = d.archetypes.filter(function (a) { return a.box.checked; });
      // conflicts: two archetypes that change the same class feature
      d.archetypes.forEach(function (a) {
        var clash = sel.filter(function (b) { return b !== a && Object.keys(a.touch).some(function (id) { return b.touch[id]; }); });
        a.label.classList.toggle('ap-clash', clash.length > 0);
        a.label.querySelector('.ap-why').textContent = clash.length ? ' — conflicts with ' + clash.map(function (b) { return b.name; }).join(', ') : '';
        a.label.title = clash.length ? 'Changes the same class features as ' + clash.map(function (b) {
          return b.name + ' (' + Object.keys(a.touch).filter(function (id) { return b.touch[id]; }).map(function (id) { return units[id].label; }).join(', ') + ')';
        }).join('; ') : '';
      });
      var bad = sel.filter(function (a) { return a.label.classList.contains('ap-clash'); });
      msg.innerHTML = bad.length ? '<strong>These archetypes change the same class features</strong>, so they cannot be combined: ' + bad.map(function (a) { return esc(a.name); }).join(', ') + '. Hover an archetype to see which features.' : '';
      count.textContent = sel.length ? sel.length + ' selected' : '';
      box.classList.toggle('ap-on', sel.length > 0);

      // what happens to each class feature
      var fate = {}; // unit id -> {kind, by:[{a, b}]}
      var abil = [];
      sel.forEach(function (a) {
        a.abilities.forEach(function (b) {
          abil.push({ a: a, b: b });
          b.replaces.forEach(function (id) { (fate[id] = fate[id] || { kind: 'replaced', by: [] }).by.push({ a: a, b: b }); fate[id].kind = 'replaced'; });
          b.modifies.forEach(function (id) { var f = fate[id] = fate[id] || { kind: 'modified', by: [] }; f.by.push({ a: a, b: b }); });
        });
      });
      function abId(x) { return 'ap-' + x.a.anchor + '-' + x.b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''); }
      function abLevel(x) {
        if (x.b.lvl) return x.b.lvl;
        var ids = x.b.replaces.concat(x.b.modifies); return ids.length ? Math.min.apply(null, ids.map(function (id) { return units[id].lvl; })) : 1;
      }
      function link(x) { return '<a href="#' + abId(x) + '">' + esc(x.b.name.replace(/\s*\((Ex|Su|Sp)\)$/, '')) + '</a>'; }

      // the class table
      special.forEach(function (row) {
        if (!sel.length) { row.td.innerHTML = row.orig; return; }
        var parts = d.units.filter(function (u) { return u.lvl === row.lvl && u.base !== 'class skills' && !/proficien/.test(u.base); }).map(function (u) {
          var f = fate[u.id];
          if (!f) return esc(u.label);
          return f.kind === 'replaced' ? '<del title="Replaced">' + esc(u.label) + '</del>' : esc(u.label) + '<sup title="Modified by ' + esc(f.by.map(function (x) { return x.b.name; }).join(', ')) + '">*</sup>';
        });
        abil.forEach(function (x) { if (abLevel(x) === row.lvl && (x.b.lvl || x.b.replaces.length || x.b.modifies.length)) parts.push('<span class="ap-new">' + link(x) + '</span>'); });
        row.td.innerHTML = parts.join(', ') || '—';
      });

      // class feature sections
      Object.keys(secs).forEach(function (id) {
        var s = secs[id];
        var own = d.units.filter(function (u) { return u.sec === id; });
        var hit = own.filter(function (u) { return fate[u.id]; });
        var gone = own.length && hit.length === own.length && hit.every(function (u) { return fate[u.id].kind === 'replaced'; });
        var note = s.h.nextElementSibling && s.h.nextElementSibling.classList.contains('ap-note') ? s.h.nextElementSibling : null;
        if (!note) { note = el('div', 'ap-note admonition'); s.h.parentNode.insertBefore(note, s.h.nextElementSibling); }
        s.h.classList.toggle('ap-gone-h', !!gone);
        s.els.forEach(function (e) { e.classList.toggle('ap-gone', !!gone); });
        if (!hit.length) { note.hidden = true; return; }
        // group by ability
        var lines = [], seen = {};
        hit.forEach(function (u) {
          fate[u.id].by.forEach(function (x) {
            var k = abId(x); if (!seen[k]) { seen[k] = { x: x, rep: [], mod: [] }; lines.push(seen[k]); }
            (x.b.replaces.indexOf(u.id) >= 0 ? seen[k].rep : seen[k].mod).push(u.label);
          });
        });
        note.hidden = false;
        note.className = 'ap-note admonition ' + (gone ? 'failure' : 'warning');
        note.innerHTML = '<p class="admonition-title">' + (gone ? 'Replaced by your archetype' : 'Changed by your archetype') + '</p>' +
          lines.map(function (l) {
            return '<p>' + link(l.x) + ' <span class="ap-tag">' + esc(l.x.a.name) + '</span> ' +
              (l.rep.length ? 'replaces ' + esc(l.rep.join(', ')) : '') + (l.rep.length && l.mod.length ? '; ' : '') + (l.mod.length ? 'modifies ' + esc(l.mod.join(', ')) : '') + '</p>';
          }).join('') + (gone ? '<p><button type="button" class="ap-show">Show the original text</button></p>' : '');
        var btn = note.querySelector('.ap-show');
        if (btn) btn.addEventListener('click', function () { s.els.forEach(function (e) { e.classList.toggle('ap-gone'); }); btn.textContent = s.els[0] && s.els[0].classList.contains('ap-gone') ? 'Show the original text' : 'Hide the original text'; });
      });

      // the archetype abilities, by level
      added.hidden = !sel.length;
      if (sel.length) {
        abil.sort(function (p, q) { return abLevel(p) - abLevel(q) || p.a.name.localeCompare(q.a.name); });
        added.innerHTML = '<h3 id="archetype-features">Archetype Features</h3><p class="ap-sub">From ' + sel.map(function (a) {
          return '<a href="' + new URL(a.page + '#' + a.anchor, base).href + '">' + esc(a.name) + '</a>';
        }).join(', ') + '. Each ability says which class features it replaces.</p>' +
          sel.filter(function (a) { return a.intro; }).map(function (a) { return '<div class="ap-intro"><strong>' + esc(a.name) + ':</strong> ' + fixLinks(a.intro).replace(/^<p>|<\/p>$/g, '') + '</div>'; }).join('') +
          abil.map(function (x) {
            var rep = x.b.replaces.map(function (id) { return units[id].label; }), mod = x.b.modifies.map(function (id) { return units[id].label; });
            return '<div class="ap-ab" id="' + abId(x) + '"><h4>' + esc(x.b.name) + ' <span class="ap-tag">' + esc(x.a.name) + '</span>' +
              (x.b.lvl ? ' <span class="ap-lvl">' + ORD(x.b.lvl) + ' level</span>' : '') + '</h4>' +
              ((rep.length || mod.length) ? '<p class="ap-rep">' + (rep.length ? 'Replaces ' + esc(rep.join(', ')) : '') + (rep.length && mod.length ? '. ' : '') + (mod.length ? 'Modifies ' + esc(mod.join(', ')) : '') + '</p>' : '') +
              fixLinks(x.b.html) + '</div>';
          }).join('');
      }
      // keep the choice in the address
      var u = new URL(location.href);
      if (sel.length) u.searchParams.set('arch', sel.map(function (a) { return a.anchor; }).join(','));
      else u.searchParams.delete('arch');
      history.replaceState(null, '', u);
    }

    var pre = new URL(location.href).searchParams.get('arch');
    if (pre) { pre.split(',').forEach(function (k) { if (byAnchor[k]) byAnchor[k].box.checked = true; }); box.open = true; update(); }
  }
})();
