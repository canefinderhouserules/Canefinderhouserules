// Data for the subsystem Enemy Builders (docs/tools/starwars-builder.md, naruto-builder.md, heroes-builder.md), from each
// subsystem's pages (Star Wars, Naruto / chakra, Heroes): the three classes (their tables), the class feature lists with
// each feature's price and level, the generic class features, and the extras each has (lightsabers, blasters and forms;
// Force powers; jutsu and elements). A listed feature's level is worked out from its source: the class's feature table
// (docs/tools/archetypes/*.json), the archetype ability, or the prestige class table (+3 levels, as the lists count
// them); else the list's band.
// Writes docs/tools/{starwars,chakra,superheroes}-builder-data.json. Run: node tools/build-starwars-builder.js (after build-archetypes.js)
'use strict';
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
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

// ---- the subsystems: Star Wars, Naruto (chakra) and Heroes share the same rules; only names, pages and extras change.
// classes: [name, key] in role order (martial, specialist, caster)
const SUBS = [
  { id: 'starwars', dir: 'campaign-systems/star-wars/', index: 'index.md', out: 'starwars-builder-data.json',
    classes: [['Warrior', 'warrior'], ['Specialist', 'specialist'], ['Consular', 'consular']], sabers: 'lightsabers.md', powers: 'force-powers.md' },
  { id: 'chakra', dir: 'campaign-systems/chakra/', index: 'chakra-system.md', out: 'chakra-builder-data.json',
    classes: [['Shinobi Warrior', 'shinobi-warrior'], ['Shinobi Specialist', 'shinobi-specialist'], ['Jutsu Master', 'jutsu-master']], jutsu: 'jutsu.md', elements: 'elements.md' },
  { id: 'superheroes', dir: 'campaign-systems/superheroes/', index: 'index.md', out: 'superheroes-builder-data.json',
    classes: [['Warrior', 'warrior'], ['Specialist', 'specialist'], ['Power Master', 'power-master']] }
];

// ---- a subsystem's three classes: each from its Hit Die line to the next one (the table, dice, skills, proficiency)
function readClasses(sub) {
  const index = read(sub.dir + sub.index), at = [...index.matchAll(/Hit Die\**:?\**\s*d\d+/g)].map(m => m.index);
  const end = index.search(/^## Favored Class/m);
  return sub.classes.map(([name, key], ci) => {
    const part = index.slice(at[ci], at[ci + 1] || (end > at[ci] ? end : undefined));
    const lines = part.split('\n'), h = lines.findIndex(l => /^\|\s*\**Level\**\s*\|\s*\**BAB/.test(l));
    const head = cells(lines[h]), known = head.map((c, i) => /^(Known )?\d+(st|nd|rd|th)$/.test(c) ? i : -1).filter(i => i >= 0);
    const sp = head.findIndex(c => /^Special/.test(c));
    const table = [], special = [], powers = [];
    for (let j = h + 2; lines[j] && lines[j].startsWith('|'); j++) {
      const c = cells(lines[j]);
      table.push([num(c[1]), num(c[2]), num(c[3]), num(c[4])]);
      special.push(c[sp]);
      powers.push(known.map(i => /^\d+$/.test(c[i]) ? +c[i] : 0));
    }
    return {
      n: name, s: key, role: ['martial', 'specialist', 'caster'][ci],
      die: +(part.match(/Hit Die\**:?\**\s*d(\d+)/) || [])[1],
      stamina: +(part.match(/(?:Stamina|Chakra) Die\**:?\**:?\s*d(\d+)/i) || [])[1],
      ranks: +(part.match(/Skill Ranks per Level\**:?\**\s*(\d+)/) || [])[1],
      skillPicks: +(part.match(/Class Skills are (\d+) of your choice/i) || [])[1] || 8,
      prof: clean((part.match(/Weapon and Armor Proficiency\**\s*\n+([^\n]+)/) || [])[1] || ''),
      table, special, powers
    };
  });
}

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

// ---- the text of a listed feature: the section its link points to, or the archetype's ability of that name
const anchorOf = s => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
function plain(md) {
  return md.replace(/^\?\?\?[^\n]*\n(?:(?: {4}|\t)[^\n]*\n|\s*\n)*/gm, '') // "??? note" blocks (the original rule)
    .split('\n').filter(l => !/^\s*\|/.test(l) && !/^#/.test(l)).join(' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}
const sectionCache = {};
function sectionText(file, anchor) {
  if (!sectionCache[file]) {
    const out = {};
    try {
      const parts = read(file).split(/^(#{2,5} .+)$/m);
      for (let i = 1; i < parts.length; i += 2) { const k = anchorOf(parts[i].replace(/^#+\s*/, '')); if (!(k in out)) out[k] = plain(parts[i + 1] || ''); }
    } catch (e) {}
    sectionCache[file] = out;
  }
  return sectionCache[file][anchor] || '';
}
function featureText(name, href) {
  const [file, anchor] = href.replace(/^(\.\.\/)+/, '').split('#');
  if (/-archetypes\.md$/.test(file)) {
    const page = file.replace(/\.md$/, '/'), ability = norm(name.replace(/\s*\([^)]*\)\s*$/, ''));
    for (const cls of Object.keys(ARCH)) for (const a of ARCH[cls].archetypes) {
      if (a.anchor !== anchor || a.page !== page) continue;
      const b = a.abilities.find(x => norm(x.name) === ability) || a.abilities.find(x => norm(x.name).startsWith(ability));
      if (b) return plain(b.html.replace(/<p>This ability (replaces|alters|modifies)[\s\S]*?<\/p>/gi, ''));
    }
  }
  return sectionText(file, anchor || '');
}

// ---- the levels at which a bonus feat feature gives a feat (as the source class does)
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, two: 2, three: 3, four: 4, five: 5, six: 6 };
function featLevels(name, href, text, lvl) {
  if (!/^(Bonus Feats?|Teamwork Feat|Combat Style Feat)\b/i.test(name)) return null;
  const [file, anchor] = href.replace(/^(\.\.\/)+/, '').split('#');
  let m = file.match(/^characters\/classes\/(?:legendary\/)?([a-z0-9-]+?)\.md$/);
  if (m && !/-archetypes$/.test(m[1]) && ARCH[m[1]]) {
    const us = ARCH[m[1]].units.filter(u => u.sec === anchor);
    if (us.length) return [...new Set(us.map(u => u.lvl))].sort((a, b) => a - b);
  }
  if (/^characters\/prestige-classes\//.test(file)) {
    try {
      const lines = read(file).split('\n'), h = lines.findIndex(l => /^\| Level \|/.test(l)), out = [];
      for (let j = h + 2; h >= 0 && lines[j] && lines[j].startsWith('|'); j++) if (/bonus feat|teamwork feat/i.test(lines[j])) out.push(Math.min(20, j - h - 1 + 3));
      if (out.length) return out;
    } catch (e) {}
  }
  // an archetype's ability: the levels its text names, and "every N levels" after the last one
  const t = text.slice(0, 400), out = [...t.matchAll(/\b(\d+)(?:st|nd|rd|th)\b/g)].map(x => +x[1]).filter(n => n <= 20);
  const ev = t.match(/every (\w+) levels/i), step = ev ? (+ev[1] || ORD[ev[1].toLowerCase()]) : 0;
  if (!out.length) out.push(lvl);
  if (step) for (let n = out[out.length - 1] + step; n <= 20; n += step) out.push(n);
  return [...new Set(out)].sort((a, b) => a - b);
}

// ---- how a listed feature grows: its labels by level in its class table ("Sneak attack +2d6" at 3rd...),
// so the builder shows the wiki's numbers at the enemy's level (a prestige class's levels are its own)
function progression(name, href) {
  const [file, anchor] = href.replace(/^(\.\.\/)+/, '').split('#');
  const keep = list => list.length && list.some(p => /\d/.test(p[1])) ? list : null;
  let m = file.match(/^characters\/classes\/(?:legendary\/)?([a-z0-9-]+?)\.md$/);
  if (m && !/-archetypes$/.test(m[1]) && ARCH[m[1]]) {
    return keep(ARCH[m[1]].units.filter(u => u.sec === anchor && !u.sub).sort((a, b) => a.lvl - b.lvl).map(u => [u.lvl, clean(u.label)]));
  }
  if (/^characters\/prestige-classes\//.test(file)) {
    try {
      const lines = read(file).split('\n'), h = lines.findIndex(l => /^\| Level \|/.test(l)), out = [], k = norm(name.replace(/\s*\([^)]*\)\s*$/, ''));
      if (h < 0) return null;
      const sp = cells(lines[h]).findIndex(c => /^Special/i.test(c));
      for (let j = h + 2; lines[j] && lines[j].startsWith('|'); j++) {
        String(cells(lines[j])[sp] || '').split(/,\s*/).forEach(x => { if (norm(x.replace(/\s*[+\d/].*$/, '')) === k) out.push([j - h - 1, x.trim()]); });
      }
      return keep(out);
    } catch (e) { return null; }
  }
  return null;
}

// ---- one subsystem's data
function buildSub(sub) {
  const classes = readClasses(sub), D = sub.dir;
  // the class feature lists: [name, link, price, level, band low, text index, feat levels, progression]
  const PRICE = { 'Iconic': 'iconic', 'Overpowered (OP)': 'op', 'Common': 'common', 'Weak': 'weak' };
  const lists = {}, texts = [], textIdx = {};
  let exact = 0, total = 0, withText = 0;
  for (const c of classes) {
    const text = read(D + 'class-features-' + c.s + '.md'), out = [];
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
        const link = path.posix.normalize(path.posix.join(D, x[2])).replace(/\.md(#|$)/, '/$1');
        const t = short(featureText(x[1], x[2]), 900);
        let ti = -1;
        if (t) { withText++; ti = textIdx[t] != null ? textIdx[t] : (textIdx[t] = texts.push(t) - 1); }
        const at = lvl && lvl >= band[0] && lvl <= band[1] ? lvl : band[0], fl = featLevels(x[1], x[2], t, at);
        const pg = progression(x[1], x[2]), row = [x[1], link, PRICE[p[1]], at, band[0], ti];
        if (fl || pg) row.push(fl || null); if (pg) row.push(pg);
        out.push(row);
      }
    }
    lists[c.s] = out;
  }

  // generic class features: "**Price:** Weak. **Level:** 2nd (Shinobi Specialist and Jutsu Master only)." or "Warrior 3, Consular 5"
  const nameRe = classes.map(c => c.n.replace(/ /g, '\\s+')).join('|');
  const generic = read(D + 'generic-class-features.md').split(/^## /m).slice(1).map(part => {
    const name = part.split('\n')[0].trim();
    const meta = (part.match(/\*\*Price:\*\*\s*(\w+)\.\s*\*\*Level:\*\*\s*([^\n]*)/) || []);
    const price = String(meta[1] || 'common').toLowerCase().replace('overpowered', 'op');
    const lv = String(meta[2] || ''), levels = {};
    const only = lv.match(/\(([^)]*) only\)/);
    const per = [...lv.matchAll(new RegExp('(' + nameRe + ') (\\d+)', 'g'))];
    if (per.length) per.forEach(m => { const c = classes.find(x => x.n === m[1].replace(/\s+/g, ' ')); if (c) levels[c.s] = +m[2]; });
    else classes.forEach(c => { if (!only || new RegExp('\\b' + c.n + '\\b', 'i').test(only[1])) levels[c.s] = num(lv) || 1; });
    const text = clean(part.split('\n').slice(1).filter(l => !/\*\*Price:/.test(l)).join(' '));
    return { n: name, price, levels, text: short(text, 600), link: D + 'generic-class-features/#' + name.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') };
  });

  // lightsabers, blasters and lightsaber forms (Star Wars)
  const weapons = [];
  let forms = [];
  if (sub.sabers) {
    const sabers = read(D + sub.sabers);
    let cat = null;
    for (const line of sabers.split('\n')) {
      const hd = line.match(/^### (?:\(Advanced\) )?(Light Melee Weapons|One-Handed|Two-Handed)/);
      if (hd) { cat = /Blasters/.test(line) ? 'ranged' : /Light/.test(hd[1]) ? 'light' : /One/.test(hd[1]) ? 'one-handed' : 'two-handed'; continue; }
      if (/^##? /.test(line)) cat = null;
      if (!cat || !/^\| [^-W]/.test(line)) continue;
      const c = cells(line);
      if (!c[0] || /^Weapon$/.test(c[0])) continue;
      const blaster = cat === 'ranged';
      const crit = c[4].replace(/×/g, 'x'), k = crit.match(/(?:(\d+)-20\/?)?x(\d)/) || [];
      const name = blaster ? c[0] : (/lightsaber/i.test(c[0]) ? c[0] : c[0] + ' lightsaber');
      weapons.push({ n: name.replace(/^Lightsaber lightsaber$/i, 'Lightsaber'), c: cat, d: (c[3].match(/\d+d\d+/) || ['1d6'])[0], t: k[1] ? +k[1] : 20, x: k[2] ? +k[2] : 2,
        r: blaster ? num(c[5]) : 0, sp: clean(c[blaster ? 9 : 7] || ''), blaster });
    }
    forms = [...sabers.matchAll(/^\*\*([A-Z][\w-]+(?: [\w-]+)? (?:Novice|Expert|Master)):\*\*\s*\n([\s\S]*?)(?=^\*\*[A-Z][\w-]+(?: [\w-]+)? (?:Novice|Expert|Master):\*\*|^## |(?![\s\S]))/gm)].map(m => {
      const req = (m[2].match(/character level (\d+)/i) || [])[1];
      return { n: m[1], lvl: req ? +req : 1, text: short(clean(m[2].replace(/^\*Requirement[^\n]*\n/m, '').replace(/^Benefit:\s*/m, '')), 500) };
    });
  }

  // the subsystem's own powers: Force powers (their stat blocks) or jutsu ("**Name [level]:** text")
  const powers = [];
  if (sub.powers) {
    read(D + sub.powers).split(/^\*\*(?=[^*\n]+\*\*\s*$)/m).slice(1).forEach(part => {
      const name = part.split('**')[0].trim(), body = part.slice(part.indexOf('**') + 2);
      const field = k => clean((body.match(new RegExp('^' + k + ':?\\s*([^\\n]*)', 'im')) || [])[1] || '');
      const lvl = num((field('level').match(/(\d+)/) || [])[1]);
      if (!field('Stamina Cost') && !field('level')) return;
      const save = (body.match(/^Saving Throw:?\s*([^;\n]*)/im) || [])[1] || '';
      powers.push({ n: name, lvl, cost: field('Stamina Cost'), save: clean(save).split(/[.;]/)[0].trim(), range: field('Range'), dur: field('Duration'),
        text: short(clean(field('Description') || body.split('\n').filter(l => l.trim() && !/^[A-Z][\w ]+:/.test(l)).join(' ')), 500) });
    });
  }
  if (sub.jutsu) {
    read(D + sub.jutsu).split(/^## Other Jutsu/m).forEach((part, k) => {
      for (const m of part.matchAll(/^\*\*([^*\[]+?)\s*\[(\d+)\]:\*\*\s*(.+)$/gm)) {
        if (/to be defined/i.test(m[3])) continue;
        powers.push({ n: m[1].trim(), lvl: +m[2], cost: (m[3].match(/(\d+) chakra/) || [])[1] || '', save: '', range: '', dur: '', free: !k, text: short(clean(m[3]), 500) });
      }
    });
  }
  // elements (Naruto): the common ones (the classes' Elemental Affinity) and the extra ones, each taken as a feat
  const elPage = sub.elements ? read(D + sub.elements).split(/^## Extra Elements/m) : ['', ''];
  const elements = sub.elements ? [...elPage[0].matchAll(/^\*\*(\w+):\*\*/gm)].map(m => m[1]) : [];
  const extraElements = sub.elements ? [...(elPage[1] || '').matchAll(/^\*\*(\w+):\*\*/gm)].map(m => m[1]) : [];

  fs.writeFileSync(path.join(DOCS, 'tools', sub.out), JSON.stringify({ sub: sub.id, dir: D, classes, lists, texts, generic, weapons, forms, powers, elements, extraElements }));
  console.log(sub.out + ':', classes.map(c => c.n + ' (' + c.table.length + ' levels, d' + c.die + ', ' + c.stamina + ' stamina)').join(', ') + ';', total, 'listed features (' + exact + ' with an exact level, ' + withText + ' with text),',
    generic.length, 'generic,', weapons.length, 'weapons,', forms.length, 'forms,', powers.length, 'powers,', elements.length, 'elements');
}
SUBS.forEach(buildSub);
