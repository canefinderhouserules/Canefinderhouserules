// Builds the data for the Spell Search page (docs/tools/spell-data.json) from the spell pages and the domain pages.
// Runs before every site build (see .github/workflows/deploy.yml), so edits to spells show up on their own.
// Usage: node tools/build-spells.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs');
const SPELLS = path.join(ROOT, 'magic', 'spells');
const DOMAINS = path.join(ROOT, 'magic', 'domains');
const OUT = path.join(ROOT, 'tools', 'spell-data.json');

const plain = s => String(s || '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/[*_`]/g, '')
  .replace(/\\([\[\]*_])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();
const slugOf = name => plain(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ord = s => parseInt(s, 10);

// Classes whose spell list is another class's list (used only when the spell does not name them itself).
const SHARED = {
  arcanist: [['wizard', 9]],
  oracle: [['cleric', 9]],
  warpriest: [['cleric', 6]],
  skald: [['bard', 6]],
  investigator: [['alchemist', 6]],
  hunter: [['druid', 6], ['ranger', 4]],
};
const SUBSCHOOLS = new Set(['figment', 'compulsion', 'creation', 'phantasm', 'polymorph', 'charm', 'glamer', 'pattern', 'shadow (illusion)']);
const REAL_SUBS = new Set(['calling', 'creation', 'healing', 'summoning', 'teleportation', 'scrying', 'charm', 'compulsion', 'figment', 'glamer', 'pattern', 'phantasm', 'shadow', 'polymorph', 'haunted']);
const DESC_FIX ={ 'language dependent': 'language-dependent', 'language-dependant': 'language-dependent', law: 'lawful', chaos: 'chaotic', 'fire see below': 'fire' };
const CLASS_NAME ={ 'summoner (unchained)': 'unchained summoner', 'redmantisassassin': 'red mantis assassin' };

function field(block, name) {
  const re = new RegExp('\\*\\*' + name + '\\*\\*\\s*([^\\n]*?)(?=\\s*(?:;\\s*)?\\*\\*[A-Z]|\\s*$)', 'm');
  const m = block.match(re);
  return m ? plain(m[1]).replace(/[;,]\s*$/, '') : '';
}

function parseSpell(file) {
  const src = fs.readFileSync(path.join(SPELLS, file), 'utf8').replace(/\r/g, '');
  const title = (src.match(/^#\s+(.+)$/m) || [])[1];
  if (!title || !/\*\*School\*\*/.test(src) || !/\*\*Level\*\*/.test(src)) return null;
  const paras = src.split(/\n\s*\n/);
  const bi = paras.findIndex(p => /\*\*School\*\*/.test(p));
  const block = paras.slice(bi, bi + 3).filter(p => /^\*\*/.test(p.trim())).join('\n');
  const schoolRaw = field(block, 'School');
  const sm = schoolRaw.match(/^([a-z]+)\s*(?:\(([^)]*)\))?\s*(?:\[([^\]]*)\])?/i) || [];
  let school = (sm[1] || '').toLowerCase();
  if (school === 'transformation') school = 'transmutation';
  if (school === 'see' || school === 'multiple') school = 'universal';
  const subs = (sm[2] || '').split(/,|\bor\b/).map(s => s.trim().toLowerCase()).filter(s => s && !/see text/.test(s));
  const desc = [];
  // descriptors written in the subschool's parentheses, such as "evocation (cold)"
  const subParts = subs.splice(0);
  for (const s of subParts) (REAL_SUBS.has(s) ? subs : desc).push(s);
  for (let d of (sm[3] || '').split(/[,;]|\bor\b/)) {
    d = d.trim().toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
    if (!d || /^see |^for |^variable$/.test(d)) continue;
    if (SUBSCHOOLS.has(d)) { if (!subs.includes(d)) subs.push(d); continue; }
    d = DESC_FIX[d] || d;
    if (!desc.includes(d)) desc.push(d);
  }
  const levels = {};
  for (const part of field(block, 'Level').split(/[,;]/)) {
    const m = part.trim().match(/^(.+?)\s*(\d)\b/);
    if (!m) continue;
    let cls = m[1].trim().toLowerCase().replace(/\s*\/\s*/g, '/');
    cls = CLASS_NAME[cls] || cls;
    for (const c of cls.split('/')) if (c) levels[c.trim()] = Math.min(levels[c.trim()] ?? 99, ord(m[2]));
  }
  if (levels.wizard !== undefined && levels.sorcerer === undefined) levels.sorcerer = levels.wizard;
  for (const [cls, from] of Object.entries(SHARED)) {
    if (levels[cls] !== undefined) continue;
    for (const [base, max] of from) if (levels[base] !== undefined && levels[base] <= max) { levels[cls] = levels[base]; break; }
  }
  const body = paras.slice(bi + 1).find(p => { const t = p.trim(); return t && !/^\*\*|^#|^\||^!!!|^\?\?\?|^</.test(t); });
  let summary = plain(body || '');
  if (summary.length > 160) summary = summary.slice(0, 160).replace(/\s+\S*$/, '') + '…';
  const target = field(block, 'Target') || field(block, 'Targets') || field(block, 'Area') || field(block, 'Effect');
  return {
    n: plain(title), u: file.replace(/\.md$/, ''), s: school, ss: subs, d: desc, l: levels, dom: {},
    ct: field(block, 'Casting Time'), c: field(block, 'Components'), r: field(block, 'Range'), t: target,
    du: field(block, 'Duration'), sv: field(block, 'Saving Throw'), sr: field(block, 'Spell Resistance'), x: summary,
  };
}

// "1st—[*obscuring mist*](../spells/obscuring-mist.md), 2nd—..." → [[1, 'obscuring-mist'], ...]
function domainList(line, bySlug) {
  // Spells are written either as links ("[*fireball*](../spells/fireball.md)") or as plain names ("fireball").
  const linked = new Map();
  const clean = line.replace(/\[\*?([^\]*]+)\*?\]\(([^)]+)\)/g, (m, name, url) => {
    linked.set(slugOf(name), path.basename(url.split('#')[0], '.md'));
    return name;
  }).replace(/\*/g, '');
  const out = [];
  for (const m of clean.matchAll(/(\d)(?:st|nd|rd|th)\s*[—–-]\s*([^,;]+)/g)) {
    const name = m[2].replace(/\(.*$/, '').replace(/\.\s*$/, '').trim();
    const slug = slugOf(name.replace(/\\$/, ''));
    // "mass cure critical wounds" is the page "Cure Critical Wounds, Mass"
    const flipped = slug.replace(/^(mass|lesser|greater|communal)-(.+)$/, '$2-$1');
    const target = linked.has(slug) && bySlug.has(linked.get(slug)) ? linked.get(slug) : bySlug.has(slug) ? slug : flipped;
    if (bySlug.has(target)) out.push([ord(m[1]), target]);
  }
  return out;
}

function addDomains(spells) {
  const bySlug = new Map(spells.map(s => [s.u, s]));
  const names = [];
  for (const file of fs.readdirSync(DOMAINS).filter(f => f.endsWith('.md') && f !== 'index.md')) {
    const src = fs.readFileSync(path.join(DOMAINS, file), 'utf8').replace(/\r/g, '');
    const domain = plain((src.match(/^#\s+(.+)$/m) || [])[1] || '');
    if (!domain || /overview/i.test(domain)) continue;
    const main = src.match(/^\*{2,3}Domain Spells\*\*:?\s*(.+)$/m);
    if (!main) continue;
    const base = domainList(main[1], bySlug);
    const lists = [[domain, base]];
    for (const sec of src.split(/^###\s+/m).slice(1)) {
      const sub = plain(sec.split('\n')[0]).replace(/\s*Subdomain\s*$/i, '');
      const rep = sec.match(/^\*{2,3}Replacement Domain Spells\*\*:?\s*(.+)$/m);
      if (!sub || !rep) continue;
      const repl = domainList(rep[1], bySlug);
      const byLevel = new Map(base.map(([lv, s]) => [lv, s]));
      for (const [lv, s] of repl) byLevel.set(lv, s);
      lists.push([sub + ' (' + domain + ')', [...byLevel].map(([lv, s]) => [lv, s])]);
    }
    for (const [name, list] of lists) {
      names.push(name);
      for (const [lv, slug] of list) { const sp = bySlug.get(slug); sp.dom[name] = Math.min(sp.dom[name] ?? 99, lv); }
    }
  }
  return names.sort();
}

const spells = fs.readdirSync(SPELLS).filter(f => f.endsWith('.md')).sort().map(parseSpell).filter(Boolean);
const domains = addDomains(spells);
for (const s of spells) { if (!Object.keys(s.dom).length) delete s.dom; for (const k of ['ss', 'd']) if (!s[k].length) delete s[k]; }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ domains, spells }));
console.log('spells', spells.length, 'domains', domains.length, 'bytes', fs.statSync(OUT).size);
