// Builds the data for the archetype picker on class pages (docs/tools/archetypes/<class>.json).
// For each class it reads the class features from the class table and the class page, then reads each archetype
// on the archetype pages and works out which class features each archetype ability replaces or modifies.
// Runs before every site build (see .github/workflows/deploy.yml).
// Usage: node tools/build-archetypes.js [--report]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'docs');
const OUT = path.join(ROOT, 'tools', 'archetypes');
const REPORT = process.argv.includes('--report');

// class page -> archetype pages (paths relative to docs/). Every <class>.md with a <class>-archetypes.md is found on its own;
// EXTRA adds archetype pages with other names.
const C = 'characters/classes/';
// An entry is a page, or { file, only: [archetype names], except: [names] }.
// Unchained classes use their base class's archetypes (Pathfinder Unchained: an archetype that replaces trap sense
// replaces danger sense instead); the unchained monk and summoner only the ones printed for them (as Nethys lists them).
const UNCHAINED_MONK = ['Black Asp', 'Brazen Disciple', 'Disciple of Wholeness', 'Elemental Monk', 'Invested Regent', 'Lifting Hand', 'Monk of the Mantis', 'Perfect Scholar', 'Sage Counselor', 'Scaled Fist', 'Serpent-Fire Adept', 'Softstrike Monk', 'Soul Shepherd', 'Windstep Master'];
const UNCHAINED_SUMMONER = ['Construct Caller (Unchained Summoner)', 'Devil Binder (Unchained Summoner)', 'Devil Impostor (Unchained Summoner)', 'Fey Caller', 'God Caller', 'Leshy Caller', 'Soulbound Summoner', 'Storm Caller', 'Twinned Summoner'];
// ninja archetypes the wiki keeps on the rogue archetypes page (Masked Enforcer is Nethys's "Mask of the Living God")
const NINJA = ['Petal Ninja', 'Gunpowder Bombardier', 'Masked Enforcer'];
const EXTRA = {
  shifter: [C + 'canefinder-shifter-archetypes.md', C + 'shifter-archetypes.md'],
  'shifter-ultimate-wilderness': [C + 'shifter-archetypes.md'],
  witch: [C + 'witch-archetypes.md', C + 'white-haired-witch.md'],
  rogue: [{ file: C + 'rogue-archetypes.md', except: NINJA }],
  ninja: [{ file: C + 'ninja.md', only: ['Frozen Shadow Archetype', 'Hunting Serpent Archetype'] }, { file: C + 'rogue-archetypes.md', only: NINJA }],
  summoner: [{ file: C + 'summoner-archetypes.md', except: UNCHAINED_SUMMONER.filter(n => /Unchained|God Caller/.test(n)) }],
  'unchained-summoner': [{ file: C + 'summoner-archetypes.md', only: UNCHAINED_SUMMONER }],
  'unchained-monk': [{ file: C + 'monk-archetypes.md', only: UNCHAINED_MONK }],
  'unchained-barbarian': [C + 'barbarian-archetypes.md'],
  'unchained-rogue': [{ file: C + 'rogue-archetypes.md', except: NINJA }],
};
const fileOf = e => typeof e === 'string' ? e : e.file;
const CLASSES = {};
for (const dir of [C, C + 'legendary/']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    const m = f.match(/^(.+).md$/); if (!m || /-archetypes$/.test(m[1])) continue;
    const arch = dir + m[1] + '-archetypes.md';
    const list = EXTRA[m[1]] || (fs.existsSync(path.join(ROOT, arch)) ? [arch] : null);
    if (list) CLASSES[m[1]] = { page: dir + f, archetypes: list };
  }
}
// Hand-checked corrections (against Archives of Nethys) for archetypes whose text doesn't say what they replace.
const OVERRIDES = fs.existsSync(path.join(__dirname, 'archetype-overrides.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'archetype-overrides.json'), 'utf8')) : {};
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r/g, '');
const plain = s => String(s || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/[*_`]/g, '').replace(/\\([\[\]*_])/g, '$1').replace(/\s+/g, ' ').trim();
const slug = s => plain(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9 _-]/g, '').trim().replace(/\s+/g, '-');
const norm = s => plain(s).toLowerCase().replace(/[’']/g, '').replace(/\((ex|su|sp)\)/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ORD = '(\\d+)(?:st|nd|rd|th)';
const WORDNUM = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

// Turns a markdown link target on page `from` into a path from the site root (with use_directory_urls).
function siteLink(from, href) {
  if (/^[a-z]+:|^#/.test(href)) return href.startsWith('#') ? siteUrl(from) + href : href;
  const [file, hash] = href.split('#');
  const abs = path.posix.normalize(path.posix.join(path.posix.dirname(from), file));
  return siteUrl(abs) + (hash ? '#' + hash : '');
}
function siteUrl(md) {
  return md.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '/');
}
// Small markdown -> HTML for ability text (links, bold, italics, lists, paragraphs).
function html(from, md) {
  const inline = s => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, h) => '<a href="@@' + siteLink(from, h) + '">' + t + '</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\\([\[\]*_])/g, '$1');
  const out = []; let list = null;
  for (const block of md.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length && lines.every(l => /^\s*[-*] /.test(l))) { out.push('<ul>' + lines.map(l => '<li>' + inline(l.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>'); continue; }
    if (/^\|/.test(lines[0] || '')) { // table
      const rows = lines.filter(l => !/^\|\s*-/.test(l)).map(l => l.split('|').slice(1, -1).map(c => inline(c.trim())));
      out.push('<table><thead><tr>' + rows[0].map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (lines.length) out.push('<p>' + inline(lines.join(' ')) + '</p>');
  }
  return out.join('');
}

// ---- class features ----
// names of the entries listed under a class feature (each deed, hex, ki power...) of the class being read
let SUB_BASES = new Set();
function classUnits(file) {
  SUB_BASES = new Set();
  const s = read(file);
  const units = [];
  // table: the first table with a Special column
  const lines = s.split('\n');
  const hi = lines.findIndex(l => /^\|.*\|\s*Special\s*\|/i.test(l));
  if (hi < 0) throw new Error('no class table in ' + file);
  const heads = lines[hi].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const si = heads.indexOf('special');
  const count = {};
  for (let i = hi + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const c = lines[i].split('|').slice(1, -1).map(x => x.trim());
    const lvl = parseInt(c[0], 10);
    // (a footnote after an asterisk is not a feature: "slow fall any distance *The value shown is for Medium monks")
    const special = plain(String(c[si]).replace(/\s*\\?\*\s*The value.*$|\s+\\?\*[A-Z].*$/, ''));
    if (!special || special === '—' || special === '-') continue;
    for (const label of special.split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean)) {
      let base = norm(label.replace(/\(.*?\)\s*$/, '')).replace(/^\d+(st|nd|rd|th) /, '').replace(/(\s+(\d+(st|nd|rd|th)?|\d+d\d+|\d+ (day|days|round|rounds|minutes|ft|feet)|\d+ \d+|any distance))+$/, '').trim();
      // "Bonus feats (2)" and "Bonus feat" are the same feature
      if (/s$/.test(base) && units.some(u => u.base === base.slice(0, -1))) base = base.slice(0, -1);
      else if (units.some(u => u.base === base + 's')) { const old = base + 's'; units.filter(u => u.base === old).forEach(u => { u.base = base; }); count[base] = (count[base] || 0) + (count[old] || 0); delete count[old]; units.forEach(u => { if (u.base === base) u.id = base.replace(/ /g, '-') + '-' + u.idx; }); }
      count[base] = (count[base] || 0) + 1;
      units.push({ id: base.replace(/ /g, '-') + '-' + count[base], lvl, label, base, idx: count[base] });
    }
  }
  // sections: the headings one level below "Class Features", and the ones below those (deeds, ki powers...)
  // (pages skip heading levels, so the feature level is the level of the first heading after "Class Features",
  // or after the class table when there is no such heading)
  const secs = [], subs = [];
  const hs = []; lines.forEach((l, i) => { const h = l.match(/^(#{2,6}) (.+?)\s*$/); if (h) hs.push({ lv: h[1].length, title: h[2], line: i }); });
  const cfh = hs.find(h => /^class features$/i.test(h.title));
  const start = cfh ? cfh.line : hi;
  const after = hs.filter(h => h.line > start && (!cfh || h.lv > cfh.lv));
  const fl = after.length ? after[0].lv : 0;
  for (const h of hs.filter(h => h.line > start)) {
    if ((cfh && h.lv <= cfh.lv) || h.lv < fl || /^favored class/i.test(h.title)) break;
    const item = { title: h.title, anchor: slug(h.title), base: norm(h.title), line: h.line };
    if (h.lv === fl) secs.push(item);
    else if (secs.length) { item.parent = secs[secs.length - 1]; subs.push(item); }
  }
  const matches = (a, b) => a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ');
  // features with a section but no table entry (weapon and armor proficiency...) are 1st-level units
  for (const sec of secs) {
    if (!units.some(u => matches(u.base, sec.base) || sec.base.startsWith(u.base) || u.base.startsWith(sec.base)))
      units.unshift({ id: sec.base.replace(/ /g, '-') + '-1', lvl: 1, label: sec.title.replace(/\s*\((Ex|Su|Sp)\)$/, ''), base: sec.base, idx: 1 });
  }
  units.unshift({ id: 'class-skills-1', lvl: 1, label: 'Class skills', base: 'class skills', idx: 1 });
  for (const u of units) {
    const sec = secs.find(x => x.base === u.base) || secs.find(x => x.base.startsWith(u.base) || u.base.startsWith(x.base));
    u.sec = u.base === 'class skills' ? 'class-skills' : sec ? sec.anchor : null;
  }
  // abilities under a class feature (each deed, ki power...) that the table doesn't list: their level comes from their text
  for (const sub of subs) {
    if (units.some(u => u.base === sub.base)) continue;
    let text = ''; for (let j = sub.line + 1; j < lines.length && !/^#/.test(lines[j]); j++) text += lines[j] + ' ';
    const lv = plain(text).match(new RegExp(ORD + ' level', 'i')) || plain(text).match(new RegExp('level ' + '(\\d+)', 'i'));
    const lvl = lv ? +lv[1] : (units.find(u => u.sec === sub.parent.anchor) || { lvl: 1 }).lvl;
    units.push({ id: sub.base.replace(/ /g, '-') + '-1', lvl, label: sub.title.replace(/\s*\((Ex|Su|Sp)\)$/, ''), base: sub.base, idx: 1, sec: sub.anchor, sub: true });
    SUB_BASES.add(sub.base);
  }
  return { units, secs };
}

// ---- references to class features inside archetype text ----
function bases(units) { return [...new Set(units.map(u => u.base))].sort((a, b) => b.length - a.length); }
let CLS = '';
// Words that sit between the parts of a feature name in archetype text ("the fighter's normal bonus combat feat").
const filler = t => t.replace(new RegExp('\\b(' + CLS + 's?|normal|normally|combat|regular|usual|base)\\b', 'g'), ' ').replace(/\s+/g, ' ');
// Other names archetypes use for a class feature (unchained or older versions of the class).
const ALIAS = [[/\bdanger sense\b/g, 'trap sense'], [/\b(spellcasting|spells? class feature)\b/g, 'spells'], [/\bfinal judgment\b/g, 'true judgment'], [/\bjudgement\b/g, 'judgment'], [/\bfrightening performance\b/g, 'frightening tune'], [/\bloremaster\b/g, 'lore master'], [/\btrapsense\b/g, 'trap sense']];
function findBase(text, bs) {
  let n = norm(text);
  for (const [re, to] of ALIAS) if (!bs.some(b => re.test(b))) n = n.replace(re, to);
  const ts = [' ' + n + ' ', ' ' + filler(n) + ' '];
  // the feature named first in the text wins ("the mutagen class ability ... discovery" is mutagen);
  // at the same place, the longest name ("second judgment" over "judgment")
  for (const t of ts) {
    let best = null, at = Infinity;
    for (const b of bs) {
      for (const a of [b, b + 's', b + 'es', b.replace(/y$/, 'ies'), b.replace(/^the /, '')]) {
        const i = t.indexOf(' ' + a + ' ');
        if (i >= 0 && (i < at || (i === at && b.length > best.length))) { best = b; at = i; }
      }
    }
    // a name inside a longer one that starts earlier ("judgment" in "second judgment") loses to it
    if (best) return best;
  }
  const t = ts[1];
  // singular in the text, plural base ("bonus feats" vs "bonus feat")
  for (const tt of ts) for (const b of bs) if (tt.includes(' ' + b.replace(/s$/, '') + ' ')) return b;
  // a shorter name for one feature ("familiar" for "witch's familiar", "combat style" for "combat style feat")
  const core = n.replace(/^(the|his|her|their|a|an) /, '').replace(/\b(class feature|ability|abilities)\b/g, '').trim();
  if (core.length > 3) {
    const c = bs.filter(b => (' ' + b + ' ').includes(' ' + core + ' ') || (' ' + b + ' ').includes(' ' + core.replace(/s$/, '') + ' '));
    if (c.length === 1) return c[0];
    // (the class's own features before the entries listed under one: "familiar" is the witch's familiar, not "new familiars")
    const top = c.filter(b => !SUB_BASES.has(b));
    if (top.length === 1) return top[0];
  }
  // loose names: any proficiency, any skills, any feat
  if (/proficien/.test(t)) { const b = bs.find(x => /proficien/.test(x)); if (b) return b; }
  if (/ skill/.test(t)) return 'class skills';
  if (/ feats? /.test(t)) { const b = bs.find(x => /feat/.test(x)); if (b) return b; }
  return null;
}
function levelsIn(s) { return [...s.matchAll(new RegExp(ORD, 'g'))].map(m => +m[1]); }

// Resolves a phrase like "weapon training 3 and 4", "the bonus feat gained at 2nd level", "bravery" to unit ids.
function resolve(phrase, units, bs) {
  const ids = new Set(); const miss = [];
  // keep feature names with "and"/"or" in them whole ("opportune parry and riposte", "tongue of the sun and moon")
  let ph = plain(phrase).replace(/[’']/g, '')
    // "gained at second level" -> "gained at 2nd level"
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)(?=(-|\s+)level)/gi,
      w => { const n = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'].indexOf(w.toLowerCase()) + 1; return n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'); });
  // "the 2nd- and 8th-level rage powers" -> "rage powers gained at 2nd and 8th level"
  ph = ph.replace(/((?:\b\d+(?:st|nd|rd|th)(?:-level)?-?\s*(?:,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+))+\d+(?:st|nd|rd|th))[- ]level\s+([a-z ]+?)(?=$|,|;|\s+and\s|\s+as\s|\s+of\s)/gi,
    (m, lv, name) => name + ' gained at ' + lv.replace(/-/g, '') + ' level');
  let pending = [];
  for (const b of bs) if (/ (and|or) /.test(b)) ph = ph.replace(new RegExp(b.split(' ').join('\\W+'), 'ig'), b.replace(/ /g, '_'));
  const parts = ph.replace(/\bas well as\b/g, ',').split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+(?!\d+(?:st|nd|rd|th) level)|\s+or\s+/i).map(x => x.trim().replace(/_/g, ' ')).filter(Boolean);
  let last = null;
  for (let part of parts) {
    const whole = part;
    part = part.replace(/^(?:the|his|her|their|a|an)\s+/i, '').replace(/\s+(?:class features?|abilities|ability|features?)$/i, '').trim();
    // ("order ability" is a feature; "ability" is not stripped when that names one)
    const b1 = findBase(part, bs), b2 = findBase(whole, bs);
    let b = b2 && (!b1 || b2.length > b1.length) ? b2 : b1;
    // an exact table entry ("poison resistance +6")
    const exact = /\d/.test(part) && units.find(u => norm(u.label) === norm(part));
    if (exact) { ids.add(exact.id); last = exact.base; continue; }
    // "the 2nd- and 8th-level rage powers": levels waiting for the feature named after them
    if (!b && !last && levelsIn(part).length && !/[a-z]{4,}/i.test(part.replace(/\d+(st|nd|rd|th)|level|-|and|the/gi, ''))) { pending.push(...levelsIn(part)); continue; }
    const bare = part.match(/^\+?(\d+)$/);
    if (!b && bare && last) {
      // "danger sense +1 and +4": the entry with that value
      const byValue = units.filter(u => u.base === last && (u.label.match(/\+(\d+)\s*$/) || [])[1] === bare[1]);
      if (/^\+/.test(part) && byValue.length) { byValue.forEach(u => ids.add(u.id)); continue; }
      b = last;
    }
    if (!b) {
      const lv = levelsIn(part);
      if (lv.length && last) b = last; else { if (part.length > 2) miss.push(part); continue; }
    }
    last = b;
    const own = units.filter(u => u.base === b);
    const rest = filler(norm(part).replace(b, ' ').replace(b.replace(/s$/, ''), ' '));
    const nums = (bare ? [+bare[1]] : [...rest.matchAll(/(?:^|\s)(\d+)(?=\s|$)/g)].map(m => +m[1]));
    const lv = levelsIn(part).concat(pending); pending = [];
    let sel;
    if (lv.length) sel = own.filter(u => lv.includes(u.lvl));
    else if (nums.length) sel = own.filter(u => nums.includes(u.idx));
    else if (/\b(first|second|third|fourth|fifth|sixth)\b/.test(rest)) { const w = WORDNUM[rest.match(/\b(first|second|third|fourth|fifth|sixth)\b/)[1]]; sel = own.filter(u => u.idx === w); }
    else sel = own;
    if (!sel.length) { miss.push(part); continue; }
    sel.forEach(u => ids.add(u.id));
  }
  return { ids: [...ids], miss };
}

function references(text, units, bs) {
  const out = { replaces: new Set(), modifies: new Set(), miss: [] };
  // "1 through 4" -> "1, 2, 3, and 4"
  const t = plain(text).replace(/\b(\d+)\s+(?:through|to|-|–)\s+(\d+)\b/g, (m, a, b) => { const r = []; for (let i = +a; i <= +b && i - a < 20; i++) r.push(i); return r.join(', '); });
  // a phrase ends at the period, at a semicolon, or where the next verb starts ("replaces bravery and alters class skills")
  const re = /\b(replaces?|replacing|takes the place of|in place of|instead of|alters?|altering|modif(?:y|ies|ying)|changes?)\s+(.+?)(?=\.(?:\s|$)|;|$|,?\s+(?:and\s+|but\s+)?(?:replaces?|alters?|modif(?:y|ies))\b)/gi;
  let m;
  while ((m = re.exec(t))) {
    const verb = m[1].toLowerCase();
    // only sentences about the archetype's own abilities ("This ability replaces ...", "It alters ...");
    // not "he can replace the previous feat" or "the new speech replaces the old one"
    const before = t.slice(Math.max(0, t.lastIndexOf('.', m.index) + 1), m.index);
    // (or the ability's own name opening the sentence: "Sermonic performance replaces ...")
    if (!/(\b(this|these|which|it|they|that)(\s+[\w’'-]+){0,3}|\bthe (ability|abilities|performance|power|talent|deed)|\band|,)\s*$/i.test(before) && !/^\s*$/.test(before) &&
      !/^\s*(?!(?:the|a|an|he|she|his|her|their|each|any|if|when|whenever|once|while)\b)[A-Z][\w’'-]*(\s+[a-z][\w’'-]*){0,3}\s*$/.test(before)) continue;
    // asides in parentheses, and the alternative for another version of the class, are not what is replaced
    // (for an unchained class, its alternative: "replaces slow fall or the ki power gained at 4th level for an unchained monk")
    const alt = /^unchained/.test(CLS) && m[2].match(/,?\s+or\s+([^.;]*?)\s*\(?\s*for an? unchained \w+\)?/i);
    if (alt) m[2] = alt[1];
    let phrase = m[2].replace(/\([^)]*\)/g, ' ').replace(/,?\s+or\s+[^.;]*\b(unchained|for an? \w+ \w+)\b.*$/i, '').replace(/\s+for an? unchained \w+.*$/i, '');
    if (/^(?:instead of|in place of)/.test(verb) && !findBase(phrase, bs)) continue;
    if (/^chang/.test(verb) && !/^(?:the |his |her )?(?:[a-z ]+ )?(?:class feature|ability)/i.test(phrase) && !findBase(phrase.split(/\s+(?:to|so|into|by)\s+/)[0], bs)) continue;
    phrase = phrase.replace(/^(?:the |all )?(?:increases?|improvements?|bonus(?:es)?) (?:to|in|of) /i, '');
    // "a bard's normal armor proficiencies" is the bard's own feature
    // (but not when the possessive is part of the name: "the gunslinger's dodge deed", "the witch's familiar")
    const owner = phrase.match(/^\s*(?:an?|the) ([\w-]+(?: [\w-]+)?)[’']s\s+(.*)$/i);
    if (owner) {
      const whole = findBase(owner[1] + 's ' + owner[2], bs), rest = findBase(owner[2], bs);
      if (!(whole && (!rest || whole.length > rest.length) && (owner[1] + 's ' + owner[2]).toLowerCase().replace(/[’']/g, '').includes(whole))) phrase = owner[2];
    }
    // "replaces an existing deed", "one of the following", "any rogue talent": no specific feature
    // ("a thousand faces" is a feature)
    if (/^(?:an?|any|one|another|each|some|other|either)\b(?! \d)/i.test(phrase.trim()) && !bs.some(b => norm(phrase).startsWith(b) && /^(a|an|one) /.test(b))) continue;
    phrase = phrase.split(/\s+(?:in the following ways|as follows|to|so that|into|but|except)\b/i)[0];
    const r = resolve(phrase, units, bs);
    const kind = /^(replac|takes the place|in place|instead)/.test(verb) ? 'replaces' : 'modifies';
    r.ids.forEach(id => out[kind].add(id));
    if (!r.ids.length && /replac|alter|modif/.test(verb)) out.miss.push(phrase.slice(0, 80));
  }
  // "A duettist does not gain the well-versed or jack-of-all-trades class features", "she loses the ... class feature": lost features
  for (const g of t.matchAll(/\b(?:does not gain|doesn[’']t gain|do not gain|don[’']t gain|does not receive|doesn[’']t receive|loses|lose|no longer gains?)\s+(?:the |any |her |his |their )?(.+?)(?=\.(?:\s|$)|;|$|\s+(?:and|but) (?:instead|gains?)\b)/gi)) {
    // only the character itself ("the target loses the spell" is not about the class)
    const who = t.slice(Math.max(0, t.lastIndexOf('.', g.index) + 1), g.index);
    // (the subject is someone else: "the target loses", "its familiar does not gain"; "a spirit dancer" is the character)
    if (/^\s*(?:the |a |an |its |her |his |their |that |this |each )?(target|creature|opponent|foe|enemy|enemies|ally|allies|familiar|companion|eidolon|victim|subject|mount|phantom|spirit|it)\s*$/i.test(who.trim().split(/[,;]/).pop())) continue;
    const ph = g[1].replace(/\([^)]*\)/g, ' ').split(/\s+(?:in exchange|because|when|while|if|until|and instead)\b/i)[0];
    if (!findBase(ph, bs) || /^(\d|points?\b|rounds?\b|uses?\b|bonus|penalt|the ability to|access|hit points?)/i.test(ph.trim())) continue;
    resolve(ph, units, bs).ids.forEach(id => out.replaces.add(id));
  }
  // "chooses only one domain", "does not gain a second domain", "selects one domain": a change to domains
  if (/\b(only one domain|one fewer domain|a single domain|second domain|one domain\b|one domain only|sole domain)/i.test(t)) {
    const d = bs.find(b => /^domains?$/.test(b)); if (d) units.filter(u => u.base === d).forEach(u => out.modifies.add(u.id));
  }
  // "This ability functions as rage, except ..." / "A wild rager's rage functions as normal, except ...": a change to that feature
  if (!out.replaces.size && !out.modifies.size) {
    const f = [t.match(/(?:^|\.\s+)(?:an? [\w’' -]+?[’']s |the [\w’' -]+?[’']s |her |his |their )?([\w’' -]{3,40}?) (?:functions?|works?) (?:as normal|normally|as usual)(?:,| except| but)/i),
      t.match(/\b(?:functions?|works?) (?:as|like) (?:the |a |an )?([\w’' -]{3,40}?)(?: class feature| ability)?(?:,| except| but| with|\.)/i)].find(x => x && findBase(x[1], bs));
    if (f) resolve(f[1], units, bs).ids.forEach(id => out.modifies.add(id));
  }
  for (const id of out.replaces) out.modifies.delete(id);
  return { replaces: [...out.replaces], modifies: [...out.modifies], miss: out.miss };
}

// ---- archetypes ----
// Sections of archetype pages that are lists of options (rage powers, bloodlines, mysteries...), not archetypes.
const OPTION_LIST = /\b(powers|discover(y|ies)|hex(es)?|bloodlines|wildblooded|mysteries|masterpieces|inquisitions|domains|traps|arcana|talents|spirits|orders|channeling|companions|vows|sagas|schools|dares|combat styles?|mercies|divine bonds|models|anointings|blades|spellcasting vigilantes|weapon groups?|weapon group members|oaths?|evolutions|patron themes|patron spells|base forms?)\b|^order of |orders$/i;
const ADDS = /\badd(?:s|ed)?\b[^.]{0,120}?\bto (?:the |his |her |their |its )?(?:[\w’' -]{0,40} )?lists?\b|\b(?:can|may) (?:also|additionally) (?:select|choose|take|learn|pick|gain)\b|\bin addition to (?:the |his |her |their |its )?(?:normal|usual|other|regular)\b|\badded to (?:the |his |her |their |its )?(?:[\w’' -]{0,40} )?lists?\b|\bas (?:an )?additional (?:option|choice)s?\b/i;
const TAKES = /\b(instead|remov\w*|except|must be (?:chosen|selected)|only|from the following list|rather than|in place of|cannot|can ?not|can[’']t|no longer|loses?|lost|only (?:select|choose|gain|take|use)|reduc\w*|decreas\w*|replac\w*|must (?:select|choose)|does not gain|doesn[’']t gain|in exchange|fewer|penalty|limited to|restricted)\b/i;
function archetypes(entry, units) {
  const file = fileOf(entry);
  const keep = n => (!entry.only || entry.only.includes(n)) && !(entry.except || []).includes(n);
  const s = read(file);
  const bs = bases(units);
  const res = [];
  // "## Group" headings with no abilities of their own hold archetypes as "### Name" (the Advanced Player's Guide ones);
  // in a "## Archetype", "###" headings are parts of it
  const blocks = s.split(/\n(?=#{2,3} )/).slice(1).map(b => ({ lv: b.match(/^(#+)/)[1].length, name: b.match(/^#+ (.+)/)[1].trim(), body: b.split('\n').slice(1).join('\n') }));
  const parts = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.lv === 2) {
      const kids = []; for (let j = i + 1; j < blocks.length && blocks[j].lv === 3; j++) kids.push(blocks[j]);
      if (OPTION_LIST.test(b.name)) { i += kids.length; continue; }
      if (kids.length && !/^\*\*[^*]+\*\*/m.test(b.body)) { kids.forEach(k => parts.push('## ' + k.name + '\n' + k.body)); i += kids.length; }
      else { parts.push('## ' + b.name + '\n' + b.body + kids.map(k => '\n\n**' + k.name + '**: ' + k.body.trim()).join('')); i += kids.length; }
    }
  }
  for (const p of parts) {
    const name = p.match(/^## (.+)/)[1].trim();
    // a section of alternate class features: each option is its own entry, so several can be mixed with archetypes
    if (/Altern(ate|ative) Class Features$/i.test(name)) { res.push(...altFeatures(name, p.split('\n').slice(1).join('\n'), file, units, bs)); continue; }
    const ov = (OVERRIDES[CLS] || {})[name] || {};
    if (ov._skip) continue;
    const body = p.split('\n').slice(1).join('\n');
    // abilities: paragraphs starting with a bold name; following plain paragraphs belong to it
    const paras = body.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    const intro = []; const abil = [];
    for (const para of paras) {
      const m = para.match(/^\*\*([^*]+?)\*\*:?\s*([\s\S]*)$/) || para.match(/^\*\*([^*]+?):\*\*\s*([\s\S]*)$/);
      const prev = abil[abil.length - 1];
      // an option of the ability above ("choose one of the specializations below"): no level and no replacement of its own
      const option = false; // (options are merged after reading the whole archetype, below)
      // stat-block lines of a companion or creature ("Starting Statistics", "AC", "4th-Level Advancement") belong to the ability above
      const statLine = m && prev && /^(starting statistics|\d+(st|nd|rd|th)[- ]level (advancement|or higher.*)|\d+(st|nd|rd|th) level or higher.*|ac|attack|attacks|ability scores|speed|size|special qualities|special attacks|saves|cmd|cmb|feats|skills|languages|hd|bab)$/i.test(m[1].replace(/:$/, '').trim());
      if (option || statLine) prev.md += '\n\n- **' + m[1].replace(/:$/, '').trim() + '**: ' + m[2].replace(/\n+/g, ' ');
      else if (m && ov._merge && ov._merge[m[1].replace(/:$/, '').trim()]) {
        // part of another ability (an option of it), as Nethys shows it
        const host = abil.find(x => x.name === ov._merge[m[1].replace(/:$/, '').trim()]) || prev;
        host.md += '\n\n- **' + m[1].replace(/:$/, '').trim() + '**: ' + m[2].replace(/\n+/g, ' ');
      }
      else if (m && !/^(Table|Prerequisite)/i.test(m[1])) abil.push({ name: m[1].replace(/:$/, '').trim(), md: m[2] });
      else if (abil.length) abil[abil.length - 1].md += '\n\n' + para;
      else intro.push(para);
    }
    // options of an ability ("choose one of the specializations below"): entries after it with no level and no replacement
    // of their own, anywhere in their text
    for (let i = 1; i < abil.length; i++) {
      const host = abil.slice(0, i).reverse().find(x => !x.option);
      const t = plain(abil[i].md);
      if (host && /\b(following|below)\b/i.test(plain(host.md)) && !/\b(this|these|it)\b[^.]{0,60}\b(replac|alter|modif)/i.test(t) &&
        !new RegExp('\\b' + ORD + ' level').test(t) && !/proficien|skills|alignment/i.test(abil[i].name) && !(ov._keep || []).includes(abil[i].name)) {
        abil[i].option = true;
        host.md += '\n\n- **' + abil[i].name + '**: ' + abil[i].md.replace(/\n+/g, ' ');
      }
    }
    for (let i = abil.length - 1; i >= 0; i--) if (abil[i].option) abil.splice(i, 1);
    const abilities = abil.map(a => {
      const t = plain(a.md);
      const lv = t.match(new RegExp('(?:^|\\b)(?:At|Starting at|Beginning at|Upon reaching|When (?:he|she|they) reaches?|At (?:fighter )?level)\\s+' + ORD + '(?:\\s+level)?', 'i')) || t.match(new RegExp(ORD + ' level', 'i'));
      const r = references(a.md, units, bs);
      // an ability named like a class feature modifies it (Weapon and Armor Proficiency, Class Skills, Weapon Mastery...)
      const own = findBase(a.name.replace(/\((Ex|Su|Sp)\)/, ''), bs);
      const nm = norm(a.name);
      if (/^(class )?skills?$|^skill ranks( per level)?$/.test(nm)) { if (!r.replaces.includes('class-skills-1')) r.modifies.push('class-skills-1'); }
      else if (/complement|recommended|suggested/i.test(plain(a.md).slice(0, 300) + a.name)) { /* a list of suggested options, not a change */ }
      else if (/^diminished spell(casting|s)$/.test(nm) && !r.replaces.length) {
        const sp = units.filter(u => /^spells?$|spellcasting/.test(u.base));
        r.modifies.push(...sp.map(u => u.id).filter(id => !r.modifies.includes(id)));
      }
      // "Armor and Weapon Proficiencies", "Weapon Proficiency", "Armor Proficiency": a change to the class's proficiencies
      else if (/proficien/.test(nm) && !r.replaces.length && !r.modifies.length) {
        const p = bs.find(b => /proficien/.test(b)); if (p) r.modifies.push(...units.filter(u => u.base === p).map(u => u.id));
      }
      else if (own && (nm === own || nm === own + 's' || nm.replace(/s$/, '') === own) && !r.replaces.length && !r.modifies.length) {
        const us = units.filter(u => u.base === own);
        r.modifies.push(...us.map(u => u.id));
      }
      const o = ov[a.name];
      if (o) {
        if ('replaces' in o) r.replaces = o.replaces ? resolve(o.replaces, units, bs).ids : [];
        if ('modifies' in o) r.modifies = o.modifies ? resolve(o.modifies, units, bs).ids : [];
        r.miss = [];
      }
      // a change that only adds options or benefits to a feature, taking nothing away ("adds X to the list", "can also select")
      const adds = o && 'adds' in o ? o.adds : r.modifies.length && ADDS.test(t) && !TAKES.test(t);
      return Object.assign({ name: a.name, lvl: o && o.lvl ? o.lvl : lv ? +lv[1] : (/proficien|skills/i.test(a.name) ? 1 : null), html: html(file, a.md), replaces: r.replaces, modifies: r.modifies, miss: r.miss }, adds ? { adds: true } : {});
    });
    // sections of the page that are not archetypes (rage powers, bloodlines, schools...) change no class feature
    // (a long list where few entries replace anything is a list of options like bloodlines or mysteries)
    const changing = abilities.filter(b => b.replaces.length || b.modifies.length).length;
    const optionList = OPTION_LIST.test(name);
    if (!changing || (optionList && changing < abilities.length * 0.5) || (abilities.length > 40 && changing < abilities.length * 0.4)) continue;
    // "This archetype can no longer be combined with Sound Striker": a house rule that forbids a combination
    const excl = [];
    const names = g => g[1].split(/\s*,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+/).map(x => x.replace(/^the\s+/i, '').replace(/\s+archetypes?$/i, '').trim()).filter(Boolean);
    for (const g of plain(body).matchAll(/\bthis archetype\s+(?:can no longer|cannot|can not|can[’']t|may not) be (?:combined|taken|used) (?:together )?with (?:the )?(.+?)(?:\s+archetypes?)?(?=\.|;|$)/gi)) excl.push(...names(g));
    // "but this archetype may still be combined with the recondite mechanist archetype": allowed although they share a feature
    const allow = [];
    for (const g of plain(body).matchAll(/\bthis archetype\s+(?:may|can) (?:still )?be combined with (?:the )?([\w’' -]+?) archetype\b/gi)) allow.push(...names(g));
    if (!keep(name)) continue;
    res.push(Object.assign({ name, anchor: slug(name), page: siteUrl(file), intro: intro.length ? html(file, intro[0]) : '', abilities }, /^!!! danger "Banned"/m.test(body) ? { banned: true } : {}, excl.length ? { excl } : {}, allow.length ? { allow } : {}));
  }
  return res;
}

// "## X Alternate Class Features": groups headed by a bold line ("**Blessing of the Faith**") and
// "The following options can be taken in place of ...", then one bold-named paragraph per option.
function altFeatures(section, body, file, units, bs) {
  const paras = body.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const groups = []; let head = null, g = null;
  for (const para of paras) {
    const only = para.match(/^\*\*([^*]+?):?\*\*:?$/);
    const place = plain(para).match(/(?:can be taken|are available|may be taken)?\s*in place of (.+?)[.:]?$/i);
    const m = para.match(/^\*\*([^*]+?):?\*\*:?\s*([\s\S]+)$/);
    if (only) { head = only[1].trim(); continue; }
    if (place && !m && head) { g = { title: head, phrase: place[1], opts: [] }; groups.push(g); continue; }
    if (!g) continue;
    const prev = g.opts[g.opts.length - 1];
    if (m && /^AC Bonus/i.test(m[1]) && prev) prev.md += '\n\n- **' + m[1].trim() + '**: ' + m[2].replace(/\n+/g, ' ');
    else if (m) g.opts.push({ name: m[1].trim(), md: m[2] });
    else if (prev) prev.md += '\n\n' + para.replace(/^\*([^*]+?)\*:?\s*/, '- **$1**: ');
  }
  const all = groups.flatMap(x => x.opts.map(o => o.name));
  const out = [];
  for (const x of groups) {
    const phrase = x.phrase.replace(/^the legendary [\w-]+[’']s (normal )?/i, '').replace(/ class feature$/i, '');
    let ids = resolve(phrase, units, bs).ids;
    if (!ids.length) ids = resolve(x.title, units, bs).ids;
    if (!ids.length && /proficien/i.test(phrase)) { const p = bs.find(b => /proficien/.test(b)); if (p) ids = units.filter(u => u.base === p).map(u => u.id); }
    x.opts.forEach((o, i) => {
      const inGroup = x.opts.filter(y => y.name === o.name).length > 1;
      const name = o.name + (inGroup ? ' ' + String.fromCharCode(65 + x.opts.filter((y, j) => j < i && y.name === o.name).length) : '') +
        (all.filter(n => n === o.name).length > x.opts.filter(y => y.name === o.name).length ? ' (' + x.title + ')' : '');
      const t = plain(o.md);
      const lv = t.match(new RegExp('(?:^|\\b)(?:At|Starting at|Beginning at)\\s+' + ORD + '(?:\\s+level)?', 'i'));
      out.push({ name, kind: 'alt', instead: x.title, anchor: slug(section) + '--' + slug(name), link: slug(section), page: siteUrl(file), intro: '',
        abilities: [{ name, lvl: /proficien/i.test(x.title) ? 1 : lv ? +lv[1] : ((units.find(u => u.id === ids[0]) || {}).lvl || null), html: html(file, o.md), replaces: ids, modifies: [], miss: [] }] });
    });
  }
  return out;
}

module.exports = { CLASSES, classUnits, archetypes, resolve, references, bases, plain, norm, setClass: c => { CLS = c; } };
if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  let unmatched = 0, total = 0;
  for (const [cls, cfg] of Object.entries(CLASSES)) {
    CLS = cls;
    const { units } = classUnits(cfg.page);
    const archs = cfg.archetypes.flatMap(f => archetypes(f, units));
    // (retried: on Windows another program can hold the file for a moment)
    for (let k = 0; ; k++) { try { fs.writeFileSync(path.join(OUT, cls + '.json'), JSON.stringify({ cls, units, archetypes: archs })); break; } catch (e) { if (k > 20) throw e; const t = Date.now(); while (Date.now() - t < 100); } }
    for (const a of archs) for (const b of a.abilities) {
      total++;
      const none = !b.replaces.length && !b.modifies.length;
      if (b.miss.length || none) unmatched++;
      if (REPORT && (b.miss.length || none)) console.log(cls, '|', a.name, '|', b.name, '|', b.miss.length ? 'MISS: ' + b.miss.join(' / ') : 'no reference');
    }
    console.log(cls + ': ' + units.length + ' features, ' + archs.length + ' archetypes');
  }
  console.log('abilities ' + total + ', without a clear reference ' + unmatched);
}
