// Condition words written as plain text ("the target is staggered", "nauseated 2") become links to the Conditions page,
// so the hover preview (section-preview.js) shows what the condition does. Only the first mention of each condition
// in a paragraph or list item is linked, and the page text itself is not changed.
(function () {
  var NAMES = ['blinded', 'confused', 'cowering', 'dazed', 'dazzled', 'deafened', 'entangled', 'exhausted', 'fascinated',
    'fatigued', 'frightened', 'grappled', 'helpless', 'nauseated', 'panicked', 'paralyzed', 'petrified', 'pinned', 'prone',
    'shaken', 'sickened', 'staggered', 'stunned', 'unconscious', 'flat-footed'];
  var RE = new RegExp('\\b(' + NAMES.join('|') + ')\\b(?! to\\b)', 'gi');
  var me = document.currentScript && document.currentScript.src;
  if (!me) return;
  var root = new URL('../', me).href; // the site root (this file is in javascripts/)
  var target = root + 'rules/appendices/conditions/';
  if (location.href.split('#')[0] === target) return;
  var SKIP = 'a, h1, h2, h3, h4, h5, h6, code, pre, script, style, .apc, .ap, .section-preview, .md-nav, .md-header, .md-footer';
  function run(root) {
    root.querySelectorAll('p, li, td, dd').forEach(function (block) {
      if (block.closest(SKIP)) return;
      var seen = {};
      var walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) { return n.parentNode.closest(SKIP) || n.parentNode.closest('p, li, td, dd') !== block ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
      });
      var nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
      nodes.forEach(function (n) {
        var s = n.nodeValue; RE.lastIndex = 0; if (!RE.test(s)) return; RE.lastIndex = 0;
        var frag = document.createDocumentFragment(), last = 0, m, any = false;
        while ((m = RE.exec(s))) {
          var key = m[1].toLowerCase(); if (seen[key]) continue; seen[key] = 1; any = true;
          frag.appendChild(document.createTextNode(s.slice(last, m.index)));
          var a = document.createElement('a'); a.className = 'cond-auto'; a.href = target + '#' + key; a.textContent = m[0];
          frag.appendChild(a); last = m.index + m[0].length;
        }
        if (!any) return;
        frag.appendChild(document.createTextNode(s.slice(last)));
        n.parentNode.replaceChild(frag, n);
      });
    });
  }
  function start() { var c = document.querySelector('.md-content'); if (c) run(c); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
