// Adds a "Deep search" link at the top of the quick search results, which opens the Deep Search page with the same words.
(function () {
  'use strict';
  var input = document.querySelector('.md-search__input');
  var box = document.querySelector('.md-search-result');
  if (!input || !box) return;
  var cfg = JSON.parse(document.getElementById('__config').textContent);
  var base = new URL(cfg.base.replace(/\/?$/, '/'), location.href);
  var link = document.createElement('a');
  link.className = 'cf-deep-link';
  link.hidden = true;
  box.insertBefore(link, box.firstChild);
  function update() {
    var q = input.value.trim();
    link.hidden = q.length < 2;
    if (link.hidden) return;
    link.href = new URL('tools/deep-search/?find=' + encodeURIComponent(q), base).href;
    link.textContent = 'Search every page’s text for “' + q + '” →';
  }
  input.addEventListener('input', update);
  input.addEventListener('keyup', update);
  update();
})();
