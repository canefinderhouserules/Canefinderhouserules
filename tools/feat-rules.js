// Applies the wiki's feat house rules to a stat block (Archives of Nethys HTML), before tools/build-monsters.js reads it.
//  - Power Attack, Deadly Aim, Piranha Strike and Pinpoint Attack need no feat: they stay listed as "(no feat needed)".
//  - Combined feats: Dodge + Mobility = Dodgility; Toughness + Endurance + Diehard = Toughness; Point-Blank Shot +
//    Precise Shot = Point-Blank Shot; Weapon Finesse + Agile Maneuvers = Weapon Finesse; Throw Anything + Catch Off-Guard
//    = Throw Anything; Improved + Greater Two-Weapon Fighting = Improved Two-Weapon Fighting; Angel Wings + Angelic Blood
//    = Angel Wings; two or more Improved maneuver feats of a group = Deft Maneuvers / Powerful Maneuvers.
//  - Each feat slot that frees up gets a useful feat the creature lacks (Weapon Focus, Dodgility, Improved Initiative,
//    Toughness, a save feat, Skill Focus), and the numbers those feats change are updated in the stat block.
// Mythic feats (marked M) are left alone. A note under the feats says what changed.
'use strict';

const strip = h => String(h).replace(/<su[pb]>[\s\S]*?<\/su[pb]>/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const numOf = s => parseInt(String(s).replace(/[–—−]/g, '-'), 10);
const fmt = n => (n < 0 ? '–' + Math.abs(n) : '+' + n);
const featLink = n => '<a href="FeatDisplay.aspx?ItemName=' + n.replace(/\s*\(.*$/, '') + '">' + n + '</a>';
function splitTop(s, sep) {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

// the HTML of a labeled field, up to the next <br> or heading
function fieldRe(label) { return new RegExp('(<b>\\s*' + label + '\\s*</b>)([\\s\\S]*?)(?=<br|<h3|<b>|$)'); }
function getField(html, label) { const m = html.match(fieldRe(label)); return m ? m[2] : null; }
function setField(html, label, fn) { return html.replace(fieldRe(label), (all, b, v) => b + fn(v)); }
// add n to the first number of a field ("+6", "–1", "16")
function bumpFirst(v, n) { return v.replace(/([+–—−-]?)(\d+)/, (all, sign, d) => { const x = numOf((sign === '+' ? '' : sign) + d) + n; return /[+–—−-]/.test(sign) || x < 0 ? fmt(x) : String(x); }); }

const FREE = ['Power Attack', 'Deadly Aim', 'Piranha Strike', 'Pinpoint Attack'];
const MERGES = [
  { into: 'Dodgility', parts: ['Dodge', 'Mobility'], rename: ['Dodge', 'Dodgility'] },
  { into: 'Toughness', parts: ['Toughness', 'Endurance', 'Diehard'] },
  { into: 'Point-Blank Shot', parts: ['Point-Blank Shot', 'Precise Shot'] },
  { into: 'Weapon Finesse', parts: ['Weapon Finesse', 'Agile Maneuvers'] },
  { into: 'Throw Anything', parts: ['Throw Anything', 'Catch Off-Guard'] },
  { into: 'Improved Two-Weapon Fighting', parts: ['Improved Two-Weapon Fighting', 'Greater Two-Weapon Fighting'] },
  { into: 'Angel Wings', parts: ['Angel Wings', 'Angelic Blood'] },
];
const MANEUVERS = [
  { into: 'Deft Maneuvers', parts: ['Improved Trip', 'Improved Disarm', 'Improved Dirty Trick', 'Improved Feint', 'Improved Reposition', 'Improved Steal'] },
  { into: 'Powerful Maneuvers', parts: ['Improved Grapple', 'Improved Bull Rush', 'Improved Drag', 'Improved Overrun', 'Improved Sunder'] },
];

// weapon name for Weapon Focus: "2 claws" -> claw, "+1 flaming longsword" -> longsword, "mwk short sword" -> short sword
const TWO_WORD = /^(short|light|heavy|composite|hand|bastard|dwarven|elven|orc|gnome|throwing|war|dire|spiked|double|two-bladed|curve|lucerne|great|long|repeating|bladed|hooked)$/i;
function focusName(attack) {
  let w = attack.replace(/^\d+\s+/, '').replace(/\+\d+\s+/g, '').replace(/\b(mwk|masterwork)\s+/gi, '').trim().split(/\s+/);
  let name = w[w.length - 1];
  if (w.length > 1 && TWO_WORD.test(w[w.length - 2])) name = w[w.length - 2] + ' ' + name;
  if (/^\d/.test(attack.trim()) || /s$/.test(name) && !/ss$/.test(name)) name = name.replace(/hooves$/, 'hoof').replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
  return name.toLowerCase();
}

function applyFeatRules(html) {
  const featsHtml = getField(html, 'Feats');
  if (featsHtml == null) return html;
  const items = splitTop(featsHtml, ',').map(h => ({ html: h, name: strip(h).replace(/\s*\(B\)$/, ''), mythic: /<su[pb]>\s*M\s*<\/su[pb]>/.test(h) || /\(M\)/.test(h) }));
  const has = n => items.some(i => !i.mythic && (i.name === n || i.name.startsWith(n + ' (')));
  const notes = [];
  let freed = 0;
  const keep = [], free = [];
  for (const it of items) {
    if (!it.mythic && FREE.includes(it.name)) { free.push(it.name); freed++; continue; }
    keep.push(it);
  }
  // combined feats: keep one entry, free the rest
  let toughGained = false, dodgeGained = false;
  for (const m of MERGES) {
    const found = keep.filter(i => !i.mythic && m.parts.includes(i.name));
    if (!found.length) continue;
    const first = keep.indexOf(found[0]);
    for (const f of found) keep.splice(keep.indexOf(f), 1);
    keep.splice(first, 0, { html: featLink(m.into), name: m.into });
    freed += found.length - 1;
    if (found.length > 1) notes.push(found.map(f => f.name).join(' and ') + ' are one feat, ' + m.into);
    else if (found[0].name !== m.into) notes.push(found[0].name + ' is part of ' + m.into);
    if (m.into === 'Toughness' && !found.some(f => f.name === 'Toughness')) toughGained = true; // Endurance alone becomes Toughness
    if (m.into === 'Dodgility' && !found.some(f => f.name === 'Dodge')) dodgeGained = true; // Mobility without Dodge (rare)
  }
  for (const g of MANEUVERS) {
    const found = keep.filter(i => !i.mythic && g.parts.includes(i.name));
    if (found.length < 2) continue;
    const first = keep.indexOf(found[0]);
    for (const f of found) keep.splice(keep.indexOf(f), 1);
    keep.splice(first, 0, { html: featLink(g.into), name: g.into });
    freed += found.length - 1;
    notes.push(found.map(f => f.name).join(', ') + ' are covered by ' + g.into);
  }
  if (free.length) notes.push(free.join(', ') + (free.length > 1 ? ' need' : ' needs') + ' no feat');
  // Toughness gained through Endurance or Diehard alone adds hit points
  if (toughGained) html = addToughnessHp(html);
  if (dodgeGained) html = addDodge(html);

  // fill free slots
  const added = [];
  const stat = s => { const m = html.match(new RegExp('<b>' + s + '</b>\\s*([–—−-]?\\d+)')); return m ? numOf(m[1]) : null; };
  const bab = (() => { const v = getField(html, 'Base Atk'); return v ? numOf(strip(v)) : 0; })();
  const hasNow = n => keep.some(i => i.name === n || i.name.startsWith(n + ' (')) || added.some(a => a.startsWith(n));
  const meleeText = strip(getField(html, 'Melee') || ''), rangedText = strip(getField(html, 'Ranged') || '');
  const firstAttack = (meleeText || rangedText).split(/,| or /)[0].replace(/\(.*$/, '').replace(/\s+[+–—−-]\d+.*$/, '').trim();
  const choices = [
    () => firstAttack && bab >= 1 && !hasNow('Weapon Focus') && !/swarm/i.test(firstAttack) && (() => {
      const w = focusName(firstAttack); added.push('Weapon Focus (' + w + ')'); html = bumpAttack(html, firstAttack, w); return true;
    })(),
    () => (stat('Dex') || 0) >= 13 && !hasNow('Dodgility') && (() => { added.push('Dodgility'); html = addDodge(html); return true; })(),
    () => !hasNow('Improved Initiative') && (() => { added.push('Improved Initiative'); html = setField(html, 'Init', v => bumpFirst(v, 4)); return true; })(),
    () => !hasNow('Toughness') && /<b>hp<\/b>/.test(html) && (() => { added.push('Toughness'); html = addToughnessHp(html); return true; })(),
    () => {
      const saves = [['Fort', 'Great Fortitude'], ['Ref', 'Lightning Reflexes'], ['Will', 'Iron Will']].filter(s => !hasNow(s[1]))
        .map(s => [s[0], s[1], (() => { const v = getField(html, s[0]); return v == null ? null : numOf(strip(v)); })()]).filter(s => s[2] != null && !isNaN(s[2]));
      if (!saves.length) return false;
      saves.sort((a, b) => a[2] - b[2]);
      added.push(saves[0][1]); html = setField(html, saves[0][0], v => bumpFirst(v, 2)); return true;
    },
    () => {
      const sk = getField(html, 'Skills'); if (!sk) return false;
      // the creature's best skill
      const all = [...strip(sk).split(/;\s*Racial/)[0].matchAll(/([A-Z][a-z]+(?: [A-Z][a-z]+)?(?: \([^)]*\))?) ([+–—−-]\d+)/g)];
      if (!all.length) return false;
      all.sort((a, b) => numOf(b[2]) - numOf(a[2]));
      const m = all[0];
      if (hasNow('Skill Focus (' + m[1] + ')')) return false;
      const hd = hitDice(html), bonus = hd >= 10 ? 6 : 3;
      added.push('Skill Focus (' + m[1] + ')');
      html = setField(html, 'Skills', v => v.replace(new RegExp('(' + m[1].replace(/[()]/g, '\\$&') + '(?:</a>)?\\s*)([+–—−-]\\d+)'), (a, p, n) => p + fmt(numOf(n) + bonus)));
      return true;
    },
  ];
  for (let s = 0; s < freed; s++) { if (!choices.some(c => c())) break; }
  if (added.length) notes.push('in their place: ' + added.join(', '));

  if (!notes.length) return html;
  const list = keep.map(i => i.html).concat(added.map(featLink)).join(', ') + (free.length ? '; ' + free.map(f => featLink(f) + ' (no feat needed)').join(', ') : '');
  html = setField(html, 'Feats', () => ' ' + list);
  // the note goes on its own line after the feats
  return html.replace(/(<b>\s*Feats\s*<\/b>[\s\S]*?)(<br|<h3)/, '$1<br /><i>House rules: ' + notes.join('; ') + '.</i>$2');
}

function hitDice(html) {
  const hp = getField(html, 'hp') || '';
  const m = strip(hp).match(/\(([^)]*)\)/);
  if (!m) return 0;
  return (m[1].match(/(\d+)d\d+/g) || []).reduce((t, d) => t + parseInt(d, 10), 0);
}
function addToughnessHp(html) {
  const hd = hitDice(html); if (!hd) return html;
  const add = Math.max(3, hd);
  // the constant right after the dice: "(11d6+55 plus 15 false life)" -> 11d6+66; "(4d8+3d10)" -> 4d8+3d10+7
  return setField(html, 'hp', v => v.replace(/(\d+)(\s*\()((?:\s*\+?\s*\d+d\d+)+)(\s*([+–—−-])\s*(\d+))?/, (all, total, sp, dice, c, sg, n) => {
    const x = (c ? numOf((sg === '+' ? '' : '-') + n) : 0) + add;
    return (parseInt(total, 10) + add) + sp + dice + (x < 0 ? '–' : '+') + Math.abs(x);
  }));
}
function addDodge(html) {
  html = setField(html, 'AC', v => {
    v = v.replace(/^(\s*)(\d+)/, (a, s, n) => s + (parseInt(n, 10) + 1));
    v = v.replace(/(touch\s+)(\d+)/, (a, t, n) => t + (parseInt(n, 10) + 1));
    if (/[+]\d+\s+dodge/.test(v)) v = v.replace(/\+(\d+)(\s+dodge)/, (a, n, d) => '+' + (parseInt(n, 10) + 1) + d);
    else v = v.replace(/\(/, '(+1 dodge, ');
    return v;
  });
  return setField(html, 'CMD', v => v.replace(/\d+/g, n => String(parseInt(n, 10) + 1)));
}
function bumpAttack(html, attack, focus) {
  const name = attack.replace(/^\d+\s+/, '');
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(' + esc + '(?:<\\/[a-z]+>)?\\s+)((?:[+–—−-]\\d+\\/)*[+–—−-]\\d+)', 'g');
  for (const label of ['Melee', 'Ranged']) html = setField(html, label, v => v.replace(re, (a, p, b) => p + b.split('/').map(x => fmt(numOf(x) + 1)).join('/')));
  return html;
}

module.exports = { applyFeatRules, focusName };
