// Reads the shared class feature lists of the Build Your Own Class subsystems (docs/campaign-systems/class-features/,
// one file per class; the format is in the README there). The same reader as hooks/class_features.py, which renders
// them into the role pages; this one feeds tools/build-starwars-builder.js (the Enemy Builders and the Class Feature Search).
'use strict';
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
const SOURCE = 'campaign-systems/class-features/';
const ROLES = ['warrior', 'specialist', 'caster'];
const BANDS = ['1–8', '9–15', '16–20'];
const TIERS = ['iconic', 'op', 'common', 'weak'];

const ITEM = /^- (\[([^\]]+)\]\(([^)\s]+)(?: "([^"]*)")?\))\s*:\s*(.+)$/;
const PLACE = /^(?:([a-z-]+)\/)?(?:(warrior|specialist|caster)\s+)?(\d+)\s*[–-]\s*(\d+)\s+(iconic|op|common|weak)$/;

// Feature lines -> [{ name, href, title, link, note, places: [{ system, role, band: [lo, hi], tier }] }]. An indented line is a note.
function parse(text, where, role, extra) {
  const out = [];
  text.replace(/\r/g, '').split('\n').forEach((line, i) => {
    const m = line.match(ITEM);
    if (m) {
      const places = m[5].split(',').map(p => {
        const q = p.trim().match(PLACE);
        if (!q || !(q[2] || role)) throw new Error(where + ':' + (i + 1) + ': cannot read the placement “' + p.trim() + '”');
        if (!BANDS.includes(q[3] + '–' + q[4])) throw new Error(where + ':' + (i + 1) + ': unknown level band ' + q[3] + '–' + q[4]);
        return { system: q[1] || null, role: q[2] || role, band: [+q[3], +q[4]], tier: q[5] };
      });
      out.push(Object.assign({ name: m[2], href: m[3], title: m[4] || '', link: m[1], note: null, places }, extra));
    } else if (/^(    |\t)\S/.test(line) && out.length) out[out.length - 1].note = line.trim();
  });
  return out;
}

// Every shared feature; each also carries its file (`group`) and that file's heading (`cls`).
function load() {
  const dir = path.join(DOCS, SOURCE), all = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.md') || /^readme\.md$/i.test(f)) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const cls = ((text.match(/^# (.+)$/m) || [])[1] || f.replace(/\.md$/, '')).trim();
    all.push(...parse(text, SOURCE + f, null, { group: f.replace(/\.md$/, ''), cls }));
  }
  return all;
}

// The features a role page of a subsystem lists: the shared ones plus those written on the page itself.
// dir: the subsystem folder ('campaign-systems/star-wars/'); page: the role page's file name.
function forPage(all, dir, page, role) {
  const system = dir.split('/').filter(Boolean).pop();
  const text = fs.readFileSync(path.join(DOCS, dir, page), 'utf8').replace(/\r/g, '');
  const m = text.match(new RegExp('^<!-- class-features: ' + role + ' -->[ \\t]*\\n((?:(?!<!--).*\\n)*?)<!-- /class-features -->', 'm'));
  const own = m ? parse(m[1], dir + page, role, { group: null, cls: '' }).map(f => Object.assign(f, { places: f.places.map(p => Object.assign(p, { system })) })) : [];
  const out = [];
  for (const f of all.concat(own)) for (const p of f.places)
    if (p.role === role && (!p.system || p.system === system)) out.push({ f, band: p.band, tier: p.tier });
  return out;
}

module.exports = { DOCS, SOURCE, ROLES, BANDS, TIERS, parse, load, forPage };
