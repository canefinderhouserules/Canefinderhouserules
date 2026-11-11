/* Canefinder search worker.
 *
 * Replaces the theme's search worker (a hook in hooks/trim_search.py points the site to this file).
 * It speaks the same messages as the theme's worker, so the search box and results look the same,
 * but it ranks results by how well the title matches instead of by loose word matches:
 *   1. the exact name ("Fireball", "Rage (Ex)", "Power Attack")
 *   2. names that start with the search
 *   3. names that hold every word
 *   4. sections whose text holds every word
 * Only when nothing holds every word does it fall back to sections holding some of them.
 * It also needs no index to be built, so it is ready as soon as the page list arrives.
 */
'use strict';

let DOCS = [];
let SUGGEST = false;

const fold = s => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&[a-z]+;|&#\d+;/g, ' ')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[’‘'`]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Trailing tags such as "(Ex)", "(Su)", "(Mythic)", "[1]" do not count against an exact name.
const core = title => fold(String(title || '').replace(/(\s*(\([^)]*\)|\[[^\]]*\]))+\s*$/, ''));

function prepare(doc, i) {
  const loc = doc.location || '';
  const title = fold(doc.title);
  const words = title ? title.split(' ') : [];
  let bias = 0;
  if (!loc.includes('#')) bias += 40; // a whole page beats one of its sections
  if (/^campaign-systems\//.test(loc)) bias -= 60; // separate subsystems
  if (/-archetypes\//.test(loc)) bias -= 15;
  if (/\/legendary\//.test(loc)) bias -= 10;
  if (/\/(mythic|mythic-spells)\//.test(loc)) bias -= 10;
  if (/\(mythic\)/i.test(doc.title || '')) bias -= 40; // the mythic version comes after the normal one
  return {
    i, doc, loc, page: loc.split('#')[0],
    title, core: core(doc.title), words, wordSet: new Set(words),
    // a renamed page keeps its old name in its address ("Dodgility" lives at feats/dodge/)
    slug: loc.includes('#') ? '' : fold((loc.replace(/\/$/, '').split('/').pop() || '')),
    body: fold(doc.text), bias,
  };
}

const hasWord = (set, words, t) => set.has(t) || set.has(t + 's') || set.has(t + 'es') || (t.endsWith('s') && set.has(t.slice(0, -1)));
const hasPrefix = (words, t) => words.some(w => w.startsWith(t));
const inText = (body, t) => (' ' + body).includes(' ' + t);

function scoreDoc(d, q, toks) {
  let tier = 0;
  const terms = {};
  if (d.core === q || d.title === q) tier = d.title === q ? 1000 : 970;
  else if (d.core === q + 's' || d.core === q + 'es' || d.core + 's' === q) tier = 900;
  else if (d.slug && d.slug === q) tier = 960;
  else if (d.core.startsWith(q + ' ') || d.title.startsWith(q + ' ')) tier = 760;
  else if (d.core.startsWith(q) || d.title.startsWith(q)) tier = 700;
  let whole = 0, pre = 0, body = 0;
  for (const t of toks) {
    const w = hasWord(d.wordSet, d.words, t), p = w || hasPrefix(d.words, t), b = p || inText(d.body, t);
    if (w) whole++; if (p) pre++; if (b) body++;
    terms[t] = b;
  }
  const n = toks.length;
  if (!tier) {
    if (whole === n) tier = d.title.includes(q) ? 560 : 500;
    else if (pre === n) tier = 420;
    else if (body === n) tier = 150 + 20 * whole + 10 * pre;
    else if (body > 0) tier = -1000 + 100 * body + 20 * pre; // fallback only
    else return null;
  }
  const score = tier + d.bias - Math.min(d.title.length, 80) * 0.6;
  return { score, terms, all: body === n };
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function mark(html, toks) {
  if (!html || !toks.length) return html || '';
  const re = new RegExp('(^|[^A-Za-z0-9])(' + toks.map(esc).join('|') + ')', 'gi');
  return String(html).split(/(<[^>]+>)/).map(part => part.startsWith('<') ? part : part.replace(re, '$1<mark data-md-highlight>$2</mark>')).join('');
}

function search(raw) {
  const q = fold(String(raw).replace(/[*+\-:~^"]+/g, ' '));
  if (!q) return { items: [] };
  const toks = [...new Set(q.split(' ').filter(Boolean))];
  let hits = [];
  for (const d of DOCS) { const r = scoreDoc(d, q, toks); if (r) hits.push([d, r]); }
  if (hits.some(([, r]) => r.all)) hits = hits.filter(([, r]) => r.all);
  hits.sort((a, b) => b[1].score - a[1].score || a[0].i - b[0].i);

  const groups = new Map();
  for (const [d, r] of hits) {
    if (!groups.has(d.page)) { if (groups.size >= 200) continue; groups.set(d.page, []); }
    groups.get(d.page).push({ ...d.doc, title: mark(d.doc.title, toks), text: mark(d.doc.text, toks), score: r.score, terms: r.terms });
  }
  const byLoc = new Map(DOCS.map(d => [d.loc, d]));
  for (const [page, list] of groups) {
    if (!list.some(x => x.location === page) && byLoc.has(page)) list.push({ ...byLoc.get(page).doc, score: 0, terms: {} });
    // the theme shows sections that tie with the best one, and folds the rest under "more"
    const top = list[0].score;
    for (const x of list) if (x.location !== page && top - x.score < 1) x.score = top;
  }

  const out = { items: [...groups.values()] };
  if (SUGGEST) {
    const last = toks[toks.length - 1];
    const best = hits.length ? hits[0][0].words.find(w => w.startsWith(last)) : null;
    out.suggest = best ? [best] : [];
  }
  return out;
}

addEventListener('message', ev => {
  const m = ev.data || {};
  try {
    if (m.type === 0) {
      DOCS = (m.data.docs || []).map(prepare);
      SUGGEST = !!(m.data.options && m.data.options.suggest);
      postMessage({ type: 1 });
    } else if (m.type === 2) {
      postMessage({ type: 3, data: search(m.data) });
    }
  } catch (e) {
    console.warn('search failed', e);
    postMessage({ type: 3, data: { items: [] } });
  }
});
