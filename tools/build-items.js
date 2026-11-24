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

const FILE_TYPE = {
  'armor-specific': 'Armor', 'shields-specific': 'Shield', 'armor-special-abilities': 'Armor Special Ability', 'weapons-specific': 'Weapon',
  'weapon-special-abilities': 'Weapon Special Ability', 'potions': 'Potion or Oil', 'rings': 'Ring', 'rods': 'Rod', 'staves': 'Staff',
  'artifacts': 'Artifact', 'cursed-items': 'Cursed Item', 'intelligent-items': 'Intelligent Item', 'mundane-items': 'Mundane Item',
};
const SLOT_FILE = { belts: 'belt', body: 'body', chest: 'chest', eyes: 'eyes', feet: 'feet', hands: 'hands', head: 'head', headband: 'headband', neck: 'neck', shoulders: 'shoulders', wrists: 'wrists' };
const ABILITY = /^\*([A-Za-z][A-Za-z ,\/-]*); CL (\d+\w\w);.*?(?:Price|Cost) ([^;.]*(?:\.\d+)?[^;.]*?)\.?\*$/;

function typeOfFile(rel, slotRaw, h2) {
  const b = path.basename(rel, '.md');
  if (FILE_TYPE[b]) return { type: FILE_TYPE[b], sub: '' };
  if (rel.startsWith('wondrous-items/')) return { type: 'Wondrous Item', sub: SLOT_FILE[b] || 'slotless' };
  return classify(slotRaw, rel, h2);
}

const items = [];
const files = walk(DIR).sort();
for (const file of files) {
  const rel = path.relative(DIR, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const used = new Map();
  let title = '', h2 = '';
  const heads = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (l.startsWith('```')) fence = !fence;
    const m = fence ? null : l.match(/^(#{1,6}) (.*?)\s*#*\s*$/);
    if (m) heads.push({ i, lvl: m[1].length, text: m[2].replace(/\r$/, '') });
  });
  heads.forEach((h, k) => {
    const id = slugify(h.text) || 'section';
    const n = used.get(id) || 0; used.set(id, n + 1);
    h.id = n ? id + '_' + n : id;
    h.next = k + 1 < heads.length ? heads[k + 1].i : lines.length;
    const seg = lines.slice(h.i + 1, h.next);
    const first = seg.filter(l => l.trim()).slice(0, 4).join('\n');
    h.stat = h.lvl >= 2 && /[*_]{1,2}(Aura|Slot|Price|CL)[*_]{1,2}/.test(first);
    if (!h.stat && h.lvl >= 2 && !/Descriptions?$/.test(h.text)) {
      const ab = seg.map(l => l.trim()).find(l => ABILITY.test(l));
      if (ab) { h.stat = true; h.abil = ab; }
    }
    if (h.lvl === 1 && !title) title = plain(h.text);
  });
  let cur2 = '';
  heads.forEach((h) => {
    if (h.lvl === 2 && !h.stat) cur2 = plain(h.text);
    if (!h.stat) return;
    const block = lines.slice(h.i + 1, h.next);
    const stat = block.filter(l => l.trim()).slice(0, 4).join(' ; ');
    let au = field(stat, 'Aura'), cl = field(stat, 'CL'), slotRaw = field(stat, 'Slot'), priceT = field(stat, 'Price');
    if (h.abil) { const m = h.abil.match(ABILITY); au = m[1].trim(); cl = m[2]; priceT = m[3].trim(); }
    const { type, sub } = typeOfFile(rel, slotRaw, cur2);
    const mund = type === 'Mundane Item';
    const t2 = mund ? 'Adventuring Gear' : h.abil && type === 'Wondrous Item' ? (/^armor/.test(path.basename(rel)) ? 'Armor Special Ability' : 'Weapon Special Ability') : type;
    const tail = lines.slice(h.i + 1, h.next);
    const srcLine = tail.map(l => l.trim()).reverse().find(l => /^\*Source: /.test(l));
    const desc = block.filter(l => l.trim() && !/^\s*[*_]{1,2}(Aura|Slot|Price|CL|Weight|Construction|Requirements|Source)/.test(l) && !/^#/.test(l) && !ABILITY.test(l.trim()))
      .map(plain).find(l => l.length > 25) || '';
    const url = 'magic-items/' + rel.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '/');
    items.push({
      n: plain(h.text), u: url, a: h.id, t: t2, ...(mund ? { m: 1 } : {}), ...(sub && t2 === 'Wondrous Item' ? { sl: sub } : {}),
      ...(au ? { au } : {}), ...(cl ? { cl } : {}), ...(slotRaw ? { slot: slotRaw } : {}),
      ...(priceT ? { pt: priceT } : {}), ...(priceNumber(priceT) != null ? { p: priceNumber(priceT) } : {}),
      ...(field(stat, 'Weight') ? { w: field(stat, 'Weight') } : {}),
      x: desc.length > 220 ? desc.slice(0, 217) + '…' : desc,
      b: srcLine ? plain(srcLine).replace(/^Source:\s*/, '').replace(/\.$/, '') : title,
    });
  });
}


// ---------------------------------------------------------------------------------------------------------------
// Mundane equipment: weapon pages, table rows with a price (goods, gear, armor...) and entries with a Price/Cost line.
const EQ = path.join(ROOT, 'equipment');
const SKIP_EQ = new Set(['weapons.md', 'core-weapons.md', 'wealth-and-money.md', 'index.md', 'equipment-packages.md', 'weapon-design.md', 'firearm-rules.md']);
const toMd = rel => 'equipment/' + rel.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '/');

const FILE_KIND = [[/^special-materials/, 'Special Material'], [/^purchasing-animals/, 'Mounts, Animals and Barding'], [/^more-poisons|^gear-cc|^gear-emh/, 'Alchemical Items, Poisons and Drugs'],
  [/^gear-aa\.md|^gear-ff|^gear-companions-animals/, 'Mounts, Animals and Barding'], [/^technolog/, 'Technological Gear'], [/^armor/, 'Armor']];
function mundaneType(heading, rel, name, group, strict) {
  const g = (group || heading || '').toLowerCase();
  if (strict) { for (const [re] of FILE_KIND) if (re.test(rel)) return null; }
  if (/shield|buckler/i.test(name) && /armor|shield/.test(rel + ' ' + g)) return 'Shield';
  for (const [re, t] of FILE_KIND) if (re.test(rel)) return t;
  if (/barding/.test(g)) return 'Mounts, Animals and Barding';
  if (/armor|shield/.test(g)) return /shield/.test(g) && !/armor/.test(g) ? 'Shield' : 'Armor';
  if (/weapon|ammunition|firearm/.test(g)) return 'Weapon';
  if (/alchemic|substance|poison|drug|disease|remed|elixir/.test(g)) return 'Alchemical Items, Poisons and Drugs';
  if (/tool|skill kit|kit/.test(g)) return 'Tools and Skill Kits';
  if (/cloth|wear|outfit/.test(g)) return 'Clothing';
  if (/food|drink|lodging|meal/.test(g)) return 'Food, Drink and Lodging';
  if (/mount|animal|saddle/.test(g)) return 'Mounts, Animals and Barding';
  if (/transport|vehicle|ship|siege|cart|wagon/.test(g)) return 'Transport';
  if (/service|spellcasting|entertain/.test(g)) return 'Services';
  return strict ? null : 'Adventuring Gear';
}
function cellsOf(l) { return l.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim()); }
function mundaneFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'weapons' || e.name === 'special-weapon-properties' ? [] : mundaneFiles(f);
    return e.name.endsWith('.md') ? [f] : [];
  });
}
const seen = new Set();
const WEAPON_NAMES = new Set();
const addM = o => { const k = o.u + '#' + o.a + '|' + o.n.toLowerCase(); if (seen.has(k)) return; seen.add(k); items.push(o); };

// weapon pages
const WP = path.join(EQ, 'weapons');
for (const f of fs.readdirSync(WP).filter(n => n.endsWith('.md'))) {
  const t = fs.readFileSync(path.join(WP, f), 'utf8').split('\n');
  const name = plain((t.find(l => /^# /.test(l)) || '').slice(2));
  const hi = t.findIndex(l => /^\| Category /.test(l));
  if (!name || hi < 0) continue;
  const hdr = cellsOf(t[hi]), row = cellsOf(t[hi + 2]);
  const col = n => { const i = hdr.findIndex(x => x.toLowerCase() === n); return i >= 0 ? plain(row[i]) : ''; };
  const di = t.findIndex(l => /^## Description/.test(l));
  const desc = di >= 0 ? t.slice(di + 1).map(plain).find(l => l.length > 25 && !/^From /.test(l)) || '' : '';
  const cost = col('cost'), special = col('special');
  WEAPON_NAMES.add(name.toLowerCase());
  addM({ n: name, u: 'equipment/weapons/' + f.replace(/\.md$/, '/'), a: '', t: 'Weapon', m: 1, ...(cost && cost !== '—' ? { pt: cost, ...(priceNumber(cost) != null ? { p: priceNumber(cost) } : {}) } : {}),
    ...(col('weight') && col('weight') !== '—' ? { w: col('weight') } : {}), ...(special && special !== '—' ? { sl: special } : {}),
    x: desc.length > 220 ? desc.slice(0, 217) + '…' : desc, b: 'Weapons' });
}

for (const file of mundaneFiles(EQ).sort()) {
  const rel = path.relative(EQ, file).replace(/\\/g, '/');
  if (SKIP_EQ.has(rel) || /^technology-weapons/.test(rel)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const used = new Map(); const heads = []; let fence = false, title = '';
  lines.forEach((l, i) => {
    if (l.startsWith('```')) fence = !fence;
    const m = fence ? null : l.match(/^(#{1,6}) (.*?)\s*#*\s*$/);
    if (!m) return;
    const id = slugify(m[2]) || 'section'; const n = used.get(id) || 0; used.set(id, n + 1);
    heads.push({ i, lvl: m[1].length, text: plain(m[2]), id: n ? id + '_' + n : id });
    if (m[1].length === 1 && !title) title = plain(m[2]);
  });
  const url = toMd(rel);
  const headingAt = i => { let h = null; for (const x of heads) { if (x.i < i) h = x; else break; } return h; };
  const h2At = i => { let h = null; for (const x of heads) { if (x.i < i) { if (x.lvl >= 2 && x.lvl <= 3) h = x; } else break; } return h; };
  const byName = new Map(heads.filter(h => h.lvl >= 3).map(h => [h.text.toLowerCase(), h]));
  // 1) headed entries with a Price / Cost line
  heads.forEach((h, k) => {
    if (h.lvl < 3) return;
    const end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
    const first = lines.slice(h.i + 1, end).filter(l => l.trim()).slice(0, 3).join(' ; ');
    if (!/\*\*(Price|Cost)\*\*/.test(first) || /\*\*(Aura|CL|Slot)\*\*/.test(first)) return;
    const priceT = field(first, 'Price') || field(first, 'Cost');
    const parent = (() => { let g = null; for (const x of heads) { if (x.i < h.i && x.lvl < h.lvl && x.lvl >= 2) g = x; } return g; })();
    const desc = lines.slice(h.i + 1, end).filter(l => l.trim() && !/^\s*\*\*(Price|Cost|Weight|Type|Proficiency|Damage|Critical|Range|Capacity|Usage|Special|Construction|Requirements)/.test(l)).map(plain).find(l => l.length > 25) || '';
    addM({ n: h.text, u: url, a: h.id, t: mundaneType(parent ? parent.text : '', rel, h.text, ''), m: 1,
      ...(priceT ? { pt: priceT, ...(priceNumber(priceT) != null ? { p: priceNumber(priceT) } : {}) } : {}),
      ...(field(first, 'Weight') ? { w: field(first, 'Weight') } : {}), x: desc.length > 220 ? desc.slice(0, 217) + '…' : desc, b: title });
  });
  // 2) table rows with a price column
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|/.test(lines[i]) || !/^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) continue;
    const hdr = cellsOf(lines[i]).map(x => plain(x).toLowerCase());
    const pi = hdr.findIndex(x => /^(price|cost|market price|item cost)/.test(x));
    if (pi < 0) { continue; }
    const wi = hdr.findIndex(x => /^(weight|wt)/.test(x));
    const h = h2At(i);
    let r = i + 2, group = '';
    for (; r < lines.length && /^\|/.test(lines[r]); r++) {
      const c = cellsOf(lines[r]);
      const name = plain(c[0]).replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰†‡*]+$/, '').trim();
      const priceT = plain(c[pi] || '');
      if (name && c.slice(1).every(x => !plain(x) || /^[-—]+$/.test(plain(x)))) { if (mundaneType('', rel, '', name, true)) group = name; continue; }
      if (/^\+/.test(priceT) || WEAPON_NAMES.has(name.toLowerCase()) || /^(brown|black|white|gray|grey|green|red|blue|orange|yellow|purple|pink|silver|gold|prismatic|average|good|poor|common|squalid|rich)$/i.test(name)) continue;
      if (!name || !priceT || /^[-—]+$/.test(name) || /^(item|armor|shields?|weapon|cost|price|light|medium|heavy|simple|martial|exotic)\b.*\b(armor|weapons?|items?)?$/i.test(name) && !priceT.match(/\d/)) continue;
      if (!/\d/.test(priceT) && !/free|varies|see text/i.test(priceT)) continue;
      const own = byName.get(name.toLowerCase());
      const sec = h || headingAt(i) || { id: '', text: title };
      addM({ n: name, u: url, a: own ? own.id : sec.id, t: mundaneType(sec.text || '', rel, name, group), m: 1, pt: priceT,
        ...(priceNumber(priceT) != null ? { p: priceNumber(priceT) } : {}), ...(wi >= 0 && c[wi] && plain(c[wi]) !== '—' ? { w: plain(c[wi]) } : {}), x: '', b: title });
    }
    i = r;
  }
}

fs.writeFileSync(OUT, JSON.stringify({ items }));
const count = {};
items.forEach(i => { const k = (i.m ? 'Mundane: ' : '') + i.t + (i.sl && !i.m ? ' / ' + i.sl : ''); count[k] = (count[k] || 0) + 1; });
console.log('item-data.json:', items.length, 'items');
Object.keys(count).sort().forEach(k => console.log('  ' + k + ': ' + count[k]));
