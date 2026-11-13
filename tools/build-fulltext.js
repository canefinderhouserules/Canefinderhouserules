// Builds the data for the Deep Search page from the full search index, after the site is built.
// hooks/trim_search.py leaves an untrimmed copy at site/search/full_index.json; this script splits its
// plain text into shards the Deep Search page loads one by one, then deletes the copy.
// Usage: node tools/build-fulltext.js [site_dir]
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = process.argv[2] || 'site';
const FULL = path.join(SITE, 'search', 'full_index.json');
const OUT = path.join(SITE, 'search', 'deep');
const SHARD_CHARS = 1500000;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', times: '×' };
const plain = s => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m))
  .replace(/\s+/g, ' ')
  .trim();

if (!fs.existsSync(FULL)) { console.log('no full index at', FULL); process.exit(0); }
const index = JSON.parse(fs.readFileSync(FULL, 'utf8'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const pages = {};
for (const d of index.docs) if (!d.location.includes('#')) pages[d.location] = plain(d.title);

const shards = [];
let cur = [], size = 0, total = 0;
const flush = () => { if (!cur.length) return; const name = 'shard-' + shards.length + '.json'; fs.writeFileSync(path.join(OUT, name), JSON.stringify(cur)); shards.push(name); cur = []; size = 0; };
for (const d of index.docs) {
  const title = plain(d.title), text = plain(d.text);
  if (!title && !text) continue;
  cur.push([d.location, title, text]);
  size += text.length + title.length + d.location.length;
  total += text.length;
  if (size >= SHARD_CHARS) flush();
}
flush();
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ shards, pages, chars: total, built: new Date().toISOString() }));
fs.rmSync(FULL);
console.log('deep search:', shards.length, 'shards,', Object.keys(pages).length, 'pages,', total, 'chars');
