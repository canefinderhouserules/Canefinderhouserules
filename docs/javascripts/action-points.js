// Action Points (optional house rule): colors every "(N AP)" written in the text, and adds an AP switch to the header
// that hides or shows them (remembered in this browser). The costs stay in the page text, so editing them is just
// editing the number; this script only styles them.
(function () {
  var KEY = 'canefinder-ap';
  var RE = /\((\d+ AP(?: of your next turn)?)\)/g;
  function shown() { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
  function apply(on) { document.documentElement.classList.toggle('apc-off', !on); }
  function mark(root) {
    var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!RE.test(n.nodeValue)) return NodeFilter.FILTER_REJECT; RE.lastIndex = 0;
        var p = n.parentNode; if (!p || p.closest('code, pre, script, style, .apc')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
    nodes.forEach(function (n) {
      var frag = document.createDocumentFragment(), s = n.nodeValue, last = 0, m;
      RE.lastIndex = 0;
      while ((m = RE.exec(s))) {
        frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var span = document.createElement('span'); span.className = 'apc'; span.textContent = m[0];
        span.title = 'Optional rule: cost in action points';
        frag.appendChild(span); last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(s.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  }
  function button() {
    var opt = document.querySelector('.md-header__inner'); if (!opt || opt.querySelector('.apc-toggle')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'apc-toggle md-header__button';
    var on = shown();
    function label() { b.textContent = 'AP'; b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Hide action point costs (optional rule)' : 'Show action point costs (optional rule)'; }
    label();
    b.addEventListener('click', function () { on = !on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} apply(on); label(); });
    var search = opt.querySelector('.md-search'); opt.insertBefore(b, search || null);
  }
  apply(shown());
  function run() {
    var c = document.querySelector('.md-content'); if (c) mark(c);
    button();
    // results that other scripts add later (spell search, archetype picker)
    if (c && window.MutationObserver) new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && !n.classList.contains('apc')) mark(n); }); });
    }).observe(c, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
