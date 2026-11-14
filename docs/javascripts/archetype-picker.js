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

  fetch(new URL('tools/archetypes/' + m[1] + '.json', base), { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.archetypes.length) init(d); }).catch(function () {});

  function init(d) {
    var units = {}; d.units.forEach(function (u) { units[u.id] = u; });
    d.archetypes.forEach(function (a, i) {
      a.i = i; a.touch = {};
      a.abilities.forEach(function (b, k) { b.k = k; });
      a.abilities.forEach(function (b) { b.replaces.concat(b.modifies).forEach(function (id) { a.touch[id] = true; }); });
      // how it changes each feature: 3 replaces, 2 changes, 1 only adds something (takes nothing away)
      a.how = {};
      a.abilities.forEach(function (b) {
        b.modifies.forEach(function (id) { a.how[id] = Math.max(a.how[id] || 0, b.adds ? 1 : 2); });
        b.replaces.forEach(function (id) { a.how[id] = 3; });
        // class skills: which skills it adds and removes
        if (b.skills) {
          a.sk = a.sk || { add: [], rem: [], all: false, ranks: false };
          a.sk.add = a.sk.add.concat(b.skills.add || []); a.sk.rem = a.sk.rem.concat(b.skills.rem || []);
          a.sk.all = a.sk.all || !!b.skills.all; a.sk.ranks = a.sk.ranks || !!b.skills.ranks;
        }
      });
    });
    // the same skill ("knowledge (*)" is every Knowledge skill, "*" every skill)
    function sameSkill(x, y) {
      return x === y || x === '*' || y === '*' || (x === 'knowledge (*)' && /^knowledge/.test(y)) || (y === 'knowledge (*)' && /^knowledge/.test(x));
    }
    // class skills: two archetypes clash only if one removes a skill the other adds (or both change skill ranks,
    // or one rewrites the whole list); changing different skills mixes fine
    function skillClash(a, b) {
      if (!a.sk || !b.sk) return null;
      if (a.sk.all || b.sk.all) return ['the whole class skill list'];
      var out = [];
      if (a.sk.ranks && b.sk.ranks) out.push('skill ranks per level');
      function opp(p, q) { p.rem.forEach(function (x) { q.add.forEach(function (y) { if (sameSkill(x, y) && x !== '(other)' && y !== '(other)') out.push(x === '*' ? y : x); }); }); }
      opp(a.sk, b.sk); opp(b.sk, a.sk);
      return out.filter(function (x, i) { return out.indexOf(x) === i; });
    }
    // two archetypes on one feature: fine if either only adds to it; a house-rule mix if one changes it and the other
    // removes it altogether (the change is simply lost); otherwise they clash
    function pair(a, b) {
      var shared = Object.keys(a.how).filter(function (id) { return b.how[id]; });
      var res = { clash: [], house: [], skills: [] };
      shared.forEach(function (id) {
        var x = a.how[id], y = b.how[id];
        if (id === 'class-skills-1') {
          var s = skillClash(a, b);
          if (s) { if (s.length) { res.clash.push(id); res.skills = s; } return; }
        }
        if (x === 1 || y === 1) return;
        (x !== y ? res.house : res.clash).push(id);
      });
      return res;
    }
    // "bravery +1 ... +5" -> "bravery"; two of eleven bonus feats -> "bonus feat (1st, 2nd level)"
    function names(ids) {
      var out = [], done = {};
      ids.forEach(function (id) {
        var u = units[id]; if (done[u.base]) return; done[u.base] = true;
        var all = d.units.filter(function (x) { return x.base === u.base; });
        var mine = all.filter(function (x) { return ids.indexOf(x.id) >= 0; });
        var name = u.label.replace(/\s*(\d+d\d+|\+?\d+)$/, '');
        if (mine.length === all.length) out.push(name);
        else if (mine.every(function (x) { return /\d$/.test(x.label); }) && !/^bonus/i.test(name)) out.push(name + ' ' + mine.map(function (x) { return x.label.match(/(\d+d\d+|\+?\d+)$/)[1]; }).join(', '));
        else out.push(name + ' (' + mine.map(function (x) { return ORD(x.lvl); }).join(', ') + ' level)');
      });
      return out.join('; ');
    }
    var byAnchor = {}; d.archetypes.forEach(function (a) { byAnchor[a.anchor] = a; });
    // house rules written in the archetypes: "can no longer be combined with X", "may still be combined with X"
    function lists(a, key, b) { return (a[key] || []).some(function (n) { return norm(n) === norm(b.name); }); }
    function forbidden(a, b) { return lists(a, 'excl', b) || lists(b, 'excl', a); }
    function allowed(a, b) { return lists(a, 'allow', b) || lists(b, 'allow', a); }

    // ---- the picker, right above the class table ----
    var box = el('details', 'ap');
    box.innerHTML = '<summary><span class="ap-title">Archetypes</span> <span class="ap-count"></span><span class="ap-hint">Tick archetypes to see the class with them</span></summary>' +
      '<div class="ap-body"><div class="ap-top"><input type="search" class="ap-search" placeholder="Filter archetypes…" aria-label="Filter archetypes">' +
      '<button type="button" class="ap-clear md-button">Clear</button></div>' +
      '<div class="ap-msg" role="status"></div><p class="ap-legend">Archetypes marked “banned” can’t be used under the house rules. Other archetypes in red change the same class features as one you ticked, so the rules don’t normally let you combine them; you can still tick them (for a house rule). <span class="ap-hr">Violet</span> ones can be mixed by house rule: one removes a class feature the other only changes, and that change is simply lost. Changes that only add something to a feature (an extra option, spell or skill) never block a mix. Hover an archetype to see why.</p><div class="ap-list"></div></div>';
    var anchor = table; while (anchor.parentNode !== content) anchor = anchor.parentNode;
    var cap = anchor.previousElementSibling;
    if (cap && cap.tagName === 'P' && /^table\b/i.test(cap.textContent.trim())) anchor = cap;
    content.insertBefore(box, anchor);
    var list = box.querySelector('.ap-list'), msg = box.querySelector('.ap-msg'), count = box.querySelector('.ap-count');
    // archetypes first, then the alternate class features (each one ticked on its own, like a small archetype)
    var altHead = null;
    d.archetypes.slice().sort(function (a, b) { return (a.kind === 'alt') - (b.kind === 'alt') || a.name.localeCompare(b.name); }).forEach(function (a) {
      if (a.kind === 'alt' && !altHead) {
        altHead = el('div', 'ap-sub');
        altHead.innerHTML = '<strong>Alternate class features</strong> — not archetypes: each swaps one class feature and can be mixed with archetypes that leave that feature alone.';
        list.appendChild(altHead);
      }
      var lab = el('label', 'ap-item' + (a.kind === 'alt' ? ' ap-alt' : ''));
      lab.innerHTML = '<input type="checkbox" value="' + a.i + '"> <span class="ap-name">' + esc(a.name) + '</span>' +
        ' <a class="ap-ext" href="' + new URL(a.page + '#' + (a.link || a.anchor), base).href + '" title="' + (a.kind === 'alt' ? 'Open the alternate class features' : 'Open the archetype') + '" target="_blank" rel="noopener">↗</a>' +
        (a.kind === 'alt' ? ' <span class="ap-alttag">alt · ' + esc(a.instead) + '</span>' : '') + '<span class="ap-why"></span>' + (a.banned ? ' <span class="ap-ban">banned</span>' : '');
      a.label = lab; a.box = lab.querySelector('input');
      if (a.banned) lab.classList.add('ap-banned');
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
    // class feature headings in page order (the sections of the table's features), with the level each is first gained,
    // for placing abilities that replace nothing
    var seen = {}, order = [];
    d.units.forEach(function (u) {
      if (u.sub || !u.sec || seen[u.sec] || !secs[u.sec]) return; seen[u.sec] = 1;
      var us = d.units.filter(function (x) { return x.sec === u.sec; });
      order.push({ h: secs[u.sec].h, lvl: Math.min.apply(null, us.map(function (x) { return x.lvl; })) });
    });
    order.sort(function (p, q) { return p.h.compareDocumentPosition(q.h) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    order = order.filter(function (o) { return o.h.id !== 'class-skills'; });
    var lastSec = order.length ? secs[order[order.length - 1].h.id] : null;
    var endMark = lastSec ? (lastSec.els[lastSec.els.length - 1] || lastSec.h) : null;
    // archetype summaries go before the first class feature; abilities with no later feature go after the last one
    var extra = el('div', 'ap-x ap-extra'); extra.hidden = true;
    if (order.length) order[0].h.parentNode.insertBefore(extra, order[0].h);
    var tail = el('div', 'ap-x'); if (endMark) endMark.parentNode.insertBefore(tail, endMark.nextSibling);

    function abId(x) { return 'ap-' + x.a.anchor + '-' + x.b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '') + (x.a.abilities.filter(function (o) { return o.name === x.b.name; }).length > 1 ? '-' + x.b.k : ''); }
    function abLevel(x) {
      if (x.b.lvl) return x.b.lvl;
      var ids = x.b.replaces.concat(x.b.modifies); return ids.length ? Math.min.apply(null, ids.map(function (id) { return units[id].lvl; })) : 1;
    }
    function link(x) { return '<a href="#' + abId(x) + '">' + esc(x.b.name.replace(/\s*\((Ex|Su|Sp)\)$/, '')) + '</a>'; }
    function abilityHtml(x, extraAbility) {
      var rep = x.b.replaces.length ? names(x.b.replaces) : '', mod = x.b.modifies.length ? names(x.b.modifies) : '';
      return '<div class="ap-ab ap-x" id="' + abId(x) + '"><h4>' + esc(x.b.name) + ' <span class="ap-tag">' + esc(x.a.name) + '</span>' +
        (x.b.lvl ? ' <span class="ap-lvl">' + ORD(x.b.lvl) + ' level</span>' : '') + '</h4>' +
        ((rep || mod) ? '<p class="ap-rep">' + (rep ? 'Replaces ' + esc(rep) : '') + (rep && mod ? '. ' : '') + (mod ? 'Modifies ' + esc(mod) : '') + '.</p>' : extraAbility ? '<p class="ap-rep">Gained in addition to the class features (replaces nothing).</p>' : '') +
        fixLinks(x.b.html) + '</div>';
    }

    function update() {
      var sel = d.archetypes.filter(function (a) { return a.box.checked; });
      // conflicts: two archetypes that change the same class feature
      d.archetypes.forEach(function (a) {
        var clash = [], house = [], why = [];
        sel.forEach(function (b) {
          if (b === a) return;
          if (forbidden(a, b)) { clash.push(b); why.push('Can’t be combined with ' + b.name + ' (a rule of the archetype)'); return; }
          if (allowed(a, b)) return;
          var p = pair(a, b);
          if (p.clash.length) { clash.push(b); why.push('Changes the same class features as ' + b.name + ' (' + [p.skills.length ? 'class skills: ' + p.skills.join(', ') : ''].concat(names(p.clash.filter(function (id) { return !p.skills.length || id !== 'class-skills-1'; })) || []).filter(Boolean).join('; ') + ')'); }
          else if (p.house.length) {
            house.push(b);
            why.push('House rule: one of them removes ' + names(p.house) + ' and the other only changes it; the change is lost, so they can be mixed (with ' + b.name + ')');
          }
        });
        a.label.classList.toggle('ap-clash', clash.length > 0);
        a.label.classList.toggle('ap-house', !clash.length && house.length > 0);
        a.label.classList.toggle('ap-clash-sel', (clash.length > 0 || house.length > 0) && a.box.checked);
        a.label.querySelector('.ap-why').textContent = a.box.checked ? (clash.length ? 'conflicts with ' + clash.map(function (b) { return b.name; }).join(', ') : house.length ? 'house rule with ' + house.map(function (b) { return b.name; }).join(', ') : '') : '';
        a.label.title = why.join('; ');
        if (a.banned) a.label.title = 'Banned by house rule' + (a.label.title ? '; ' + a.label.title : '');
      });
      var bad = sel.filter(function (a) { return a.label.classList.contains('ap-clash'); });
      var hr = sel.filter(function (a) { return a.label.classList.contains('ap-house'); });
      msg.innerHTML = (bad.length ? '<strong>Not normally combinable:</strong> ' + bad.map(function (a) { return esc(a.name); }).join(', ') + ' change the same class features, or one of them says it can’t be combined with the other. The page still shows them together, in case a house rule allows it; hover an archetype to see why.' : '') +
        (hr.length ? (bad.length ? '<br>' : '') + '<strong class="ap-hr">Combinable by house rule:</strong> ' + hr.map(function (a) { return esc(a.name); }).join(', ') + ' — one removes a class feature the other only changes, so that change is simply lost.' : '');
      var ban = sel.filter(function (a) { return a.banned; });
      if (ban.length) msg.innerHTML = '<strong>Banned by house rule:</strong> ' + ban.map(function (a) { return esc(a.name); }).join(', ') + ' can’t be used.' + (msg.innerHTML ? '<br>' + msg.innerHTML : '');
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
        var parts = d.units.filter(function (u) { return u.lvl === row.lvl && !u.sub && u.base !== 'class skills' && !/proficien/.test(u.base); }).map(function (u) {
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

      // the rest: archetype abilities that replace nothing go among the class features by level,
      // before the first class feature gained at a higher level (no level given: 1st level)
      abil.filter(function (x) { return !placed[abId(x)]; }).forEach(function (x) {
        var lv = x.b.lvl || 1;
        var next = order.find(function (s) { return s.lvl > lv; });
        var div = el('div'); div.innerHTML = abilityHtml(x, true);
        var ab = div.firstChild;
        if (next) next.h.parentNode.insertBefore(ab, next.h); else if (tail.parentNode) tail.parentNode.insertBefore(ab, tail); else content.appendChild(ab);
        placed[abId(x)] = 1;
      });
      // what each archetype is about, at the top of the class features
      extra.hidden = !sel.some(function (a) { return a.intro; });
      extra.innerHTML = sel.filter(function (a) { return a.intro; }).map(function (a) {
        return '<div class="ap-intro"><strong><a href="' + new URL(a.page + '#' + (a.link || a.anchor), base).href + '">' + esc(a.name) + '</a>:</strong> ' + fixLinks(a.intro).replace(/^<p>|<\/p>$/g, '') + '</div>';
      }).join('');
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
