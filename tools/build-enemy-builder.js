// Data for the Enemy Builder (docs/tools/enemy-builder.md): weapons and armor read from the wiki's equipment tables,
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
for (const [file, prof] of [['weapons-simple.md', 'simple'], ['weapons-martial.md', 'martial'], ['weapons-exotic.md', 'exotic']]) {
  let cat = null;
  for (const line of read('equipment/' + file).split('\n')) {
    if (!line.startsWith('|')) { cat = null; continue; }
    const head = line.match(/^\|\s*\((\w+)\)\s*([\w-]+(?: Melee)?) (?:Melee )?Weapons\s*\|\s*Cost/i);
    if (head) { const h = head[2].toLowerCase(); cat = /ranged/.test(line.toLowerCase()) ? 'ranged' : /two/.test(h) ? 'two-handed' : /one/.test(h) ? 'one-handed' : 'light'; continue; }
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
weapons.sort((a, b) => a.n.localeCompare(b.n));

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
  const t = (read('rules/feats/' + f).match(/^# (.+)$/m) || [])[1];
  return t ? { n: t.trim(), u: f.replace(/\.md$/, '') } : null;
}).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n));

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

const out = path.join(DOCS, 'tools', 'enemy-builder-data.json');
fs.writeFileSync(out, JSON.stringify({ weapons, armors, feats, rolls, classes }));
console.log('enemy-builder-data.json:', weapons.length, 'weapons,', armors.length, 'armor,', feats.length, 'feats,', Object.keys(rolls).length, 'spell rolls,', classes.length, 'classes');
