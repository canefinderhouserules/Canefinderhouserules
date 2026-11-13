// Class pages: links each entry of the class table to its class feature, and (where archetype data exists)
// adds an archetype picker. Tick one or more archetypes and the page shows the class as you would get it:
// the table lists what you get at each level, and each class feature says what the archetypes take from it,
// with the archetype abilities placed right where the feature they replace was.
// Archetypes that change the same class feature are marked as conflicting.
// Data: tools/archetypes/<class>.json, built by tools/build-archetypes.js.
(function () {
  'use strict';
  var m = location.pathname.match(/\/characters\/classes\/(?:legendary\/)?([a-z0-9-]+)\/?$/);
  if (!m) return;
  var content = document.querySelector('.md-content .md-typeset');
  if (!content) return;
  var cfg = JSON.parse(document.getElementById('__config').textContent);
  var base = new URL(cfg.base.replace(/\/?$/, '/'), location.href);

  var ORD = function (n) { var s = n % 100 > 10 && n % 100 < 14 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'; return n + s; };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function fixLinks(html) { return html.replace(/href="@@([^"]*)"/g, function (_, h) { return 'href="' + (/^[a-z]+:/.test(h) ? h : new URL(h, base).href) + '"'; }); }
  function norm(s) { return String(s).toLowerCase().replace(/[’']/g, '').replace(/\((ex|su|sp)\)/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function stem(s) { return norm(s).replace(/\s*(\+?\d+(st|nd|rd|th)?|\d+d\d+|\d+ day)$/, '').replace(/\s+\d+$/, '').trim(); }

  // ---- the class table and its Special column ----
  var table = [].slice.call(content.querySelectorAll('table')).find(function (t) {
    var th = [].map.call(t.querySelectorAll('thead th'), function (x) { return x.textContent.trim().toLowerCase(); });
    return th[0] === 'level' && th.indexOf('special') >= 0;
  });
  if (!table) return;
  var si = [].map.call(table.querySelectorAll('thead th'), function (x) { return x.textContent.trim().toLowerCase(); }).indexOf('special');
  var rows = [];
  [].forEach.call(table.querySelectorAll('tbody tr'), function (tr) {
    var td = tr.children[si], lvl = parseInt(tr.children[0].textContent, 10);
    if (td && lvl) rows.push({ td: td, lvl: lvl });
  });
  // headings of the page, to link table entries to their class feature
  var heads = [].slice.call(content.querySelectorAll('h2[id], h3[id], h4[id]')).map(function (h) { return { id: h.id, n: norm(h.textContent.replace(/¶/g, '')) }; });
  function headingFor(label) {
    var s = stem(label); if (!s || s.length < 3) return null;
    var h = heads.find(function (x) { return x.n === s; }) || heads.find(function (x) { return x.n === s + 's' || x.n + 's' === s; }) ||
      heads.find(function (x) { return x.n.indexOf(s) === 0; }) || heads.find(function (x) { return s.indexOf(x.n) === 0 && x.n.length > 4; });
    return h ? h.id : null;
  }
  function linkLabel(label, id) {
    id = id || headingFor(label);
    return id ? '<a href="#' + id + '">' + esc(label) + '</a>' : esc(label);
  }
  // link the original table (every class page)
  rows.forEach(function (r) {
    if (r.td.querySelector('a')) { r.orig = r.td.innerHTML; return; }
    var parts = r.td.textContent.split(/,(?![^(]*\))/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length && parts[0] !== '—' && parts[0] !== '-') r.td.innerHTML = parts.map(function (p) { return linkLabel(p); }).join(', ');
    r.orig = r.td.innerHTML;
  });

  fetch(new URL('tools/archetypes/' + m[1] + '.json', base)).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.archetypes.length) init(d); }).catch(function () {});

  function init(d) {
    var units = {}; d.units.forEach(function (u) { units[u.id] = u; });
    d.archetypes.forEach(function (a, i) {
      a.i = i; a.touch = {};
      a.abilities.forEach(function (b) { b.replaces.concat(b.modifies).forEach(function (id) { a.touch[id] = true; }); });
    });
    // "bravery +1 ... +5" -> "bravery"; two of eleven bonus feats -> "bonus feat (1st, 2nd level)"
    function names(ids) {
      var out = [], done = {};
      ids.forEach(function (id) {
        var u = units[id]; if (done[u.base]) return; done[u.base] = true;
        var all = d.units.filter(function (x) { return x.base === u.base; });
        var mine = all.filter(function (x) { return ids.indexOf(x.id) >= 0; });
        var name = u.label.replace(/\s*(\+?\d+)$/, '');
        if (mine.length === all.length) out.push(name);
        else if (mine.every(function (x) { return /\d$/.test(x.label); }) && !/^bonus/i.test(name)) out.push(name + ' ' + mine.map(function (x) { return x.label.match(/(\+?\d+)$/)[1]; }).join(', '));
        else out.push(name + ' (' + mine.map(function (x) { return ORD(x.lvl); }).join(', ') + ' level)');
      });
      return out.join('; ');
    }
    var byAnchor = {}; d.archetypes.forEach(function (a) { byAnchor[a.anchor] = a; });

    // ---- the picker, right above the class table ----
    var box = el('details', 'ap');
    box.innerHTML = '<summary><span class="ap-title">Archetypes</span> <span class="ap-count"></span><span class="ap-hint">Tick archetypes to see the class with them</span></summary>' +
      '<div class="ap-body"><div class="ap-top"><input type="search" class="ap-search" placeholder="Filter archetypes…" aria-label="Filter archetypes">' +
      '<button type="button" class="ap-clear md-button">Clear</button></div>' +
      '<div class="ap-msg" role="status"></div><p class="ap-legend">Struck-out archetypes change the same class features as one you ticked (hover them to see which).</p><div class="ap-list"></div></div>';
    var anchor = table; while (anchor.parentNode !== content) anchor = anchor.parentNode;
    var cap = anchor.previousElementSibling;
    if (cap && cap.tagName === 'P' && /^table\b/i.test(cap.textContent.trim())) anchor = cap;
    content.insertBefore(box, anchor);
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

    // sections: heading id -> elements until the next heading of the same or a higher level
    function section(id) {
      var h = document.getElementById(id); if (!h || !/^H[1-6]$/.test(h.tagName)) return null;
      var lv = +h.tagName[1], els = [], n = h.nextElementSibling;
      while (n && !(/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= lv)) { if (!n.classList.contains('ap-x')) els.push(n); n = n.nextElementSibling; }
      return { h: h, els: els };
    }
    var secs = {};
    d.units.forEach(function (u) { if (u.sec && !secs[u.sec]) { var s = section(u.sec); if (s) secs[u.sec] = s; } });
    // abilities that replace nothing go at the end of the class features
    var cf = document.getElementById('class-features');
    var endMark = cf; if (cf) { var n = cf.nextElementSibling; while (n && !(/^H[12]$/.test(n.tagName))) { endMark = n; n = n.nextElementSibling; } }
    var extra = el('div', 'ap-x ap-extra'); extra.hidden = true;
    if (endMark) endMark.parentNode.insertBefore(extra, endMark.nextSibling);

    function abId(x) { return 'ap-' + x.a.anchor + '-' + x.b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''); }
    function abLevel(x) {
      if (x.b.lvl) return x.b.lvl;
      var ids = x.b.replaces.concat(x.b.modifies); return ids.length ? Math.min.apply(null, ids.map(function (id) { return units[id].lvl; })) : 1;
    }
    function link(x) { return '<a href="#' + abId(x) + '">' + esc(x.b.name.replace(/\s*\((Ex|Su|Sp)\)$/, '')) + '</a>'; }
    function abilityHtml(x) {
      var rep = x.b.replaces.length ? names(x.b.replaces) : '', mod = x.b.modifies.length ? names(x.b.modifies) : '';
      return '<div class="ap-ab ap-x" id="' + abId(x) + '"><h4>' + esc(x.b.name) + ' <span class="ap-tag">' + esc(x.a.name) + '</span>' +
        (x.b.lvl ? ' <span class="ap-lvl">' + ORD(x.b.lvl) + ' level</span>' : '') + '</h4>' +
        ((rep || mod) ? '<p class="ap-rep">' + (rep ? 'Replaces ' + esc(rep) : '') + (rep && mod ? '. ' : '') + (mod ? 'Modifies ' + esc(mod) : '') + '.</p>' : '') +
        fixLinks(x.b.html) + '</div>';
    }

    function update() {
      var sel = d.archetypes.filter(function (a) { return a.box.checked; });
      // conflicts: two archetypes that change the same class feature
      d.archetypes.forEach(function (a) {
        var clash = sel.filter(function (b) { return b !== a && Object.keys(a.touch).some(function (id) { return b.touch[id]; }); });
        a.label.classList.toggle('ap-clash', clash.length > 0);
        a.label.classList.toggle('ap-clash-sel', clash.length > 0 && a.box.checked);
        a.label.querySelector('.ap-why').textContent = clash.length && a.box.checked ? 'conflicts with ' + clash.map(function (b) { return b.name; }).join(', ') : '';
        a.label.title = clash.length ? 'Changes the same class features as ' + clash.map(function (b) {
          return b.name + ' (' + names(Object.keys(a.touch).filter(function (id) { return b.touch[id]; })) + ')';
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
      abil.sort(function (p, q) { return abLevel(p) - abLevel(q) || p.a.name.localeCompare(q.a.name); });

      // the class table: what you get at each level
      rows.forEach(function (row) {
        if (!sel.length) { row.td.innerHTML = row.orig; return; }
        var parts = d.units.filter(function (u) { return u.lvl === row.lvl && u.base !== 'class skills' && !/proficien/.test(u.base); }).map(function (u) {
          var f = fate[u.id];
          if (!f) return linkLabel(u.label, u.sec);
          return f.kind === 'replaced' ? '<del title="Replaced by ' + esc(f.by.map(function (x) { return x.b.name; }).join(', ')) + '">' + esc(u.label) + '</del>'
            : linkLabel(u.label, u.sec) + '<sup title="Modified by ' + esc(f.by.map(function (x) { return x.b.name; }).join(', ')) + '">*</sup>';
        });
        abil.forEach(function (x) { if (abLevel(x) === row.lvl && (x.b.lvl || x.b.replaces.length) && !/proficien|^(class )?skills/i.test(x.b.name)) parts.push('<span class="ap-new">' + link(x) + '</span>'); });
        row.td.innerHTML = parts.join(', ') || '—';
      });

      // class feature sections: a note on what changes, and the archetype abilities in place
      [].forEach.call(content.querySelectorAll('.ap-note, .ap-ab'), function (e) { if (!extra.contains(e)) e.remove(); });
      var placed = {};
      Object.keys(secs).forEach(function (id) {
        var s = secs[id];
        var own = d.units.filter(function (u) { return u.sec === id; });
        var hit = own.filter(function (u) { return fate[u.id]; });
        var gone = own.length > 0 && hit.length === own.length && hit.every(function (u) { return fate[u.id].kind === 'replaced'; });
        s.h.classList.toggle('ap-gone-h', gone);
        s.els.forEach(function (e) { e.classList.toggle('ap-gone', gone); });
        if (!hit.length) return;
        var lost = hit.filter(function (u) { return fate[u.id].kind === 'replaced'; });
        var kept = own.filter(function (u) { return !fate[u.id] || fate[u.id].kind !== 'replaced'; });
        var who = [], seen = {};
        hit.forEach(function (u) { fate[u.id].by.forEach(function (x) { var k = abId(x); if (!seen[k]) { seen[k] = 1; who.push(x); } }); });
        var note = el('div', 'ap-note ap-x admonition ' + (gone ? 'failure' : lost.length ? 'warning' : 'info'));
        var title = gone ? 'You don’t get this class feature' : lost.length ? 'Your archetype takes part of this class feature' : 'Your archetype changes this class feature';
        var body = '';
        if (lost.length && !gone) body += '<p><strong>You lose:</strong> ' + esc(names(lost.map(function (u) { return u.id; }))) + '.</p>' +
          (kept.length ? '<p><strong>You still get:</strong> ' + esc(names(kept.map(function (u) { return u.id; }))) + '.</p>' : '');
        body += '<p>' + who.map(function (x) {
          var r = x.b.replaces.filter(function (i) { return units[i].sec === id; }), mo = x.b.modifies.filter(function (i) { return units[i].sec === id; });
          return link(x) + ' <span class="ap-tag">' + esc(x.a.name) + '</span> ' + (r.length ? 'replaces ' + esc(names(r)) : '') + (r.length && mo.length ? '; ' : '') + (mo.length ? 'modifies ' + esc(names(mo)) : '');
        }).join('<br>') + '</p>';
        if (gone) body += '<p><button type="button" class="ap-show">Show the original text</button></p>';
        note.innerHTML = '<p class="admonition-title">' + title + '</p>' + body;
        s.h.parentNode.insertBefore(note, s.h.nextElementSibling);
        // the abilities that replace or change this feature go right below its text
        var after = s.els.length ? s.els[s.els.length - 1] : note;
        who.forEach(function (x) {
          var k = abId(x); if (placed[k]) return; placed[k] = 1;
          var div = el('div'); div.innerHTML = abilityHtml(x);
          var ab = div.firstChild; after.parentNode.insertBefore(ab, after.nextSibling); after = ab;
        });
        var btn = note.querySelector('.ap-show');
        if (btn) btn.addEventListener('click', function () {
          var hide = !s.els[0] || !s.els[0].classList.contains('ap-gone');
          s.els.forEach(function (e) { e.classList.toggle('ap-gone', hide); });
          btn.textContent = hide ? 'Show the original text' : 'Hide the original text';
        });
      });

      // the rest: archetype abilities that replace nothing
      var rest = abil.filter(function (x) { return !placed[abId(x)]; });
      extra.hidden = !rest.length && !sel.some(function (a) { return a.intro; });
      if (!extra.hidden) {
        extra.innerHTML = '<h3 id="archetype-features">Other Archetype Features</h3><p class="ap-sub">Abilities of ' + sel.map(function (a) {
          return '<a href="' + new URL(a.page + '#' + a.anchor, base).href + '">' + esc(a.name) + '</a>';
        }).join(', ') + ' that don’t replace a class feature.</p>' +
          sel.filter(function (a) { return a.intro; }).map(function (a) { return '<div class="ap-intro"><strong>' + esc(a.name) + ':</strong> ' + fixLinks(a.intro).replace(/^<p>|<\/p>$/g, '') + '</div>'; }).join('') +
          rest.map(abilityHtml).join('');
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
