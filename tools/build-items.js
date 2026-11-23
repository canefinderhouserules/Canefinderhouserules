// Builds the data for the Item Search page (docs/tools/item-data.json) from the magic item pages.
// Every item is a heading (### or ####) followed by a stat line (Aura / CL / Slot / Price / Weight).
// Items are grouped by what they are (ring, rod, belt, specific armor...) and not by the book they come from.
// Usage: node tools/build-items.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs');
const DIR = path.join(ROOT, 'magic-items');
const OUT = path.join(ROOT, 'tools', 'item-data.json');

const plain = s => String(s || '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/[*_`]/g, '')
  .replace(/\\([\[\]*_])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

// Same ids as the Python-Markdown toc extension gives to headings.
function slugify(text) {
  let s = plain(text).normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  s = s.replace(/[^\w\s-]/g, '').trim().toLowerCase();
  return s.replace(/[-\s]+/g, '-');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []);
}

const BODY_SLOTS = new Set(['belt', 'body', 'chest', 'eyes', 'feet', 'hands', 'head', 'headband', 'neck', 'shoulders', 'wrists', 'wrist', 'hand',
  'amulet', 'face', 'gloves', 'mask', 'boots', 'torso', 'held', 'rune', 'genie seal', 'none or neck', 'neck or shoulder', 'special']);
const SLOT_NAME = { wrist: 'wrists', hand: 'hands', gloves: 'hands', boots: 'feet', mask: 'face', amulet: 'neck', torso: 'chest', 'none or neck': 'neck', 'neck or shoulder': 'neck' };

function fileHint(rel) {
  const b = path.basename(rel, '.md');
  if (/^rings/.test(b)) return 'Ring';
  if (/^rods/.test(b)) return 'Rod';
  if (/^staves/.test(b)) return 'Staff';
  if (/^wands/.test(b)) return 'Wand';
  if (/^potions/.test(b)) return 'Potion or Oil';
  if (/^scrolls/.test(b)) return 'Scroll';
  if (/^artifacts/.test(b)) return 'Artifact';
  if (/^cursed-items/.test(b)) return 'Cursed Item';
  if (/^intelligent-items/.test(b)) return 'Intelligent Item';
  return null;
}
function h2Hint(h2) {
  const s = h2.toLowerCase();
  if (/artifact/.test(s)) return 'Artifact';
  if (/^rings?$/.test(s)) return 'Ring';
  if (/^rods?$/.test(s)) return 'Rod';
  if (/^staves$|^staffs?$/.test(s)) return 'Staff';
  if (/^wands?$/.test(s)) return 'Wand';
  if (/potion|oil/.test(s)) return 'Potion or Oil';
  if (/^scrolls?$/.test(s)) return 'Scroll';
  if (/cursed/.test(s)) return 'Cursed Item';
  if (/intelligent/.test(s)) return 'Intelligent Item';
  if (/weapon special abilit/.test(s)) return 'Weapon Special Ability';
  if (/armor.*special abilit|shield special abilit/.test(s)) return 'Armor Special Ability';
  if (/^specific (magic )?weapons?$|^weapons$/.test(s)) return 'Weapon';
  if (/^specific (armor|armors)( and shields)?$|^armor$/.test(s)) return 'Armor';
  if (/^specific shields$/.test(s)) return 'Shield';
  return null;
}

function classify(slotRaw, rel, h2) {
  const slot = (slotRaw || '').toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim();
  let type = null, sub = '';
  if (/special ability|quality/.test(slot)) type = /armor|shield/.test(slot) ? 'Armor Special Ability' : 'Weapon Special Ability';
  else if (slot === 'armor') type = 'Armor';
  else if (slot === 'shield') type = 'Shield';
  else if (slot === 'weapon') type = 'Weapon';
  else if (slot === 'ring') type = 'Ring';
  if (!type) type = fileHint(rel);
  if (!type) type = h2Hint(h2);
  if (!type) {
    if (BODY_SLOTS.has(slot)) { type = 'Wondrous Item'; sub = SLOT_NAME[slot] || slot; }
    else type = 'Wondrous Item';
  }
  if (type === 'Wondrous Item' && !sub) sub = BODY_SLOTS.has(slot) ? (SLOT_NAME[slot] || slot) : 'slotless';
  return { type, sub };
}

function field(text, name) {
  const re = new RegExp('(?:^|[\\s;*_])' + name + '[*_]*[:\\s]+([^;\\n]*?)(?=\\s*(?:;|\\*{1,2}[A-Z]|\\s{2,}\\*{1,2}[A-Z]|\\n|$))', 'i');
  const m = text.match(new RegExp('[*_]{1,2}' + name + '[*_]{1,2}[:\\s]*([^;\\n]*?)(?=\\s*(?:;|[*_]{1,2}[A-Z][a-z]+[*_]{1,2}|\\s*\\n|$))', 'i'));
  return m ? plain(m[1]).replace(/[;,]\s*$/, '') : '';
}

function priceNumber(text) {
  const m = String(text || '').match(/(\d[\d,]*)\s*(gp|sp|cp|pp)?/i);
  if (!m) return null;
  let n = parseInt(m[1].replace(/,/g, ''), 10);
  if (/sp/i.test(m[2] || '')) n /= 10; else if (/cp/i.test(m[2] || '')) n /= 100; else if (/pp/i.test(m[2] || '')) n *= 10;
  return n;
}

const items = [];
const files = walk(DIR).sort();
for (const file of files) {
  const rel = path.relative(DIR, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const used = new Map();
  let title = '', h2 = '', h3 = '';
  const heads = [];
  lines.forEach((l, i) => { const m = l.match(/^(#{1,4}) (.*?)\s*#*\s*$/); if (m) heads.push({ i, lvl: m[1].length, text: m[2].replace(/\r$/, '') }); });
  heads.forEach((h, k) => {
    const id = slugify(h.text) || 'section';
    const n = used.get(id) || 0; used.set(id, n + 1);
    h.id = n ? id + '_' + n : id;
    if (h.lvl === 1) title = plain(h.text);
    if (h.lvl === 2) { h2 = plain(h.text); }
    if (h.lvl === 3) h3 = plain(h.text);
    if (h.lvl < 3) return;
    let end = lines.length;
    for (let j = k + 1; j < heads.length; j++) if (heads[j].lvl <= h.lvl) { end = heads[j].i; break; }
    const block = lines.slice(h.i + 1, end);
    const head = block.filter(l => l.trim()).slice(0, 4).join('\n');
    if (!/[*_]{1,2}(Aura|Slot|Price|CL)[*_]{1,2}/.test(head)) return;
    const stat = block.filter(l => l.trim()).slice(0, 4).join(' ; ');
    const slotRaw = field(stat, 'Slot');
    const { type, sub } = classify(slotRaw, rel, h2);
    const priceT = field(stat, 'Price');
    const desc = block.filter(l => l.trim() && !/^\s*[*_]{1,2}(Aura|Slot|Price|CL|Weight|Construction|Requirements)/.test(l) && !/^#/.test(l))
      .map(plain).find(l => l.length > 25) || '';
    const url = 'magic-items/' + rel.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '/');
    items.push({
      n: plain(h.text), u: url, a: h.id, t: type, ...(sub ? { sl: sub } : {}),
      ...(field(stat, 'Aura') ? { au: field(stat, 'Aura') } : {}),
      ...(field(stat, 'CL') ? { cl: field(stat, 'CL') } : {}),
      ...(slotRaw ? { slot: slotRaw } : {}),
      ...(priceT ? { pt: priceT } : {}),
      ...(priceNumber(priceT) != null ? { p: priceNumber(priceT) } : {}),
      ...(field(stat, 'Weight') ? { w: field(stat, 'Weight') } : {}),
      x: desc.length > 220 ? desc.slice(0, 217) + '…' : desc,
      b: title,
    });
  });
}

fs.writeFileSync(OUT, JSON.stringify({ items }));
const count = {};
items.forEach(i => { const k = i.t + (i.sl ? ' / ' + i.sl : ''); count[k] = (count[k] || 0) + 1; });
console.log('item-data.json:', items.length, 'items');
Object.keys(count).sort().forEach(k => console.log('  ' + k + ': ' + count[k]));
