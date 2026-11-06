// Hover previews: when the mouse rests on a link to a section of a wiki page (a link with #),
// show that section's text in a small floating box. Works for class features, conditions and any heading.
(function () {
  var cache = {};          // page URL -> parsed document (promise)
  var box = null, timer = null, current = null;

  function getDoc(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); })
        .catch(function () { return null; });
    }
    return cache[url];
  }

  // The heading plus everything after it until the next heading of the same or higher level.
  function sectionHtml(doc, id) {
    var h = doc && doc.getElementById(id);
    if (!h) return null;
    var level = /^H[1-6]$/.test(h.tagName) ? +h.tagName[1] : 7;
    var out = document.createElement('div');
    var title = h.cloneNode(true);
    title.querySelectorAll('.headerlink').forEach(function (a) { a.remove(); });
    title.removeAttribute('id');
    out.appendChild(title);
    var n = h.nextElementSibling, chars = 0, count = 0;
    while (n && count < 12 && chars < 2500) {
      if (/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= level) break;
      // A class's level table ("Table: Ranger" and the table after it) is not part of the feature.
      if (n.tagName === 'P' && /^Table\b/.test((n.textContent || '').trim())) break;
      if (n.tagName === 'TABLE' && n.querySelectorAll('tr').length > 16) break;
      var c = n.cloneNode(true);
      c.querySelectorAll('[id]').forEach(function (e) { e.removeAttribute('id'); });
      out.appendChild(c);
      chars += (n.textContent || '').length; count++;
      n = n.nextElementSibling;
    }
    if (n && !(/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= level)) {
      var more = document.createElement('p'); more.className = 'section-preview__more'; more.textContent = '…'; out.appendChild(more);
    }
    return out.innerHTML;
  }

  function hide() { clearTimeout(timer); if (box) box.hidden = true; current = null; }

  function place(link) {
    var r = link.getBoundingClientRect();
    var w = Math.min(460, window.innerWidth - 24);
    box.style.width = w + 'px';
    var left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
    box.style.left = (left + window.scrollX) + 'px';
    box.hidden = false;
    var below = r.bottom + 2, h = box.offsetHeight;
    var top = (below + h > window.innerHeight && r.top - h - 2 > 0) ? r.top - h - 2 : below;
    box.style.top = (top + window.scrollY) + 'px';
  }

  function show(link) {
    var url = new URL(link.href, location.href);
    var id = decodeURIComponent(url.hash.slice(1));
    var page = url.href.split('#')[0];
    var here = location.href.split('#')[0];
    var p = page === here ? Promise.resolve(document) : getDoc(page);
    p.then(function (doc) {
      if (current !== link) return;
      var html = sectionHtml(doc, id);
      if (!html) return;
      // A link titled "also: a, b" previews those sections of the same page too (for features that only work together).
      var also = (link.dataset.previewAlso || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      also.forEach(function (extra) { var h = sectionHtml(doc, extra); if (h) html += '<hr>' + h; });
      if (!box) {
        box = document.createElement('div');
        box.className = 'section-preview md-typeset';
        box.setAttribute('role', 'tooltip');
        box.addEventListener('mouseleave', hide);
        document.body.appendChild(box);
      }
      box.innerHTML = html;
      place(link);
    });
  }

  function candidate(el) {
    var a = el.closest && el.closest('a[href*="#"]');
    if (!a || !a.closest('.md-content')) return null;
    if (a.classList.contains('headerlink') || a.closest('.md-nav')) return null;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.hash || url.hash.length < 2) return null;
    // Move an "also: ..." title into a data attribute so the browser's own tooltip does not show it.
    var m = (a.getAttribute('title') || '').match(/^also:\s*(.+)$/);
    if (m) { a.dataset.previewAlso = m[1]; a.removeAttribute('title'); }
    return a;
  }

  if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;

  document.addEventListener('mouseover', function (e) {
    var a = candidate(e.target);
    if (!a) {
      if (!box || box.hidden) return;
      clearTimeout(timer);
      // Moving onto the box keeps it open so it can be scrolled; anywhere else closes it after a short delay.
      if (!box.contains(e.target)) timer = setTimeout(hide, 400);
      return;
    }
    if (a === current) { clearTimeout(timer); return; }
    clearTimeout(timer); current = a;
    timer = setTimeout(function () { show(a); }, 350);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', function () { if (box && !box.hidden && current) place(current); }, { passive: true });
  // Scrolling inside the box should not scroll the page behind it.
  document.addEventListener('wheel', function (e) { if (box && !box.hidden && box.contains(e.target)) e.stopPropagation(); }, { passive: true });
})();
