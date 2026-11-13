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
const EXTRA = {
  shifter: [C + 'canefinder-shifter-archetypes.md', C + 'shifter-archetypes.md'],
  'shifter-ultimate-wilderness': [C + 'shifter-archetypes.md'],
  witch: [C + 'witch-archetypes.md', C + 'white-haired-witch.md'],
};
const CLASSES = {};
for (const dir of [C, C + 'legendary/']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    const m = f.match(/^(.+).md$/); if (!m || /-archetypes$/.test(m[1])) continue;
    const arch = dir + m[1] + '-archetypes.md';
    const list = EXTRA[m[1]] || (fs.existsSync(path.join(ROOT, arch)) ? [arch] : null);
    if (list) CLASSES[m[1]] = { page: dir + f, archetypes: list };
  }
}
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
function classUnits(file) {
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
    const special = plain(c[si]);
    if (!special || special === '—' || special === '-') continue;
    for (const label of special.split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean)) {
      const base = norm(label.replace(/\(.*?\)\s*$/, '')).replace(/(\s+(\d+(st|nd|rd|th)?|\d+d\d+|\d+ (day|days|round|rounds|minutes|ft|feet)|\d+ \d+))+$/, '').trim();
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
  }
  return { units, secs };
}

// ---- references to class features inside archetype text ----
function bases(units) { return [...new Set(units.map(u => u.base))].sort((a, b) => b.length - a.length); }
let CLS = '';
// Words that sit between the parts of a feature name in archetype text ("the fighter's normal bonus combat feat").
const filler = t => t.replace(new RegExp('\\b(' + CLS + 's?|normal|normally|combat|regular|usual|base)\\b', 'g'), ' ').replace(/\s+/g, ' ');
// Other names archetypes use for a class feature (unchained or older versions of the class).
const ALIAS = [[/\bdanger sense\b/g, 'trap sense'], [/\b(spellcasting|spells? class feature)\b/g, 'spells']];
function findBase(text, bs) {
  let n = norm(text);
  for (const [re, to] of ALIAS) if (!bs.some(b => re.test(b))) n = n.replace(re, to);
  const ts = [' ' + n + ' ', ' ' + filler(n) + ' '];
  for (const t of ts) for (const b of bs) {
    const alts = [b, b + 's', b.replace(/y$/, 'ies'), b.replace(/^the /, '')];
    if (alts.some(a => t.includes(' ' + a + ' '))) return b;
  }
  const t = ts[1];
  // singular in the text, plural base ("bonus feats" vs "bonus feat")
  for (const tt of ts) for (const b of bs) if (tt.includes(' ' + b.replace(/s$/, '') + ' ')) return b;
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
  const parts = plain(phrase).replace(/\bas well as\b/g, ',').split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+(?!\d+(?:st|nd|rd|th) level)|\s+or\s+/i).map(x => x.trim()).filter(Boolean);
  let last = null;
  for (let part of parts) {
    const whole = part;
    part = part.replace(/^(?:the|his|her|their|a|an)\s+/i, '').replace(/\s+(?:class features?|abilities|ability|features?)$/i, '').trim();
    let b = findBase(part, bs) || findBase(whole, bs);
    // an exact table entry ("poison resistance +6")
    const exact = units.find(u => norm(u.label) === norm(part));
    if (exact) { ids.add(exact.id); last = exact.base; continue; }
    const bare = part.match(/^(\d+)$/);
    if (!b && bare && last) { b = last; }
    if (!b) {
      const lv = levelsIn(part);
      if (lv.length && last) b = last; else { if (part.length > 2) miss.push(part); continue; }
    }
    last = b;
    const own = units.filter(u => u.base === b);
    const rest = filler(norm(part).replace(b, ' ').replace(b.replace(/s$/, ''), ' '));
    const nums = (bare ? [+bare[1]] : [...rest.matchAll(/(?:^|\s)(\d+)(?=\s|$)/g)].map(m => +m[1]));
    const lv = levelsIn(part);
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
  const t = plain(text);
  const re = /\b(replaces?|replacing|in place of|instead of|alters?|altering|modif(?:y|ies|ying)|changes?)\s+(.+?)(?=\.(?:\s|$)|;|$)/gi;
  let m;
  while ((m = re.exec(t))) {
    const verb = m[1].toLowerCase();
    let phrase = m[2];
    if (/^(?:instead of|in place of)/.test(verb) && !findBase(phrase, bs)) continue;
    if (/^chang/.test(verb) && !/^(?:the |his |her )?(?:[a-z ]+ )?(?:class feature|ability)/i.test(phrase) && !findBase(phrase.split(/\s+(?:to|so|into|by)\s+/)[0], bs)) continue;
    phrase = phrase.replace(/^(?:the |all )?(?:increases?|improvements?|bonus(?:es)?) (?:to|in|of) /i, '');
    // "replaces an existing deed", "one of the following", "any rogue talent": no specific feature
    if (/^(?:an?|any|one|another|each|some|other|either)\b(?! \d)/i.test(phrase.trim())) continue;
    phrase = phrase.split(/\s+(?:in the following ways|as follows|to|so that|into|but|except)\b/i)[0];
    const r = resolve(phrase, units, bs);
    const kind = /^(replac|in place|instead)/.test(verb) ? 'replaces' : 'modifies';
    r.ids.forEach(id => out[kind].add(id));
    if (!r.ids.length && /replac|alter|modif/.test(verb)) out.miss.push(phrase.slice(0, 80));
  }
  for (const id of out.replaces) out.modifies.delete(id);
  return { replaces: [...out.replaces], modifies: [...out.modifies], miss: out.miss };
}

// ---- archetypes ----
function archetypes(file, units) {
  const s = read(file);
  const bs = bases(units);
  const res = [];
  const parts = s.split(/\n(?=## )/).slice(1);
  for (const p of parts) {
    const name = p.match(/^## (.+)/)[1].trim();
    const body = p.split('\n').slice(1).join('\n');
    // abilities: paragraphs starting with a bold name; following plain paragraphs belong to it
    const paras = body.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    const intro = []; const abil = [];
    for (const para of paras) {
      const m = para.match(/^\*\*([^*]+?)\*\*:?\s*([\s\S]*)$/) || para.match(/^\*\*([^*]+?):\*\*\s*([\s\S]*)$/);
      const prev = abil[abil.length - 1];
      // an option of the ability above ("choose one of the specializations below"): no level and no replacement of its own
      const option = m && prev && /\b(following|below)\b/i.test(plain(prev.md)) && !/\b(replac|alter|modif)/i.test(m[2]) &&
        !new RegExp('\\b' + ORD + ' level').test(plain(m[2])) && !/proficien|skills/i.test(m[1]);
      if (option) prev.md += '\n\n- **' + m[1].replace(/:$/, '').trim() + '**: ' + m[2].replace(/\n+/g, ' ');
      else if (m && !/^(Table|Prerequisite)/i.test(m[1])) abil.push({ name: m[1].replace(/:$/, '').trim(), md: m[2] });
      else if (abil.length) abil[abil.length - 1].md += '\n\n' + para;
      else intro.push(para);
    }
    const abilities = abil.map(a => {
      const t = plain(a.md);
      const lv = t.match(new RegExp('(?:^|\\b)(?:At|Starting at|Beginning at|Upon reaching|When (?:he|she|they) reaches?|At (?:fighter )?level)\\s+' + ORD + '(?:\\s+level)?', 'i')) || t.match(new RegExp(ORD + ' level', 'i'));
      const r = references(a.md, units, bs);
      // an ability named like a class feature modifies it (Weapon and Armor Proficiency, Class Skills, Weapon Mastery...)
      const own = findBase(a.name.replace(/\((Ex|Su|Sp)\)/, ''), bs);
      const nm = norm(a.name);
      if (/^(class )?skills?$|^skill ranks( per level)?$/.test(nm)) { if (!r.replaces.includes('class-skills-1')) r.modifies.push('class-skills-1'); }
      else if (/complement|recommended|suggested/i.test(plain(a.md).slice(0, 300) + a.name)) { /* a list of suggested options, not a change */ }
      else if (/^diminished spell(casting|s)$/.test(nm) && !r.replaces.length && !r.modifies.length) {
        const sp = units.filter(u => /^spells?$|spellcasting/.test(u.base));
        r.modifies.push(...sp.map(u => u.id));
      }
      else if (own && (nm === own || nm === own + 's' || nm.replace(/s$/, '') === own) && !r.replaces.length && !r.modifies.length) {
        const us = units.filter(u => u.base === own);
        (/proficien/.test(nm) ? r.replaces : r.modifies).push(...us.map(u => u.id));
      }
      return { name: a.name, lvl: lv ? +lv[1] : (/proficien|skills/i.test(a.name) ? 1 : null), html: html(file, a.md), replaces: r.replaces, modifies: r.modifies, miss: r.miss };
    });
    // sections of the page that are not archetypes (rage powers, bloodlines, schools...) change no class feature
    // (a long list where few entries replace anything is a list of options like bloodlines or mysteries)
    const changing = abilities.filter(b => b.replaces.length || b.modifies.length).length;
    const optionList = /\b(powers|discover(y|ies)|hex(es)?|bloodlines|wildblooded|mysteries|masterpieces|inquisitions|domains|traps|arcana|talents|spirits|orders|channeling|companions|vows|sagas|schools|dares|combat styles?|mercies|divine bonds|models|anointings|blades|spellcasting vigilantes|weapon group)\b/i.test(name);
    if (!abilities.length || (optionList && changing < abilities.length * 0.5) || (abilities.length > 40 && changing < abilities.length * 0.4)) continue;
    res.push({ name, anchor: slug(name), page: siteUrl(file), intro: intro.length ? html(file, intro[0]) : '', abilities });
  }
  return res;
}

fs.mkdirSync(OUT, { recursive: true });
let unmatched = 0, total = 0;
for (const [cls, cfg] of Object.entries(CLASSES)) {
  CLS = cls;
  const { units } = classUnits(cfg.page);
  const archs = cfg.archetypes.flatMap(f => archetypes(f, units));
  fs.writeFileSync(path.join(OUT, cls + '.json'), JSON.stringify({ cls, units, archetypes: archs }));
  for (const a of archs) for (const b of a.abilities) {
    total++;
    const none = !b.replaces.length && !b.modifies.length;
    if (b.miss.length || none) unmatched++;
    if (REPORT && (b.miss.length || none)) console.log(cls, '|', a.name, '|', b.name, '|', b.miss.length ? 'MISS: ' + b.miss.join(' / ') : 'no reference');
  }
  console.log(cls + ': ' + units.length + ' features, ' + archs.length + ' archetypes');
}
console.log('abilities ' + total + ', without a clear reference ' + unmatched);
