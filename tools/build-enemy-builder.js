// Data for the Enemy Builder (docs/tools/enemy-builder.md): weapons (simple, martial, exotic, eastern, firearms) and armor read from the wiki's equipment tables,
// every feat name, and what each spell of tools/spell-rolls.js does at caster levels 1-20 (damage, healing, rays,
// effects), so the builder's spell buttons roll the same as the generated monster pages.
// Writes docs/tools/enemy-builder-data.json. Run: node tools/build-enemy-builder.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spellRoll, SPELL_TABLE } = require('./spell-rolls');

const DOCS = path.join(__dirname, '..', 'docs');
const read = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
const clean = s => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
const cells = line => line.split('|').slice(1, -1).map(c => clean(c));

// ---- weapons: "| (Martial) One-Handed Melee Weapons | Cost | Dmg (S) | Dmg (M) | Critical | Range | Weight | Type | Special |"
function crit(s) {
  s = s.replace(/×/g, 'x').replace(/[–—]/g, '-');
  const m = s.match(/(?:(\d+)-20\/)?x(\d)/);
  if (!m) return { threat: 20, mult: 2 };
  return { threat: m[1] ? +m[1] : 20, mult: +m[2] };
}
const weapons = [];
// (the eastern table says the proficiency in each header: "(Martial – Eastern) Light Melee Weapons")
// all the weapon tables are in equipment/weapons.md; the proficiency is read from each table's header
for (const [file, fixed] of [['weapons.md', null]]) {
  let prof = fixed;
  let cat = null;
  for (const line of read('equipment/' + file).split('\n')) {
    if (!line.startsWith('|')) { cat = null; continue; }
    const head = line.match(/^\|\s*\((\w+)(?:\s*[–-]\s*\w+)?\)\s*([\w-]+(?: Melee)?) (?:Melee )?Weapons\s*\|\s*Cost/i);
    if (head) { if (!fixed) prof = head[1].toLowerCase(); const h = head[2].toLowerCase(); cat = /ranged/.test(line.toLowerCase()) ? 'ranged' : /two/.test(h) ? 'two-handed' : /one/.test(h) ? 'one-handed' : 'light'; continue; }
    if (!cat || /^\|\s*-/.test(line)) continue;
    const c = cells(line);
    if (c.length < 9 || !c[0] || !/\d+d\d+|^1$|^\d+$/.test(c[3])) continue;
    const name = c[0].replace(/\s+,/g, ',').replace(/\s*\d+$/, '');
    if (weapons.some(w => w.n.toLowerCase() === name.toLowerCase())) continue;
    const dM = (c[3].match(/\d+d\d+|^\d+$/) || [''])[0];
    const k = crit(c[4]);
    const range = (c[5].match(/(\d+) ft/) || [])[1];
    weapons.push({ n: name, p: prof, c: cat, d: dM, t: k.threat, x: k.mult, r: range ? +range : 0, ty: c[7], sp: /—|^-$/.test(c[8]) ? '' : c[8] });
  }
}
// firearms: "| **(Early) One-Handed Firearms** | Cost | Dmg (S) | Dmg (M) | Critical | Range | Misfire | Capacity | Weight | Type | Special |"
{
  let on = false;
  for (const line of read('equipment/weapons.md').split('\n')) {
    if (!line.startsWith('|')) { on = false; continue; }
    if (/Firearms\**\s*\|\s*\**Cost/.test(line)) { on = true; continue; }
    const c = cells(line);
    if (!on || c.length < 10 || !c[0] || !/\d+d\d+/.test(c[3])) continue;
    const name = c[0].replace(/\s*\d+$/, '');
    if (weapons.some(w => w.n.toLowerCase() === name.toLowerCase())) continue;
    const k = crit(c[4]), range = (c[5].match(/(\d+) ft/) || [])[1];
    weapons.push({ n: name, p: 'exotic', c: 'ranged', d: (c[3].match(/\d+d\d+/) || [''])[0], t: k.threat, x: k.mult, r: range ? +range : 0, ty: c[9],
      sp: 'firearm' + (c[10] && !/^(—|-)$/.test(c[10]) ? ', ' + c[10] : '') });
  }
}
weapons.sort((a, b) => a.n.localeCompare(b.n));

// ---- fighter weapon groups (the wiki's Weapon Focus takes a group): the fighter's expanded lists and the new weapons'
// "- **Blades, Heavy**: bastard sword, ..." -> group "heavy blades"; each weapon gets g: [groups]
const groupName = g => g.toLowerCase().replace(/^(\w+), (\w+)$/, '$2 $1');
// a weapon name as a sorted word set: "Longbow, composite" = "composite longbow"; loose: no hyphens, no plural s,
// no race word, so "Sea-knife" = "seaknife", "Bola" = "bolas", "Kobold tail attachment, (pounder)" = "pounder tail attachment"
const wkey = (n, loose) => {
  let s = n.replace(/(AA|AG|UE|APG|ARG)\d*$/, '').toLowerCase().replace(/[’']/g, '').replace(/[()]/g, ' ').replace(/^(.*?), (.*)$/, '$2 $1').replace(/\b(steel|wooden)\b/g, '');
  if (loose) s = s.replace(/-/g, '').replace(/\b(dwarven|elven|gnome|halfling|kobold|orc|ratfolk|sword)\b/g, '');
  let w = s.split(/[\s,-]+/).filter(Boolean);
  if (loose) w = w.map(x => x.replace(/([^s])s$/, '$1').replace(/(\w)\1/g, '$1')); // "Ammentum" (the table's spelling) = "amentum"
  return w.sort().join(' ');
};
const GROUPS = {};
for (const [file, head] of [['characters/classes/fighter-archetypes.md', 'Expanded Weapon Groups'], ['equipment/weapons-aa2.md', 'Fighter Weapon Groups'],
  ['characters/classes/legendary/legendary-fighter-options.md', 'Legendary Fighter Weapon Groups']]) {
  // the legendary list ends where it gives examples of groups a GM could add (Pirate, Tribal)
  const sec = ((read(file).split(/^#{2,3} /m).find(s => s.startsWith(head)) || '').split(/^GMs may add other weapons/m))[0];
  for (const m of sec.matchAll(/^(?:- )?\*\*([^*]+)\*\*:\s*(.+)$/gm)) {
    const g = groupName(m[1].trim().replace(/^Siege Weapons$/, 'Siege Engines'));
    m[2].replace(/\.$/, '').replace(/\*/g, '').replace(/\s*\([^)]*\)/g, '').split(/,\s*(?:and\s+)?|\s+and\s+/).map(s => s.trim()).filter(s => s && !/^all /.test(s))
      .forEach(w => { [wkey(w), '~' + wkey(w, true)].forEach(k => (GROUPS[k] = GROUPS[k] || new Set()).add(g)); });
  }
}
// a weapon description that names its group: "**Double Spear (Spears Group)**:"
for (const f of fs.readdirSync(path.join(DOCS, 'equipment', 'weapons')).filter(x => x.endsWith('.md'))) {
  // each weapon's page: "# Double spear" ... "**Weapon group:** Spears"
  const page = read('equipment/weapons/' + f), nm = (page.match(/^# (.+)$/m) || [])[1];
  for (const m of page.matchAll(/^\*\*Weapon group:\*\* (.+)$/gm))
    m[1].split(/,\s*|\s+and\s+/).forEach(g => { const k = wkey(nm); (GROUPS[k] = GROUPS[k] || new Set()).add(groupName(g.trim().replace(/^Blades, (\w+)$/, 'Blades, $1').replace(/^(Heavy|Light) Blades$/, 'Blades, $1'))); });
}
let grouped = 0;
for (const w of weapons) {
  // the name as listed, then without a variant in parentheses, then without heavy/light
  const bare = w.n.replace(/\s*\([^)]*\)/g, ''), keys = [wkey(w.n), wkey(bare), '~' + wkey(w.n, true), '~' + wkey(bare, true),
    wkey(bare).split(' ').filter(x => !/^(heavy|light|crank)$/.test(x)).join(' ')];
  const g = new Set(GROUPS[keys.find(k => GROUPS[k])] || []);
  if (/firearm|pistol|musket|rifle|blunderbuss|pepperbox|shotgun|revolver|culverin|axe-musket|dragon pistol/i.test(w.n) || /firearm/i.test(w.sp)) g.add('firearms');
  if (g.size) { w.g = [...g].sort(); grouped++; }
}

// ---- armor: the first table of equipment/armor.md (light, medium, heavy, shields)
const armors = [];
{
  let kind = null;
  for (const line of read('equipment/armor.md').split('\n')) {
    const bold = line.match(/^\|\s*\*\*(Light armor|Medium armor|Heavy armor|Shields|Extras)\*\*/);
    if (bold) { kind = bold[1] === 'Extras' ? 'stop' : bold[1].split(' ')[0].toLowerCase().replace('shields', 'shield'); continue; }
    if (kind === 'stop') break;
    if (!kind || !line.startsWith('|')) continue;
    const c = cells(line);
    const bonus = parseInt(c[2], 10);
    if (!c[0] || isNaN(bonus)) continue;
    const num = s => { const n = parseInt(String(s).replace(/[–—−]/g, '-'), 10); return isNaN(n) ? null : n; };
    armors.push({ n: c[0], k: kind, b: bonus, md: num(c[3]), acp: num(c[4]) || 0, sp: (c[6].match(/\d+/) || [''])[0] });
  }
}

// ---- feats: every page title of rules/feats, with its slug
const feats = fs.readdirSync(path.join(DOCS, 'rules', 'feats')).filter(f => f.endsWith('.md') && f !== 'index.md').map(f => {
  const text = read('rules/feats/' + f), t = (text.match(/^# (.+)$/m) || [])[1];
  // "This feat no longer exists on its own: it is now part of [X]": gone (gone: X), kept only to explain it
  const into = (text.split(/^\?\?\? /m)[0].match(/no longer exists on its own[^[]*\[([^\]]+)\]/i) || [])[1];
  return t ? Object.assign({ n: t.trim(), u: f.replace(/\.md$/, '') }, into ? { gone: into } : {}) : null;
}).filter(Boolean);
// the monster feats (monsters/monster-feats.md, one "## Name" each): u is their link from the site root
for (const m of read('monsters/monster-feats.md').matchAll(/^## (.+)$/gm)) {
  const n = m[1].trim(), anchor = n.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  if (!feats.some(f => f.n.toLowerCase() === n.toLowerCase())) feats.push({ n, u: 'monsters/monster-feats/#' + anchor });
}
feats.sort((a, b) => a.n.localeCompare(b.n));

// ---- spell rolls at CL 1-20 (the duration is worked out in the page, from spell-data.json)
const rolls = {};
for (const slug of Object.keys(SPELL_TABLE)) {
  rolls[slug] = [];
  for (let cl = 1; cl <= 20; cl++) {
    const s = { name: slug };
    spellRoll(s, slug, cl);
    delete s.name; delete s.duration;
    rolls[slug].push(s);
  }
}

// ---- classes: every class with archetype data (tools/build-archetypes.js) and the NPC classes. From each class page:
// Hit Die, skill ranks, class skills, BAB and saves by level (the class table) and the opening text of each class
// feature section. The features by level and the archetypes come from docs/tools/archetypes/<class>.json in the page.
const anchor = s => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
const DIE = { inquisitor: 8, oracle: 8, cleric: 8, druid: 8, bard: 8, rogue: 8, monk: 8, sorcerer: 6, wizard: 6, witch: 6, arcanist: 6, psychic: 6, shaman: 8 };
function plain(md) {
  return md.replace(/^\?\?\?[^\n]*\n(?:(?: {4}|\t)[^\n]*\n|\s*\n)*/gm, '') // "??? note" blocks (the original rule)
    .split('\n').filter(l => !/^\s*\|/.test(l) && !/^#/.test(l)).join(' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function short(t, n) {
  if (t.length <= n) return t;
  const cut = t.slice(0, n), dot = cut.lastIndexOf('. ');
  return (dot > n / 2 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…');
}
function classSkills(text) {
  // some pages break the sentence into two paragraphs, so it may run over blank lines
  if (/treats all skills as class skills/i.test(text)) return ['*'];
  let m = text.match(/class skills[^.\n]*? are ([\s\S]*?\))\.(?:\s|$)/i);
  if (!m) return [];
  m = [m[0], m[1].replace(/\s+/g, ' ').replace(/\(all skills taken individually\)/i, '(all)')];
  const out = [];
  m[1].replace(/\band\b/g, ',').split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
    const k = s.match(/^Knowledge \(([^)]*)\)/i);
    if (k) { (/all/i.test(k[1]) ? ['arcana', 'dungeoneering', 'engineering', 'geography', 'history', 'local', 'nature', 'nobility', 'planes', 'religion'] : k[1].split(/\s*,\s*|\s+or\s+/)).forEach(x => out.push('Knowledge (' + x.trim().toLowerCase() + ')')); return; }
    out.push(s.replace(/\s*\([^)]*\)\s*$/, '').trim());
  });
  return out;
}
function classTable(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const head = /^\|\s*Level\s*\|/i.test(lines[i]) ? cells(lines[i]).map(c => c.toLowerCase()) : null;
    if (!head) continue;
    const col = re => head.findIndex(c => re.test(c));
    const b = col(/^(bab|base attack)/), f = col(/^fort/), r = col(/^ref/), w = col(/^will/), sp = col(/^special/);
    if (b < 0 || f < 0) continue;
    const rows = [], special = [];
    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) {
      const c = cells(lines[j]), n = s => parseInt(String(s).replace(/[–—−]/g, '-'), 10) || 0;
      rows.push([n(c[b]), n(c[f]), n(c[r]), n(c[w])]);
      special.push(sp >= 0 ? c[sp] : '');
    }
    return { rows, special };
  }
  return null;
}
function sections(text) {
  const out = {}, parts = text.split(/^(#{2,4} .+)$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const t = short(plain(parts[i + 1] || ''), 700);
    if (t) out[anchor(parts[i].replace(/^#+\s*/, ''))] = t;
  }
  return out;
}
function classEntry(slug, file, text, archetypes) {
  const t = classTable(text);
  if (!t) return null;
  return {
    s: slug, n: (text.match(/^#{1,3} (.+)$/m) || [])[1].trim(), page: file.replace(/\.md$/, '/'),
    die: +((text.match(/Hit Die\**:?\**\s*d(\d+)/i) || [])[1] || DIE[slug] || 8),
    ranks: +((text.match(/Skill Ranks per Level\**:?\**\s*(\d+)/i) || [])[1] || 2),
    skills: classSkills(text), table: t.rows, special: archetypes ? undefined : t.special, sec: sections(text), arch: archetypes
  };
}
const classes = [];
for (const f of fs.readdirSync(path.join(DOCS, 'tools', 'archetypes')).filter(f => f.endsWith('.json'))) {
  const slug = f.replace(/\.json$/, '');
  const file = ['characters/classes/' + slug + '.md', 'characters/classes/legendary/' + slug + '.md'].find(p => fs.existsSync(path.join(DOCS, p)));
  const c = file && classEntry(slug, file, read(file), true);
  if (c) classes.push(c); else console.warn('no class table:', slug);
}
// NPC classes: one page, one section each
{
  const file = 'gamemastering/npcs/npc-classes.md', text = read(file);
  text.split(/^#{2,3} (?=(?:Adept|Aristocrat|Commoner|Expert|Warrior)\s*$)/m).slice(1).forEach(part => {
    const name = part.split('\n')[0].trim(), c = classEntry(anchor(name), file, '## ' + part, false);
    if (c) { c.page = file.replace(/\.md$/, '/') + '#' + anchor(name); c.npc = true; classes.push(c); }
  });
}
classes.sort((a, b) => (a.npc ? 1 : 0) - (b.npc ? 1 : 0) || a.n.localeCompare(b.n));

// ---- mythic: the table's Unbound Path (rules/mythic/unbound-path.md): 2 mythic points per tier, spent on path
// abilities of any path ("### Name (Ex) \[2\]" under "## 3rd-Tier Champion Path Abilities") or mythic feats (1 point each)
const mythic = { abilities: [], feats: feats.filter(f => /\(Mythic\)$/.test(f.n)).map(f => f.n) };
{
  const page = read('rules/mythic/unbound-path.md').replace(/\r/g, '');
  let tier = 1, pathName = 'Universal';
  for (const part of page.split(/^(?=#{2,3} )/m)) {
    const sec = part.match(/^## (\d+)\w*-Tier (\w+) Path Abilities/);
    if (sec) { tier = +sec[1]; pathName = sec[2]; continue; }
    // "\[1\]", "\[3\] \[2\] (costs 3 the first time, then 2...)", "\[0,5\] (each mythic point buys two selections)"
    const m = part.match(/^### (.+?)\s*\\\[([\d,]+)\\\]([^\n]*)\n([\s\S]*)$/);
    if (!m || /not available/i.test(m[3])) continue;
    const head = m[1].trim(), type = (head.match(/\(((?:Ex|Su|Sp)(?:, (?:Ex|Su|Sp))?)\)$/) || [])[1] || '', note = m[3].replace(/\\\[|\\\]/g, '').trim();
    mythic.abilities.push({ n: head.replace(/\s*\((?:Ex|Su|Sp)(?:, (?:Ex|Su|Sp))?\)$/, ''), type, cost: +m[2].replace(',', '.'), tier, path: pathName,
      u: anchor(head + ' ' + m[2] + ' ' + note), text: short(plain(m[4]), 500), note: (note.match(/\(([^)]*)\)/) || [])[1] || note || undefined });
  }
}

// ---- rage powers for a random barbarian: the barbarian's own list, plus the unchained barbarian's stances and the
// powers used in a stance (the table allows a barbarian to take them). [name, type, level, needs, text, link]
const ragePowers = [];
{
  const add = (file, re) => {
    // the list: its own "## Rage Powers" section (unchained), else the class feature's "### Rage Powers (Ex)"
    const page = read('characters/classes/' + file).replace(/\r/g, ''), own = page.search(/^## Rage Powers/m);
    const at = own >= 0 ? own : page.search(/^### Rage Powers/m);
    if (at < 0) return;
    const body = page.slice(at).split(own >= 0 ? /\n(?=## (?!Rage Powers)|### Unmodified)/ : /\n(?=###? (?!Rage Powers))/)[0];
    for (const m of body.matchAll(re)) {
      const name = m[1].trim(), type = m[2], text = plain(m[3]);
      if (file !== 'barbarian.md' && !/stance/i.test(name + ' ' + text.slice(0, 120))) continue;
      if (ragePowers.some(p => p.n.toLowerCase() === name.toLowerCase())) continue;
      const lvl = +((text.match(/at least (\d+)(?:st|nd|rd|th) level/) || [])[1] || 2);
      const needs = ((text.match(/must have the (.+?) rage powers?/) || [])[1] || '').split(/,\s*|\s+and\s+/).filter(Boolean);
      ragePowers.push({ n: name, type, lvl: Math.max(2, lvl), needs, text: short(text, 400), link: 'characters/classes/' + file.replace(/\.md$/, '/') + '#rage-powers-ex' });
    }
  };
  // "*Animal Fury (Ex)*: ..." or "*Guarded Stance* *(Ex)*: ..."
  add('barbarian.md', /^\*([^*\n]+?)(?:\*\s*\*)?\s*\((Ex|Su|Sp)\)\*:\s*(.+)$/gm);
  // "**Accurate Stance (Ex)**: ..."
  add('unchained-barbarian.md', /^\*\*([^*\n]+?)\s*\((Ex|Su|Sp)\)\*\*:\s*(.+)$/gm);
}

// ---- the kineticist: its wild talents (characters/classes/kineticist-wild-talents.md: "### Fire Blast" then
// "**Element** fire; **Type** simple blast (Sp); **Level** —; **Burn** 0" and "**Blast Type** energy; **Damage** fire")
// and each element's list on the class page ("**Wild Talents**: 1st—basic pyrokinesis, burning infusion†, ...")
const kineticist = { talents: {}, elements: {} };
{
  const wt = read('characters/classes/kineticist-wild-talents.md').replace(/\r/g, '');
  for (const part of wt.split(/^(?=### )/m).slice(1)) {
    const name = part.split('\n')[0].replace(/^###\s*/, '').trim();
    const meta = part.match(/\*\*Elements?\*\*\s*([^;]+);\s*\*\*Type\*\*\s*([^;]+);\s*\*\*Level\*\*\s*([^;]+);\s*\*\*Burn\*\*\s*([^\n]+)/);
    if (!meta) continue;
    const bt = part.match(/\*\*Blast Type\*\*\s*([^;\n]+);\s*\*\*Damage\*\*\s*([^\n]+)/), pre = (part.match(/\*\*Prerequisites\*\*\s*([^\n]+)/) || [])[1] || '';
    const desc = plain(part.split('\n').slice(1).filter(l => !/^\*\*(Elements?|Blast Type|Prerequisites|Associated Blasts|Saving Throw)\*\*/.test(l)).join('\n'));
    kineticist.talents[name.toLowerCase()] = { n: name, element: meta[1].trim(), type: meta[2].trim(), level: parseInt(meta[3], 10) || 0, burn: meta[4].trim(),
      blast: bt ? bt[1].trim() : '', damage: bt ? clean(bt[2]) : '', pre: clean(pre), only: /available only to/i.test(desc), text: short(desc, 350), u: anchor(name) };
  }
  const cls = read('characters/classes/kineticist.md').replace(/\r/g, '');
  for (const part of cls.split(/^(?=### )/m)) {
    const el = (part.match(/^### (Aether|Air|Earth|Fire|Water|Universal)\s*$/m) || [])[1];
    const line = (part.match(/\*\*Wild Talents\*\*:\s*([^\n]+)/) || [])[1];
    if (!el || !line) continue;
    const list = [];
    for (const m of line.matchAll(/(\d+)(?:st|nd|rd|th)—([^;]+)/g))
      // "telekinetic globe." and "air shroud (greater)" (the page: "Air Shroud, Greater")
      m[2].split(/,\s*/).forEach(t => { const inf = /†/.test(t), n = t.replace(/†/g, '').trim().replace(/\.$/, '').replace(/^(.*) \(greater\)$/, '$1, greater'); if (n) list.push({ n, lvl: +m[1], inf }); });
    kineticist.elements[el.toLowerCase()] = list;
  }
}

// ---- the alchemist's discoveries (characters/classes/alchemist.md, under "### Discovery"): "#### Fast bombs" sections
// and inline ones ("Acid bomb*: When the alchemist..."); * marks a bomb discovery (only one per bomb)
const alchemist = { discoveries: [] };
{
  const page = read('characters/classes/alchemist.md').replace(/\r/g, '');
  const sec = (page.split(/^### Discovery/m)[1] || '').split(/^### (?!Discovery)/m)[0];
  const push = (name, body) => {
    const n = name.replace(/\\?\*$/, '').trim(), text = plain(body);
    if (!n || alchemist.discoveries.some(d => d.n.toLowerCase() === n.toLowerCase())) return;
    const lvl = +((text.match(/at least (\d+)(?:st|nd|rd|th) level/) || [])[1] || 2);
    const needs = ((text.match(/must (?:possess|have) the (.+?) discovery/) || [])[1] || '').split(/\s+and\s+/).filter(Boolean);
    alchemist.discoveries.push({ n, bomb: /\*$/.test(name) || /bomb/i.test(n), lvl, needs, text: short(text, 350) });
  };
  // each "#### Name" or inline "Name*: text" starts a discovery, which keeps the paragraphs until the next one
  let cur = null;
  const done = () => { if (cur) push(cur.name, cur.lines.join('\n')); cur = null; };
  for (const line of sec.split('\n')) {
    const head = line.match(/^#### (.+)$/), inline = line.match(/^([A-Z][a-z]+(?: [a-z]+){0,3})(\\?\*)?:\s+(.+)$/);
    if (head) { done(); cur = { name: head[1], lines: [] }; }
    else if (inline) { done(); cur = { name: inline[1] + (inline[2] ? '*' : ''), lines: [inline[3]] }; }
    else if (cur) cur.lines.push(line);
  }
  done();
}
// ---- the Canefinder shifter's aspects (characters/classes/shifter.md, "### Bear" with "**Minor Form**" and "**Major Form**")
const shifterAspects = [];
{
  const page = read('characters/classes/shifter.md').replace(/\r/g, '');
  const sec = (page.split(/^## Shifter Aspects/m)[1] || '').split(/^## (?!Shifter Aspects)/m)[0];
  for (const part of sec.split(/^(?=### )/m).slice(1)) {
    const n = part.split('\n')[0].replace(/^###\s*/, '').trim();
    const minor = (part.match(/\*\*Minor Form\*\*:?\s*([^\n]+)/) || [])[1], major = (part.match(/\*\*Major Form\*\*:?\s*([^\n]+)/) || [])[1];
    if (minor) shifterAspects.push({ n, minor: short(plain(minor), 260), major: short(plain(major || ''), 300) });
  }
}

// ---- the oathbound paladin's oaths (characters/classes/paladin-archetypes.md, "### Oath of Vengeance" under "## Oaths"):
// each oath's abilities, "**Channel Wrath (Su)**: When an oathbound paladin reach 4th level, ..."
const oaths = {};
{
  const page = read('characters/classes/paladin-archetypes.md').replace(/\r/g, '');
  const sec = (page.split(/^## Oaths\s*$/m)[1] || '').split(/^## (?!Oaths)/m)[0];
  for (const part of sec.split(/^(?=### )/m).slice(1)) {
    const name = part.split('\n')[0].replace(/^###\s*/, '').trim(), list = [];
    for (const m of part.matchAll(/^\*\*([^*]+?)\s*\((Ex|Su|Sp)\)\*\*:\s*(.+)$/gm)) {
      const text = plain(m[3]), lvl = +((text.match(/(\d+)(?:st|nd|rd|th) level/) || [])[1] || 1);
      list.push({ n: m[1].trim(), type: m[2], lvl, text: short(text, 350) });
    }
    if (list.length) oaths[name] = list;
  }
}

// ---- races (characters/races/*.md): each page's standard racial traits (before its alternate ones): the ability score
// modifiers ("**+2 Constitution, +2 Wisdom, –2 Charisma**", "**+2 to One Ability Score**"), size, base speed, type and
// subtypes ("Dwarves are humanoids with the dwarf subtype") and senses. The builder adds the modifiers on top of the scores.
const races = [];
{
  const AB = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
  const ABW = '(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)';
  // the core races say no type line: they are humanoids, with these subtypes
  const SUBS = { dwarves: 'dwarf', elves: 'elf', 'aquatic-elves': 'aquatic, elf', 'drow-nobles': 'elf', gnomes: 'gnome', 'half-elves': 'elf, human',
    'half-orcs': 'human, orc', halflings: 'halfling', humans: 'human', 'primitive-humans': 'human', 'monkey-goblins': 'goblinoid', 'deep-one-hybrid': 'deep one' };
  const abilities = s => {
    s = s.replace(/[–−]/g, '-').replace(/\+(\d+) to one [^,:.]*while [^,:.]*/gi, ''); // skinwalker: only while shapechanged
    const adj = {}; let any = null, m;
    if ((m = s.match(/\+(\d+) to one ability score/i))) { any = { v: +m[1] }; s = s.replace(m[0], ''); }
    else if ((m = s.match(new RegExp('\\+(\\d+) to ((?:' + ABW + '(?:,\\s*(?:or\\s+)?|\\s+or\\s+)?){2,})', 'i')))) {
      any = { v: +m[1], from: m[2].match(new RegExp(ABW, 'gi')).map(x => AB[x.slice(0, 3).toLowerCase()]) }; s = s.replace(m[0], '');
    }
    for (const x of s.matchAll(/([+-]\d+)\s+(Str|Dex|Con|Int|Wis|Cha)[a-z]*/gi)) adj[AB[x[2].toLowerCase()]] = (adj[AB[x[2].toLowerCase()]] || 0) + +x[1];
    return { adj, any };
  };
  for (const f of fs.readdirSync(path.join(DOCS, 'characters', 'races')).filter(f => f.endsWith('.md') && f !== 'index.md').sort()) {
    const text = read('characters/races/' + f).replace(/\r/g, ''), slug = f.replace(/\.md$/, '');
    const n = ((text.match(/^# (.+)$/m) || [])[1] || '').trim();
    const std = text.split(/^#{2,3} .*\b(?:Alternate|Favored|Variant|Heritages?)\b/mi)[0];
    // the ability score line: a bold "+2 ..." or "Ability Score Modifiers: +2 ..."
    let ab = null;
    for (const m of std.matchAll(/^(?:- )?\*\*([^*\n]+?)\*\*[:.]?\s*([^\n]*)$/gm)) {
      const b = m[1].replace(/[:.]$/, '').trim();
      if (/^[+\-–−]\d/.test(b)) { ab = abilities(b); break; }
      if (/^ability score/i.test(b)) { ab = abilities(m[2].split(/[.:](?:\s|$)/)[0]); break; }
    }
    if (!n || !ab || (!Object.keys(ab.adj).length && !ab.any)) continue;
    const size = (std.match(/\b(?:are|is) (Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan) creatures?/) || [])[1] || 'Medium';
    // "a base speed of 30 feet ... a fly speed of 60 feet (average)" on the same line
    let speed = '30 ft.';
    const sl = std.split('\n').find(l => /base (?:land )?speed of (?:only )?\d+ feet/i.test(l));
    if (sl) {
      speed = sl.match(/base (?:land )?speed of (?:only )?(\d+) feet/i)[1] + ' ft.';
      for (const x of sl.matchAll(/(fly|swim|climb|burrow) speed of (\d+) feet(?: \((\w+)\))?/gi)) speed += ', ' + x[1].toLowerCase() + ' ' + x[2] + ' ft.' + (x[3] ? ' (' + x[3].toLowerCase() + ')' : '');
    }
    let type = 'humanoid', sub = SUBS[slug] || slug.replace(/-/g, ' ').replace(/ies$/, 'y').replace(/s$/, '');
    const tm = std.match(/are (native )?(aberration|construct|fey|monstrous humanoid|humanoid|outsider|plant|undead)s? with the ([\w\s,-]+?) subtypes?\b/i);
    if (tm) { type = tm[2].toLowerCase(); sub = (tm[1] ? ['native'] : []).concat(tm[3].split(/,\s*|\s+and\s+/).map(s => s.trim().toLowerCase())).filter((x, i, a) => x && a.indexOf(x) === i).join(', '); }
    else {
      // "Trox are monstrous humanoids.", "Ghorans have the plant type but..."
      const t2 = std.match(/\b(?:are (?:native )?(aberration|construct|fey|monstrous humanoid|humanoid|outsider|plant|undead)s?[.,]|have the (aberration|construct|fey|monstrous humanoid|humanoid|outsider|plant|undead) type)/i);
      if (t2) { type = (t2[1] || t2[2]).toLowerCase(); if (type !== 'humanoid' && !SUBS[slug]) sub = ''; }
    }
    const senses = [];
    const dv = std.match(/^(?:- )?\*\*(Superior )?Darkvision\*\*[^\n]*?(\d+) feet/mi);
    if (dv) senses.push('darkvision ' + dv[2] + ' ft.');
    if (/^(?:- )?\*\*Low-Light Vision\*\*/mi.test(std)) senses.push('low-light vision');
    races.push(Object.assign({ n, u: 'characters/races/' + slug + '/', adj: ab.adj, size, speed, type, sub, senses: senses.join(', ') }, ab.any ? { any: ab.any } : {}));
  }
}

// ---- rogue talents for the rogue's "Rogue talent" picker (characters/classes/rogue-talents.md): the tables
// "| Talent | Prerequisites | Benefit |"; the ones under an "Advanced Rogue Talents" heading are advanced talents.
// [n: name, t: Ex/Su/Sp, p: prerequisites, x: what it does, adv: advanced talent]
const rogueTalents = [];
{
  let table = false, adv = false;
  for (const line of read('characters/classes/rogue-talents.md').replace(/\r/g, '').split('\n')) {
    if (/^#/.test(line)) { adv = /advanced/i.test(line); table = false; continue; }
    if (!line.startsWith('|')) { table = false; continue; }
    const c = cells(line);
    if (/^Talent$/i.test(c[0])) { table = true; continue; }
    if (!table || c.length < 3 || /^-+$/.test(c[0]) || !c[0]) continue;
    const t = c[0].match(/\s*\((Ex|Su|Sp)\)\s*$/), n = c[0].replace(/\s*\((Ex|Su|Sp)\)\s*$/, '').trim();
    if (rogueTalents.some(r => r.n.toLowerCase() === n.toLowerCase())) continue;
    rogueTalents.push({ n, t: t ? t[1] : '', p: /^[—–-]*$/.test(c[1]) ? '' : c[1], x: short(c[2], 400), adv });
  }
  rogueTalents.sort((a, b) => a.n.localeCompare(b.n));
}

// ---- wild talents for the kineticist's "Wild Talents" picker: the utility talents of the wild talents page
// (characters/classes/kineticist-wild-talents.md, "**Type** utility (Sp)"), which are the ones its utility talent slots take.
// [n: name, t: Sp/Su, e: element, l: level, p: prerequisites, x: what it does]
const wildTalents = Object.values(kineticist.talents).filter(w => /^utility/i.test(w.type)).map(w => ({
  n: w.n, t: (w.type.match(/\((Ex|Su|Sp)\)/) || [])[1] || '', e: w.element, l: w.level, p: w.pre, x: w.text
})).sort((a, b) => a.n.localeCompare(b.n));

const out = path.join(DOCS, 'tools', 'enemy-builder-data.json');
fs.writeFileSync(out, JSON.stringify({ weapons, armors, feats, rolls, classes, mythic, ragePowers, rogueTalents, wildTalents, kineticist, alchemist, shifterAspects, oaths, races }));
console.log('races:', races.length, '(' + races.filter(r => r.any).length + ' with a +2 of their choice)');
console.log('oaths:', Object.keys(oaths).length, '(' + (oaths['Oath of Vengeance'] || []).map(o => o.n + ' ' + o.lvl).join(', ') + ')');
console.log('alchemist:', alchemist.discoveries.length, 'discoveries; shifter:', shifterAspects.length, 'aspects');
console.log('kineticist:', Object.keys(kineticist.talents).length, 'wild talents,', Object.keys(kineticist.elements).map(e => e + ' ' + kineticist.elements[e].length).join(', '));
console.log('rage powers:', ragePowers.length, '(' + ragePowers.filter(p => /stance/i.test(p.n)).length + ' stances)');
console.log('mythic:', mythic.abilities.length, 'Unbound Path abilities,', mythic.feats.length, 'mythic feats');
console.log('enemy-builder-data.json:', weapons.length, 'weapons (' + grouped + ' in a weapon group),', armors.length, 'armor,', feats.length, 'feats,', Object.keys(rolls).length, 'spell rolls,', classes.length, 'classes');
