// Builds docs/monsters/by-cr/: one page per Challenge Rating listing every creature stat block on the wiki,
// like d20pfsrd's "Monsters by CR". Reads the generated creature pages (their data-r20 attribute holds name, CR and type line),
// so rerun it after tools/build-monsters.js or tools/convert-pfsrd.js.
// Usage: node tools/build-by-cr.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs', 'monsters');
const OUT = path.join(ROOT, 'by-cr');
const SKIP = new Set(['templates', 'by-cr']);

// book folder -> title, read from each book's index.md heading
const books = {};
for (const d of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!d.isDirectory() || SKIP.has(d.name)) continue;
  const idx = path.join(ROOT, d.name, 'index.md');
  const m = fs.existsSync(idx) && fs.readFileSync(idx, 'utf8').match(/^# (.+)$/m);
  books[d.name] = m ? m[1].trim() : d.name;
}

const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Python-Markdown's toc slugify and unique ids, so links land on the right stat block
function slugify(text) {
  const plain = text.replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');
  return plain.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[-\s]+/g, '-');
}
function headingIds(md) {
  const ids = [], seen = new Set();
  let inFence = false;
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) inFence = !inFence;
    const h = !inFence && line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!h) continue;
    let id = slugify(h[1]), base = id, n = 1;
    while (seen.has(id)) id = base + '_' + n++;
    seen.add(id);
    ids.push({ text: h[1], id, level: line.match(/^#+/)[0].length });
  }
  return ids;
}

// "9/MR 3" -> base 9 (mythic rank noted); "1/2" -> 0.5; anything else (templates "+1", "—", traps) is left out
function parseCr(cr) {
  const m = String(cr).trim().match(/^(\d+)(?:\/(\d+))?(?:\s*\/\s*MR\s*(\d+))?$/);
  if (!m) return null;
  if (m[3] !== undefined || m[2] === undefined) return { key: m[1], value: +m[1], mr: m[3] };
  return { key: m[1] + '/' + m[2], value: +m[1] / +m[2] };
}

const byCr = new Map();
let total = 0, skipped = 0;
for (const book of Object.keys(books)) {
  const dir = path.join(ROOT, book);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md') || f === 'index.md') continue;
    const md = fs.readFileSync(path.join(dir, f), 'utf8');
    const blocks = [...md.matchAll(/data-r20="([^"]*)"/g)].map(m => { try { return JSON.parse(decode(m[1])); } catch { return null; } }).filter(Boolean);
    if (!blocks.length) continue;
    const h2 = headingIds(md).filter(h => h.level === 2);
    blocks.forEach((b, i) => {
      const cr = parseCr(b.cr || '');
      if (!cr) { skipped++; return; }
      // stat block headings are "## Name (CR x)", in the same order as the export panels
      const anchor = blocks.length > 1 && h2[i] ? '#' + h2[i].id : '';
      if (!byCr.has(cr.key)) byCr.set(cr.key, { value: cr.value, list: [] });
      byCr.get(cr.key).list.push({ name: b.name, mr: cr.mr, line: (b.line || '').replace(/\|/g, '/'), link: '../' + book + '/' + f + anchor, book });
      total++;
    });
  }
}

const crs = [...byCr.entries()].sort((a, b) => a[1].value - b[1].value);
const file = key => 'cr-' + key.replace('/', '-') + '.md';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const intro = 'Each Challenge Rating has its own page listing every creature and NPC on the wiki at that CR, from all the bestiaries, codexes, other sources and third-party books. Mythic creatures are listed under their CR with their mythic rank (MR) next to the name. Templates and creatures without a fixed CR are left out.';
let idx = '# Monsters by CR\n\n' + intro + '\n\n| CR | XP | Creatures |\n|---|---|---|\n';
const XP = { '1/8': '50', '1/6': '65', '1/4': '100', '1/3': '135', '1/2': '200', 1: '400', 2: '600', 3: '800', 4: '1,200', 5: '1,600', 6: '2,400', 7: '3,200', 8: '4,800', 9: '6,400', 10: '9,600', 11: '12,800', 12: '19,200', 13: '25,600', 14: '38,400', 15: '51,200', 16: '76,800', 17: '102,400', 18: '153,600', 19: '204,800', 20: '307,200', 21: '409,600', 22: '614,400', 23: '819,200', 24: '1,228,800', 25: '1,638,400', 26: '2,457,600', 27: '3,276,800', 28: '4,915,200', 29: '6,553,600', 30: '9,830,400' };
crs.forEach(([key, { list }], i) => {
  idx += '| [CR ' + key + '](' + file(key) + ') | ' + (XP[key] || '') + ' | ' + list.length + ' |\n';
  list.sort((a, b) => a.name.localeCompare(b.name) || a.book.localeCompare(b.book));
  const prev = crs[i - 1], next = crs[i + 1];
  const navLine = [prev ? '[← CR ' + prev[0] + '](' + file(prev[0]) + ')' : '', '[All CRs](index.md)', next ? '[CR ' + next[0] + ' →](' + file(next[0]) + ')' : ''].filter(Boolean).join(' · ');
  let page = '# CR ' + key + ' Creatures\n\n' + (XP[key] ? '**XP** ' + XP[key] + ' each. ' : '') + list.length + ' stat blocks. ' + navLine + '\n\n';
  page += '| Creature | Description | Source |\n|---|---|---|\n';
  page += list.map(e => '| [' + e.name + '](' + e.link + ')' + (e.mr ? ' (MR ' + e.mr + ')' : '') + ' | ' + e.line + ' | [' + books[e.book] + '](../' + e.book + '/index.md) |').join('\n') + '\n\n' + navLine + '\n';
  fs.writeFileSync(path.join(OUT, file(key)), page);
});
fs.writeFileSync(path.join(OUT, 'index.md'), idx);
// sidebar in CR order (alphabetical would put CR 10 before CR 2)
fs.writeFileSync(path.join(OUT, '.nav.yml'), 'nav:\n  - index.md\n' + crs.map(([key]) => '  - "CR ' + key + '": ' + file(key) + '\n').join(''));
console.log('by-cr:', crs.length, 'CR pages,', total, 'stat blocks,', skipped, 'without a numeric CR');
