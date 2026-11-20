// Data for the Star Wars Enemy Builder (docs/tools/starwars-builder.md), from the Star Wars subsystem's pages:
// the three classes (their tables), the Warrior / Specialist / Consular class feature lists with each feature's price
// and level, the generic class features, the lightsabers and blasters, the lightsaber forms and the Force powers.
// A listed feature's level is worked out from its source: the class's feature table (docs/tools/archetypes/*.json),
// the archetype ability, or the prestige class table (+3 levels, as the lists count them); else the list's band.
// Writes docs/tools/starwars-builder-data.json. Run: node tools/build-starwars-builder.js (after build-archetypes.js)
'use strict';
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
const SW = 'campaign-systems/star-wars/';
const read = f => fs.readFileSync(path.join(DOCS, f), 'utf8').replace(/\r/g, '');
const clean = s => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
const cells = line => line.split('|').slice(1, -1).map(c => clean(c));
const norm = s => String(s).toLowerCase().replace(/’/g, "'").replace(/\((ex|su|sp)[^)]*\)/gi, '').replace(/[^a-z0-9]+/g, ' ').trim();
const num = s => parseInt(String(s).replace(/[–—−]/g, '-'), 10) || 0;
function short(t, n) {
  if (t.length <= n) return t;
  const cut = t.slice(0, n), dot = cut.lastIndexOf('. ');
  return dot > n / 2 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

// ---- the three classes
const index = read(SW + 'index.md');
const classes = ['Warrior', 'Specialist', 'Consular'].map(name => {
  const part = index.split(/^### /m).find(p => p.startsWith(name + '\n'));
  const lines = part.split('\n'), h = lines.findIndex(l => /^\| Level \| BAB/.test(l));
  const head = cells(lines[h]), known = head.map((c, i) => /^Known/.test(c) ? i : -1).filter(i => i >= 0);
  const table = [], special = [], powers = [];
  for (let j = h + 2; lines[j] && lines[j].startsWith('|'); j++) {
    const c = cells(lines[j]);
    table.push([num(c[1]), num(c[2]), num(c[3]), num(c[4])]);
    special.push(c[5]);
    powers.push(known.map(i => /^\d+$/.test(c[i]) ? +c[i] : 0));
  }
  return {
    n: name, s: name.toLowerCase(),
    die: +(part.match(/Hit Die\**:?\**\s*d(\d+)/) || [])[1],
    stamina: +(part.match(/Stamina Die:?\**:?\s*d(\d+)/i) || [])[1],
    ranks: +(part.match(/Skill Ranks per Level\**:?\**\s*(\d+)/) || [])[1],
    skillPicks: +(part.match(/Class Skills are (\d+) of your choice/i) || [])[1] || 8,
    prof: clean((part.match(/##### Weapon and Armor Proficiency\n([^\n]+)/) || [])[1] || ''),
    table, special, powers
  };
});

// ---- where each listed feature comes from, to find its level
const ARCH = {};
for (const f of fs.readdirSync(path.join(DOCS, 'tools', 'archetypes'))) ARCH[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(DOCS, 'tools', 'archetypes', f), 'utf8'));
const prestigeCache = {};
function prestigeLevels(file) { // feature name -> level, from the prestige class table's Special column
  if (prestigeCache[file]) return prestigeCache[file];
  const out = {};
  try {
    const lines = read(file).split('\n'), h = lines.findIndex(l => /^\| Level \|/.test(l));
    if (h >= 0) {
      const sp = cells(lines[h]).findIndex(c => /^Special/i.test(c));
      for (let j = h + 2; lines[j] && lines[j].startsWith('|'); j++) {
        const c = cells(lines[j]);
        String(c[sp] || '').split(/,\s*/).forEach(x => { const k = norm(x.replace(/\s*[+\d/].*$/, '')); if (k && !(k in out)) out[k] = j - h - 1; });
      }
    }
  } catch (e) {}
  return (prestigeCache[file] = out);
}
function featureLevel(name, href) {
  const [file, anchor] = href.replace(/^(\.\.\/)+/, '').split('#');
  let m = file.match(/^characters\/classes\/(?:legendary\/)?([a-z0-9-]+?)\.md$/);
  if (m && !/-archetypes$/.test(m[1]) && ARCH[m[1]]) {
    const us = ARCH[m[1]].units.filter(u => u.sec === anchor);
    if (us.length) return Math.min(...us.map(u => u.lvl));
  }
  m = file.match(/^characters\/classes\/(?:legendary\/)?([a-z0-9-]+)\.md$/);
  if (m) {
    const page = file.replace(/\.md$/, '/'), ability = norm(name.replace(/\s*\([^)]*\)\s*$/, ''));
    for (const cls of Object.keys(ARCH)) for (const a of ARCH[cls].archetypes) {
      if (a.anchor !== anchor || a.page !== page) continue;
      const units = {}; ARCH[cls].units.forEach(u => { units[u.id] = u; });
      const b = a.abilities.find(x => norm(x.name) === ability) || a.abilities.find(x => norm(x.name).startsWith(ability));
      if (!b) continue;
      if (b.lvl) return b.lvl;
      const ids = b.replaces.concat(b.modifies).filter(id => units[id]);
      if (ids.length) return Math.min(...ids.map(id => units[id].lvl));
    }
  }
  if (/^characters\/prestige-classes\//.test(file)) {
    const L = prestigeLevels(file), k = norm(name.replace(/\s*\([^)]*\)\s*$/, ''));
    if (L[k]) return Math.min(20, L[k] + 3);
  }
  return 0;
}

// ---- the class feature lists: [name, link, price, level, band low]
const PRICE = { 'Iconic': 'iconic', 'Overpowered (OP)': 'op', 'Common': 'common', 'Weak': 'weak' };
const lists = {};
let exact = 0, total = 0;
for (const c of classes) {
  const text = read(SW + 'class-features-' + c.s + '.md'), out = [];
  let band = [1, 20];
  for (const line of text.split('\n')) {
    const b = line.match(/^## Levels (\d+)[–-](\d+)/);
    if (b) { band = [+b[1], +b[2]]; continue; }
    const p = line.match(/^\*\*(Iconic|Overpowered \(OP\)|Common|Weak):\*\* (.*)$/);
    if (!p) continue;
    for (const x of p[2].matchAll(/\[([^\]]+)\]\(([^)\s]+)(?: "[^"]*")?\)/g)) {
      const lvl = featureLevel(x[1], x[2]);
      total++; if (lvl) exact++;
      // links become paths from the site root
      const link = path.posix.normalize(path.posix.join(SW, x[2])).replace(/\.md(#|$)/, '/$1');
      out.push([x[1], link, PRICE[p[1]], lvl && lvl >= band[0] && lvl <= band[1] ? lvl : band[0], band[0]]);
    }
  }
  lists[c.s] = out;
}

// ---- generic class features
const generic = read(SW + 'generic-class-features.md').split(/^## /m).slice(1).map(part => {
  const name = part.split('\n')[0].trim();
  const meta = (part.match(/\*\*Price:\*\*\s*(\w+)\.\s*\*\*Level:\*\*\s*([^\n]*)/) || []);
  const price = String(meta[1] || 'common').toLowerCase().replace('overpowered', 'op');
  const lv = String(meta[2] || ''), levels = {};
  const only = lv.match(/\(([^)]*) only\)/); // "2nd (Specialist and Consular only)"
  if (/(Warrior|Specialist|Consular) \d/.test(lv)) for (const m of lv.matchAll(/(Warrior|Specialist|Consular) (\d+)/g)) levels[m[1].toLowerCase()] = +m[2];
  else ['warrior', 'specialist', 'consular'].forEach(k => { if (!only || new RegExp(k, 'i').test(only[1])) levels[k] = num(lv) || 1; });
  const text = clean(part.split('\n').slice(1).filter(l => !/\*\*Price:/.test(l)).join(' '));
  return { n: name, price, levels, text: short(text, 600), link: SW + 'generic-class-features/#' + name.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') };
});

// ---- lightsabers and blasters
const sabers = read(SW + 'lightsabers.md');
const weapons = [];
{
  let cat = null;
  for (const line of sabers.split('\n')) {
    const hd = line.match(/^### (?:\(Advanced\) )?(Light Melee Weapons|One-Handed|Two-Handed)/);
    if (hd) { cat = /Blasters/.test(line) ? 'ranged' : /Light/.test(hd[1]) ? 'light' : /One/.test(hd[1]) ? 'one-handed' : 'two-handed'; continue; }
    if (/^##? /.test(line)) cat = null;
    if (!cat || !/^\| [^-W]/.test(line)) continue;
    const c = cells(line);
    if (!c[0] || /^Weapon$/.test(c[0])) continue;
    const blaster = cat === 'ranged';
    const crit = (blaster ? c[4] : c[4]).replace(/×/g, 'x'), k = crit.match(/(?:(\d+)-20\/?)?x(\d)/) || [];
    const name = blaster ? c[0] : (/lightsaber/i.test(c[0]) ? c[0] : c[0] + ' lightsaber');
    weapons.push({ n: name.replace(/^Lightsaber lightsaber$/i, 'Lightsaber'), c: cat, d: (c[3].match(/\d+d\d+/) || ['1d6'])[0], t: k[1] ? +k[1] : 20, x: k[2] ? +k[2] : 2,
      r: blaster ? num(c[5]) : 0, sp: clean(c[blaster ? 9 : 7] || ''), blaster });
  }
}

// ---- lightsaber forms (style feats) and Force powers
const forms = [...sabers.matchAll(/^\*\*([A-Z][\w-]+(?: [\w-]+)? (?:Novice|Expert|Master)):\*\*\s*\n([\s\S]*?)(?=^\*\*[A-Z][\w-]+(?: [\w-]+)? (?:Novice|Expert|Master):\*\*|^## |(?![\s\S]))/gm)].map(m => {
  const req = (m[2].match(/character level (\d+)/i) || [])[1];
  return { n: m[1], lvl: req ? +req : 1, text: short(clean(m[2].replace(/^\*Requirement[^\n]*\n/m, '').replace(/^Benefit:\s*/m, '')), 500) };
});
const fp = read(SW + 'force-powers.md');
const powers = [];
fp.split(/^\*\*(?=[^*\n]+\*\*\s*$)/m).slice(1).forEach(part => {
  const name = part.split('**')[0].trim(), body = part.slice(part.indexOf('**') + 2);
  const field = k => clean((body.match(new RegExp('^' + k + ':?\\s*([^\\n]*)', 'im')) || [])[1] || '');
  const lvl = num((field('level').match(/(\d+)/) || [])[1]);
  if (!field('Stamina Cost') && !field('level')) return;
  const save = (body.match(/^Saving Throw:?\s*([^;\n]*)/im) || [])[1] || '';
  powers.push({ n: name, lvl, cost: field('Stamina Cost'), save: clean(save).split(/[.;]/)[0].trim(), range: field('Range'), dur: field('Duration'),
    text: short(clean(field('Description') || body.split('\n').filter(l => l.trim() && !/^[A-Z][\w ]+:/.test(l)).join(' ')), 500) });
});

const out = path.join(DOCS, 'tools', 'starwars-builder-data.json');
fs.writeFileSync(out, JSON.stringify({ classes, lists, generic, weapons, forms, powers }));
console.log('starwars-builder-data.json:', classes.length, 'classes,', total, 'listed features (' + exact + ' with an exact level),', generic.length, 'generic,',
  weapons.length, 'weapons,', forms.length, 'forms,', powers.length, 'Force powers');
