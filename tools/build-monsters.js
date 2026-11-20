// Builds monster pages (docs/monsters/<book>/<monster>.md) from Archives of Nethys MonsterDisplay pages saved on disk.
// Each stat block gets the Roll20 export data (see docs/javascripts/roll20-export.js) next to it.
// Usage: node tools/build-monsters.js <dir with pages/*.html> <book key> [--only Name,Name]
//   book keys: see BOOKS below (matched against the page's Source line).
'use strict';
const fs = require('fs');
const path = require('path');

const { applyFeatRules, maxHp } = require('./feat-rules.js');
const ROOT = path.join(__dirname, '..', 'docs');
const MON = path.join(ROOT, 'monsters');
const BOOKS = {
  'bestiary-1': { title: 'Bestiary', re: /^Pathfinder RPG Bestiary pg\./ },
  'bestiary-2': { title: 'Bestiary 2', re: /^(Pathfinder RPG )?Bestiary 2 pg\./ },
  'bestiary-3': { title: 'Bestiary 3', re: /^(Pathfinder RPG )?Bestiary 3 pg\./ },
  'bestiary-4': { title: 'Bestiary 4', re: /^(Pathfinder RPG )?Bestiary 4 pg\./ },
  'bestiary-5': { title: 'Bestiary 5', re: /^(Pathfinder RPG )?Bestiary 5 pg\./ },
  'bestiary-6': { title: 'Bestiary 6', re: /^(Pathfinder RPG )?Bestiary 6 pg\./ },
  'npc-codex': { title: 'NPC Codex', re: /^NPC Codex pg\./ },
  'gamemastery-guide-npcs': { title: 'GameMastery Guide NPCs', re: /^GameMastery Guide pg\./ },
  'monster-codex': { title: 'Monster Codex', re: /^Monster Codex pg\./ },
};
// every other book, minus stat blocks tied to the Golarion setting
const MAIN_BOOKS = /^((Pathfinder RPG )?Bestiary( [2-6])?|Monster Codex|NPC Codex|GameMastery Guide) pg\./;
const SETTING = /\b(Golarion|Absalom|Cheliax|Chelish|Chelaxian|Varisia\w*|Osirion\w*|Ustalav\w*|Numeria\w*|Katapesh\w*|Irrisen\w*|Mwangi|Tian|Garund\w*|Avistan\w*|Razmir\w*|Aroden|Kyonin|Nidal\w*|Mendev\w*|Worldwound|Sarkoris|Belkzen|Qadira\w*|Taldor\w*|Taldan|Andoran\w*|Brevoy|Sekamina|Nar-Voth|Orv|Hellknights?|Red Mantis|Aspis|Pathfinder Society|Shoanti|Kellid\w*|Mammoth Lords|Ulfen|Jadwiga|Magnimar\w*|Korvosa\w*|Riddleport|Sandpoint|Kaer Maga|Thassilon\w*|Azlant\w*|Shackles|Rahadoum|Geb|Nex|Alkenstar|Galt\w*|Isger|Molthune|Nirmathas|Lastwall|Ravounel|Druma|Kalistrade|Jalmeray|Vudra\w*|Minkai|Lung Wa|Tar-Baphon|Whispering Tyrant|Runelords?|Starstone|Inner Sea|Arcadia|Casmaron|Iblydos|Thuvia|Sargava|Bloodcove|Saga Lands|Linnorm Kings|Zagresh|Lamashtu|Dagon|Pazuzu|Orcus|Baphomet|Deskari|Nocticula|Kostchtchie|Zura|Mephistopheles|Dispater|Mammon|Belial|Geryon|Moloch|Baalzebul|Barbatos|Asmodeus|Szuriel|Trelmarixian|Apollyon|Charon|Groetus|Achaekek|Ghlaunder|Zyphus|Besmara|Kabriri|Areshkagal|Arazni|Kurgess|Casandalee|Brigh|Alseta|Hanspur|Gyronna|Sivanah|Naderi|Milani|Ragathiel|Dahak|Apsu|Inheritor)\b/;
// setting names in them are replaced by scrubNames; SETTING stays as the check for what slipped through
BOOKS['other-sources'] = { title: 'Other Sources', re: { test: s => !!s && !MAIN_BOOKS.test(s) } };
// mythic creatures come from their own Nethys list (MythicMonsterDisplay), whatever the book
BOOKS['mythic-bestiary'] = { title: 'Mythic Bestiary', re: { test: s => !!s } };
// from d20pfsrd, converted by tools/convert-pfsrd.js: third-party creatures, and Paizo ones Nethys lacks
BOOKS['third-party'] = { title: 'Third-Party Bestiary', re: /^3PP:/ };
BOOKS['more-creatures'] = { title: 'More Paizo Creatures', re: /^PZO:/ };

// ---------- helpers ----------
const decode = s => String(s)
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const slugOf = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const num = s => { const m = String(s).replace(/[–—−]/g, '-').match(/[+-]?\d+/); return m ? parseInt(m[0], 10) : 0; };
// superscript marks (mythic "M", domain "D", book letters) are dropped from plain text so they do not run into words
const plainText = h => decode(String(h).replace(/<su[pb]>[\s\S]*?<\/su[pb]>/g, '').replace(/<[^>]+>/g, '')).replace(/([a-z])M\b/g, '$1').replace(/[–—−](?=\d)/g, '-').replace(/\s+/g, ' ').trim();
// split on a separator only outside parentheses/brackets
function splitTop(s, sep) {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

// existing site pages, for links and spell saving throws
const SPELL_DIR = path.join(ROOT, 'magic', 'spells');
const FEAT_DIR = path.join(ROOT, 'rules', 'feats');
const spellPages = new Set(fs.readdirSync(SPELL_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)));
const featPages = new Set(fs.readdirSync(FEAT_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)));
const spellSave = {};
function saveOf(slug) {
  if (!(slug in spellSave)) {
    let save = '';
    try {
      const t = fs.readFileSync(path.join(SPELL_DIR, slug + '.md'), 'utf8');
      const m = t.match(/\*\*Saving Throw\*\*\s*([^;\n]*)/);
      if (m) save = m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '').trim();
      if (/^none$/i.test(save) || /see text/i.test(save)) save = '';
    } catch (e) {}
    spellSave[slug] = save;
  }
  return spellSave[slug];
}
const METAMAGIC = /^(maximized|quickened|extended|empowered|silent|stilled|still|widened|heightened|enlarged|reach|persistent|dazing|intensified|selective|bouncing|sickening|thundering|lingering|toppling|piercing|merciful|disruptive|ectoplasmic|elemental|focused|furious|threatening|threnodic|concussive|rime|flaring|tenacious|echoing|fearsome|scarring|traumatic|consecrated|blistering|burning|logical|maximised)\s+/i;
// abbreviations and misspellings found in Nethys stat blocks
const SPELL_ALIASES = {
  'geas': 'geas-quest', 'dancing light': 'dancing-lights', 'deathward': 'death-ward', 'prestigiditation': 'prestidigitation',
  'tough of fatigue': 'touch-of-fatigue', 'force cage': 'forcecage', 'blindness': 'blindness-deafness', 'remove blindness': 'remove-blindness-deafness',
  'meld with stone': 'meld-into-stone', 'purify food & drink': 'purify-food-and-drink', 'purify food and water': 'purify-food-and-drink',
  'purify food or drink': 'purify-food-and-drink', "order's wraith": 'orders-wrath', 'order’s wraith': 'orders-wrath',
  'cure mod. wounds': 'cure-moderate-wounds', 'magic circle vs. evil': 'magic-circle-against-evil', 'g. teleport': 'teleport-greater',
  'd. magic': 'detect-magic', 'r. magic': 'read-magic', 'major curse': 'bestow-curse-greater', 'fires of judgment': 'fire-of-judgment', 'fleshy facade': 'flesh-facade',
  // source typos: d. magic and d. poison sit in a 0-level list (detect spells)
  'd. poison': 'detect-poison', 'ray of fatigue': 'ray-of-exhaustion', 'bear’s strength': 'bulls-strength', "bear's strength": 'bulls-strength',
};
function spellSlug(name) {
  const alias = SPELL_ALIASES[name.toLowerCase().trim()];
  if (alias && spellPages.has(alias)) return alias;
  // "communal stoneskin" -> stoneskin-communal
  const comm = name.toLowerCase().match(/^communal\s+(.*)$/);
  if (comm && spellPages.has(slugOf(comm[1]) + '-communal')) return slugOf(comm[1]) + '-communal';
  // "animate dead4th" (level run into the name), "protection from evil D"
  let n = name.toLowerCase().replace(/[*†‡]/g, '').replace(/\d+(st|nd|rd|th)$/, '').replace(/\s+[dsb]$/, '').trim();
  if (spellPages.has(slugOf(n))) return slugOf(n); // before stripping: "persistent image" is a spell
  // strip metamagic words one at a time, stopping at a real spell ("burning hands" is not "burning" + "hands")
  while (METAMAGIC.test(n)) { n = n.replace(METAMAGIC, ''); if (spellPages.has(slugOf(n))) return slugOf(n); }
  const s = slugOf(n);
  if (spellPages.has(s)) return s;
  // "greater teleport" -> teleport-greater, "mass enlarge" -> enlarge-person-mass
  const m = n.match(/^(greater|lesser|mass|improved)\s+(.*)$/);
  if (m) {
    if (spellPages.has(slugOf(m[2] + ' ' + m[1]))) return slugOf(m[2] + ' ' + m[1]);
    const hit = [...spellPages].find(p => p.startsWith(slugOf(m[2]) + '-') && p.endsWith('-' + m[1]));
    if (hit) return hit;
  }
  return null;
}

// damage, healing, bonuses and duration of each spell at the caster level: tools/spell-rolls.js
const { spellRoll } = require('./spell-rolls.js');

// setting names: the wiki names Golarion's own deities by portfolio (mythological names such as Asmodeus stay)
const DEITIES = {
  'Iomedae': 'the goddess of valor', 'Torag': 'the god of the forge', 'Nethys': 'the god of magic', 'Abadar': 'the god of cities',
  'Sarenrae': 'the goddess of the sun', 'Gozreh': 'the god of nature', 'Zon-Kuthon': 'the god of darkness and pain',
  'Shelyn': 'the goddess of beauty', 'Gorum': 'the god of battle', 'Urgathoa': 'the goddess of undeath', 'Calistria': 'the goddess of lust',
  'Cayden Cailean': 'the god of freedom', 'Erastil': 'the god of farming and hunting', 'Rovagug': 'the god of destruction',
  'Norgorber': 'the god of murder and secrets', 'Desna': 'the goddess of dreams and stars', 'Pharasma': 'the goddess of birth and death',
  'Golarion': 'the world',
  // deities and powers created for the setting
  'Zagresh': 'the orc god of destruction', 'Groetus': 'the god of the end times', 'Achaekek': 'the mantis god',
  'Ghlaunder': 'the parasite god', 'Zyphus': 'the god of accidental death', 'Besmara': 'the pirate goddess',
  'Kabriri': 'the demon lord of ghouls', 'Areshkagal': 'the demon lord of portals', 'Arazni': 'the betrayed goddess',
  'Kurgess': 'the god of sport', 'Casandalee': 'the android goddess', 'Brigh': 'the clockwork goddess',
  'Alseta': 'the goddess of doors', 'Hanspur': 'the river god', 'Gyronna': 'the hag goddess', 'Sivanah': 'the goddess of illusions',
  'Naderi': 'the goddess of tragic love', 'Milani': 'the goddess of rebellion', 'Ragathiel': 'the angel of vengeance',
  'Nocticula': 'the demon lady of darkness', 'Deskari': 'the demon lord of locusts', 'Zura': 'the vampire demon queen',
  'the Inheritor': 'the goddess of valor', 'Inheritor': 'Goddess of Valor', 'Tar-Baphon': 'the lich-king', 'Whispering Tyrant': 'lich-king',
  // places (wording already used across the wiki)
  'Inner Sea region': 'region', 'Inner Sea': 'known world', 'Thassilonian': 'Rune-Empire', 'Thassilon': 'the ancient empire of rune-wielding sorcerers',
  'Runelords': 'rune lords', 'Runelord': 'rune lord', 'Azlanti': 'Sunken-Empire', 'Azlant': 'the sunken arcane empire',
  'Numerian': 'Wasteland', 'Numeria': 'the wasteland of the fallen starship', 'Osirian': 'Desert-Kingdom', 'Osirion': 'the ancient desert kingdom',
  'Varisian': 'Frontier', 'Varisia': 'the frontier', 'Chelish': 'Infernal-Empire', 'Chelaxian': 'Infernal-Empire', 'Cheliax': 'the infernal empire',
  'Ustalavic': 'Gothic', 'Ustalav': 'the gothic realm', 'Irriseni': 'Eternal-Winter', 'Irrisen': 'the eternal-winter realm',
  'Taldan': 'Old-Empire', 'Taldor': 'the old empire', 'Andoren': 'Republican', 'Andoran': 'the republic', 'Qadiran': 'Desert-Empire', 'Qadira': 'the desert empire',
  'Katapeshi': 'Trade-City', 'Katapesh': 'the trade city', 'Razmiran': 'False-God', 'Razmiri': 'False-God', 'Razmir': 'the false god',
  'Vudrani': 'Far-Eastern', 'Vudran': 'Far-Eastern', 'Vudra': 'the far-eastern kingdoms', 'Tian Xia': 'the eastern continent', 'Tian': 'Eastern',
  'Mwangi': 'Jungle', 'Garundi': 'Southern', 'Garund': 'the southern continent', 'Avistani': 'Northern', 'Avistan': 'the northern continent',
  'Kyonin': 'the elven forest', 'Nidalese': 'Shadow-Nation', 'Nidal': 'the shadow nation', 'Mendevian': 'Crusader', 'Mendev': 'the crusader land',
  'Worldwound': 'demon-ravaged land', 'Sarkorian': 'Demon-Ravaged', 'Sarkoris': 'the demon-ravaged land', 'Hold of Belkzen': 'the orc lands', 'Belkzen': 'the orc lands',
  'Sekamina': 'the deepest underworld', 'Nar-Voth': 'the upper underworld', 'Orv': 'the deep underworld',
  'Hellknights': 'Hell Knights', 'Hellknight': 'Hell Knight', 'Red Mantis': 'Scarlet Mantis', 'Aspis Consortium': 'mercenary consortium', 'Aspis': 'Consortium',
  'Pathfinder Society': 'explorers\' society', 'Shoanti': 'Plains-Tribe', 'Kellids': 'northern tribesfolk', 'Kellid': 'Northern-Tribe', 'Mammoth Lords': 'mammoth tribes',
  'Ulfen': 'Northern-Raider', 'Linnorm Kings': 'northern kingdoms', 'Jadwiga': 'Witch-Queen\'s Kin', 'Magnimarian': 'City', 'Magnimar': 'the city of monuments',
  'Korvosan': 'City', 'Korvosa': 'the walled city', 'Riddleport': 'the pirate port', 'Sandpoint': 'the coastal town', 'Kaer Maga': 'the cliff city',
  'Absalom': 'the great city', 'Shackles': 'pirate isles', 'Rahadoumi': 'Godless-Kingdom', 'Rahadoum': 'the godless kingdom', 'Geb': 'the undead kingdom', 'Nex': 'the mage kingdom',
  'Alkenstar': 'the gun city', 'Galtan': 'Revolutionary', 'Galt': 'the revolutionary nation', 'Isger': 'the borderland', 'Molthune': 'the military nation',
  'Nirmathas': 'the forest nation', 'Lastwall': 'the fallen bastion', 'Ravounel': 'the free coast', 'Druman': 'Merchant-Kingdom', 'Druma': 'the merchant kingdom',
  'Kalistrade': 'merchant prophecy', 'Jalmeray': 'the island kingdom', 'Minkaian': 'Eastern-Empire', 'Minkai': 'the eastern empire', 'Lung Wa': 'the fallen eastern empire',
  'Starstone': 'star-stone', 'Arcadia': 'the western continent', 'Casmaron': 'the eastern continent', 'Iblydan': 'Island', 'Iblydos': 'the isles of heroes',
  'Thuvian': 'Desert', 'Thuvia': 'the desert of the sun orchid', 'Sargavan': 'Colonial', 'Sargava': 'the colony', 'Bloodcove': 'the port of blood', 'Saga Lands': 'northern lands',
  'Aroden': 'the last emperor-god', 'Osirionologists': 'desert kingdom scholars', 'Osirionologist': 'desert kingdom scholar', 'Varisians': 'frontier folk', 'Magnimarians': 'city folk', 'Brevic': 'Northern-Kingdom', 'Brevoy': 'the northern kingdom',
};
const DEITY_RE = new RegExp('(^|[.!?]\\s+|\\n)?\\b(' + Object.keys(DEITIES).sort((a, b) => b.length - a.length).join('|') + ')\\b', 'g');
// book citations inside stat blocks: "witch 20 (Pathfinder RPG Advanced Player’s Guide 65, Pathfinder RPG Bestiary 294)"
const CITATION = /\s*\((?:[^()]*?\b(?:Pathfinder RPG|Pathfinder Campaign Setting|Pathfinder Player Companion|Player[’']s Guide|Ultimate \w+|Bestiary|Mythic Adventures|Occult Adventures|Advanced Class Guide|Codex|Handbook|Adventures)\b[^()]*?\d+[^()]*?)\)/g;
function scrubNames(t) {
  return String(t).replace(CITATION, '').replace(DEITY_RE, (all, start, name) => {
    let r = DEITIES[name];
    // adjectives become one capitalized word ("Varisian Hagfish" -> "Frontier Hagfish"), phrases follow the sentence
    if (/^[A-Z]/.test(r)) return (start || '') + r.replace(/-/g, ' ');
    return (start || '') + (start !== undefined ? r.charAt(0).toUpperCase() + r.slice(1) : r);
  });
}

// numbered conditions (house rule): an effect that causes one of them is level 1
function numberConditions(t) {
  return t.replace(/\b((?:be|become|becomes|is|are|left|remain|remains)\s+(?:\w+\s+)?)(nauseated|paralyzed|petrified|stunned)\b(?!\s*\d)(?!\s+(?:creatures?|condition|effects?|targets?))/gi, '$1$2 1');
}

// ---------- HTML -> markdown for the stat block ----------
function toMarkdown(html) {
  let h = html;
  h = h.replace(/<a [^>]*href="SpellDisplay\.aspx\?ItemName=([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (all, item, text) => {
    const s = spellSlug(decode(item)); const t = text;
    return s ? '[[LINK:../../magic/spells/' + s + '.md]]' + t + '[[/LINK]]' : t;
  });
  h = h.replace(/<a [^>]*href="FeatDisplay\.aspx\?ItemName=([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (all, item, text) => {
    const s = { 'dodgility': 'dodge' }[slugOf(decode(item))] || slugOf(decode(item)); // Dodgility lives on dodge.md
    return featPages.has(s) ? '[[LINK:../../rules/feats/' + s + '.md]]' + text + '[[/LINK]]' : text;
  });
  h = h.replace(/<a [^>]*>([\s\S]*?)<\/a>/g, '$1');
  // spell-list lines ("3rd—", "At will—", "1/day—"): link italic spell names the source left unlinked
  h = h.split(/(<br\s*\/?>)/).map(line => {
    if (!/^\s*(?:\d|At will|Constant)[^—<]{0,40}—/i.test(line.replace(/<[^>]+>/g, ''))) return line;
    return line.replace(/(\[\[LINK:[^\]]+\]\][\s\S]*?\[\[\/LINK\]\])|<i>([^<]+)<\/i>/g, (all, linked, name) => {
      if (linked) return linked;
      const s = spellSlug(name.trim().replace(/\s*\([^)]*\)$/, ''));
      return s ? '[[LINK:../../magic/spells/' + s + '.md]]<i>' + name + '</i>[[/LINK]]' : all;
    });
  }).join('');
  h = h.replace(/<i>(\s*)([\s\S]*?)(\s*)<\/i>/g, (_, a, t, b) => t ? a + '*' + t + '*' + b : a + b);
  h = h.replace(/<b>(\s*)([\s\S]*?)(\s*)<\/b>/g, (_, a, t, b) => t ? a + '**' + t + '**' + b : a + b);
  h = h.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '\n\n**$1**\n\n');
  h = h.replace(/<br\s*\/?>\s*<br\s*\/?>/g, '\n\n');
  h = h.replace(/<br\s*\/?>/g, '  \n');
  h = h.replace(/<su[pb]>\s*([\s\S]*?)\s*<\/su[pb]>/g, '[[SUP]]$1[[/SUP]]'); // kept as <sup> ("Power Attack^M", domain "D")
  h = h.replace(/<[^>]+>/g, '');
  h = decode(h).replace(/\[\[LINK:([^\]]+)\]\]([\s\S]*?)\[\[\/LINK\]\]/g, (_, href, text) => {
    const m = text.match(/^(\*?)([\s\S]*?)(\*?)$/);
    return m[1] + '[' + m[2] + '](' + href + ')' + m[3];
  });
  // keep the mythic "M" and domain "D" marks; book abbreviations (APG, UM, OA, B2...) are citations and go
  h = h.replace(/\[\[SUP\]\]([\s\S]*?)\[\[\/SUP\]\]/g, (_, t) => /^(M|D|S)$/.test(t.trim()) ? '<sup>' + t.trim() + '</sup>' : '');
  h = h.replace(/([a-z])M\b(?=[*\],;)\s]|$)/gm, '$1<sup>M</sup>'); // mythic mark typed as a plain letter: "divine favorM"
  h = h.replace(/[ \t]+\n/g, m => (m.endsWith('  \n') ? '  \n' : '\n')).replace(/\n{3,}/g, '\n\n');
  return numberConditions(h).trim();
}

// ---------- stat block fields ----------
// lines: [{label, text, html}] — a line starts with a bold label or is plain text
function blockLines(html) {
  const parts = html.split(/<br\s*\/?>|<h3[^>]*>[\s\S]*?<\/h3>/);
  const lines = [];
  for (const p of parts) {
    // "Base Statistics Without bear's endurance... AC 11; hp 74; Con 16" restates fields; the stat block's own lines win
    if (/^\s*<b>\s*Base Statistics/i.test(p)) continue;
    const segs = p.split(/(?=<b>)/);
    for (const s of segs) {
      const m = s.match(/^<b>([\s\S]*?)<\/b>([\s\S]*)$/);
      // trailing ";" or "," belongs to the separator before the next label ("Space 15 ft., Reach 15 ft.")
      if (m) lines.push({ label: plainText(m[1]), text: plainText(m[2]).replace(/^;\s*/, '').replace(/[;,]\s*$/, ''), html: m[2] });
      else if (plainText(s)) {
        const prev = lines[lines.length - 1];
        // an attack line that ends in "or" goes on in the next line
        if (prev && /^(Melee|Ranged)$/.test(prev.label) && /\bor$/.test(prev.text)) { prev.text += ' ' + plainText(s).replace(/[;,]\s*$/, ''); continue; }
        lines.push({ label: '', text: plainText(s).replace(/^;\s*/, '').replace(/[;,]\s*$/, ''), html: s });
      }
    }
  }
  return lines;
}
const field = (lines, label) => { const l = lines.find(x => x.label.toLowerCase() === label.toLowerCase()); return l ? l.text : ''; };

const SIZE_MOD = { fine: 8, diminutive: 4, tiny: 2, small: 1, medium: 0, large: -1, huge: -2, gargantuan: -4, colossal: -8 };
const SKILLS = new Set(['acrobatics', 'appraise', 'bluff', 'climb', 'diplomacy', 'disable_device', 'disguise', 'escape_artist', 'fly',
  'handle_animal', 'heal', 'intimidate', 'knowledge_arcana', 'knowledge_dungeoneering', 'knowledge_engineering', 'knowledge_geography',
  'knowledge_history', 'knowledge_local', 'knowledge_nature', 'knowledge_nobility', 'knowledge_planes', 'knowledge_religion', 'linguistics',
  'perception', 'ride', 'sense_motive', 'sleight_of_hand', 'spellcraft', 'stealth', 'survival', 'swim', 'use_magic_device']);

function parseSkills(text) {
  const out = {};
  const main = text.split(/;\s*Racial Modifiers/i)[0];
  for (const item of splitTop(main, ',')) {
    const m = item.match(/^(.*?)\s+([+-]\d+)/);
    if (!m) continue;
    const name = m[1].trim(), bonus = parseInt(m[2], 10);
    const k = name.match(/^Knowledge \((.*)\)$/i);
    if (k && /,| and /.test(k[1])) {
      for (const sub of k[1].split(/,\s*|\s+and\s+/)) if (sub.trim()) out['Knowledge (' + sub.trim() + ')'] = bonus;
    } else if (k && /^all$/i.test(k[1])) {
      for (const sub of ['arcana', 'dungeoneering', 'engineering', 'geography', 'history', 'local', 'nature', 'nobility', 'planes', 'religion']) out['Knowledge (' + sub + ')'] = bonus;
    } else out[name] = bonus;
  }
  return out;
}

const DICE = /\d+d\d+(?:\s*[+-]\s*\d+)?/;
function parseDamage(s) {
  // "1d8+4/19–20/×3 plus 1d6 fire" -> dice, mod, threat, mult, rider
  let t = s.replace(/[–—−]/g, '-').trim();
  const d = t.match(/^(\d+d\d+)\s*([+-]\s*\d+)?/);
  if (!d) return { dice: null, mod: 0, threat: 20, mult: 2, rider: t };
  t = t.slice(d[0].length);
  let threat = 20, mult = 2;
  const c1 = t.match(/^\/(\d+)-20/); if (c1) { threat = +c1[1]; t = t.slice(c1[0].length); }
  const c2 = t.match(/^\/[×x](\d)/); if (c2) { mult = +c2[1]; t = t.slice(c2[0].length); }
  return { dice: d[1], mod: d[2] ? parseInt(d[2].replace(/\s/g, ''), 10) : 0, threat, mult, rider: t.trim() };
}
function parseAttacks(text, kind) {
  // returns { groups: [[attack...]...] } — groups are alternatives ("or"), each a full attack
  const groups = [];
  for (const g of splitTop(text.replace(/[–—−](?=\d)/g, '-'), ' or ')) {
    const items = [];
    for (const it of splitTop(g, ',')) {
      for (const part of splitTop(it, ' and ')) {
        // "2 claws +10 (1d6+4)", "glaive +11/+6 melee (1d10+6 plus infernal wound)", "2 light rays +3 ranged touch (1d6)"
        // text after the parenthesis joins the rider: "3 tentacles +15 (1d8+2) plus arcane consumption"
        const m = part.match(/^(?:(\d+)\s+)?(.*?)\s+((?:[+-]\d+\/)*[+-]\d+)\s*(?:melee|ranged)?\s*(touch)?\s*(?:\(([\s\S]*)\))?\s*(plus .*|vs\. .*)?$/);
        if (m) {
          const bonuses = m[3].split('/').map(x => parseInt(x, 10));
          const dmg = parseDamage(m[5] || '');
          if (m[6]) dmg.rider = (dmg.rider ? dmg.rider + ' ' : '') + m[6];
          items.push({ name: m[2].trim(), count: m[1] ? +m[1] : 1, bonuses, touch: !!m[4], kind, ...dmg });
          continue;
        }
        // attacks with no attack roll, such as a swarm: "swarm (3d6 plus poison)"
        const s = part.match(/^(?:(\d+)\s+)?([^(]+?)\s*\(([\s\S]*)\)\s*$/);
        if (s) items.push({ name: s[2].trim(), count: s[1] ? +s[1] : 1, bonuses: [], kind, auto: true, ...parseDamage(s[3]) });
      }
    }
    if (items.length) groups.push(items);
  }
  return groups;
}

function parseSpellBlocks(lines) {
  const blocks = [];
  let cur = null;
  for (const l of lines) {
    const head = /spell-like abilities|spells known|spells prepared|psychic magic|extracts prepared|spells$/i.test(l.label) && /^\(?\s*CL\b|^\(/i.test(l.text);
    if (head) {
      const cl = (l.text.match(/CL (\d+)/i) || [])[1];
      const conc = (l.text.match(/concentration\s*([+-]\d+)/i) || [])[1];
      cur = { title: l.label.replace(/\s+$/, ''), cl: cl ? +cl : null, concentration: conc ? parseInt(conc, 10) : null, levels: [] };
      blocks.push(cur);
      continue;
    }
    if (cur && !l.label) {
      // one line can hold several usage groups: "darkness; 1/day—desecrate"
      const groups = l.text.split(/;\s*(?=(?:\d+\/(?:day|week|month|year|hour)|at will|constant|\d+(?:st|nd|rd|th)|0)\b)/i);
      let any = false;
      for (const text of groups) {
        // "At will—", "1/day - ", "1/day-", "1/day (self plus 1 rider only)—"
        const sep = text.match(/\s*—\s*|\s+-\s+|(?<=day|will|constant|week)-/i);
        if (!sep || sep.index > 45) continue;
        any = true;
        parseLevel(text.slice(0, sep.index).trim(), text.slice(sep.index + sep[0].length));
      }
      if (any) continue;
    }
    if (l.label) cur = null;
  }
  return blocks;

  function parseLevel(label, list) {
    {
      const spells = splitTop(list, ',').map(raw => {
        const dc = (raw.match(/\bDC (\d+)/) || [])[1];
        // "protection from evilD" (domain superscript run into the name)
        const name = raw.replace(/\s*\([^)]*\)/g, '').replace(/[*†‡]/g, '').replace(/\s+[DS]$/, '').replace(/([a-z])[DS]$/, '$1').replace(/([a-z])\d+(st|nd|rd|th)$/, '$1').trim();
        const notes = (raw.match(/\(([^)]*)\)/g) || []).map(x => x.slice(1, -1)).filter(x => !/^DC \d+$/.test(x))
          .map(x => /^\d+$/.test(x) ? 'prepared ' + x + ' times' : x.replace(/,?\s*DC \d+/, ''));
        const slug = spellSlug(name);
        const s = { name };
        if (dc) s.dc = +dc;
        if (slug) { s.page = slug; const sv = dc && saveOf(slug); if (sv && !/^no$/i.test(sv)) s.save = sv; spellRoll(s, slug, cur.cl); }
        if (notes.length) s.note = notes.join('; ');
        return s;
      });
      cur.levels.push({ label, spells });
    }
  }
}

function parseSpecials(html) {
  const i = html.search(/<h3[^>]*>\s*Special Abilities\s*<\/h3>/i);
  if (i < 0) return [];
  let body = html.slice(i).replace(/<h3[^>]*>\s*Special Abilities\s*<\/h3>/i, '');
  const j = body.search(/<h3/); if (j >= 0) body = body.slice(0, j);
  const out = [];
  for (const p of body.split(/(?=<b>)/)) {
    const m = p.match(/^<b>([\s\S]*?)<\/b>([\s\S]*)$/);
    if (!m) continue;
    const head = plainText(m[1]);
    const t = numberConditions(plainText(m[2]));
    const hm = head.match(/^(.*?)\s*\((Ex|Su|Sp)\)$/);
    out.push({ name: hm ? hm[1] : head, type: hm ? hm[2] : '', text: t });
  }
  return out;
}

function parseBlock(html, source) {
  const title = plainText((html.match(/<h2 class="title">([\s\S]*?)<\/h2>/) || [])[1] || '');
  const lines = blockLines(html.replace(/<h2 class="title">[\s\S]*?<\/h2>/, '').replace(/<b>Source<\/b>[\s\S]*?<br\s*\/?>/, ''));
  const tm = title.match(/^(.*?)\s+CR\s+(\d+(?:\/\d+)?(?:\s*\/\s*MR\s*\d+)?|\S+)/); // "CR 9/MR 3" on mythic creatures
  const name = tm ? tm[1] : title, cr = tm ? tm[2] : '';
  const plainLines = lines.filter(l => !l.label).map(l => l.text);
  const typeLine = plainLines.find(t => /\b(fine|diminutive|tiny|small|medium|large|huge|gargantuan|colossal)\b/i.test(t) && /\b(LG|NG|CG|LN|N|CN|LE|NE|CE|any|always|often|usually)\b/.test(t)) || '';
  const before = plainLines.slice(0, plainLines.indexOf(typeLine)).filter(t => !/^\d/.test(t));
  const size = ((typeLine.match(/\b(fine|diminutive|tiny|small|medium|large|huge|gargantuan|colossal)\b/i) || [])[1] || 'medium').toLowerCase();
  const initLine = field(lines, 'Init');
  const fort = field(lines, 'Fort'), ref = field(lines, 'Ref'), will = field(lines, 'Will');
  const stats = field(lines, 'Str') ? lines.filter(l => /^(Str|Dex|Con|Int|Wis|Cha)$/.test(l.label)).map(l => l.label + ' ' + l.text.replace(/,\s*$/, '')).join(', ') : '';
  const dex = num((lines.find(l => l.label === 'Dex') || {}).text || '10');
  const strText = (lines.find(l => l.label === 'Str') || {}).text || '10';
  const str = /\d/.test(strText) ? num(strText) : dex; // no Strength (incorporeal): Dexterity
  const bab = num(field(lines, 'Base Atk'));
  const def = ['Defensive Abilities', 'DR', 'Immune', 'Resist', 'SR', 'Weaknesses'].map(k => field(lines, k) ? (k === 'Defensive Abilities' ? '' : k + ' ') + field(lines, k) : '').filter(Boolean).join('; ');
  const melee = parseAttacks(field(lines, 'Melee'), 'Melee');
  const ranged = parseAttacks(field(lines, 'Ranged'), 'Ranged');
  const fortS = (fort.match(/^[+-]?\d+/) || ['0'])[0], refS = (ref.match(/^[+-]?\d+/) || ['0'])[0], willS = (will.match(/^[+-]?\d+/) || ['0'])[0];
  const saveNote = [fort, ref, will].map(s => s.replace(/^[+-]?\d+\s*,?\s*/, '')).filter(Boolean).join('; ').replace(/^;\s*/, '');
  const checks = parseSkills(field(lines, 'Skills'));
  if (!('Perception' in checks)) { const p = (initLine + ' ' + field(lines, 'Senses')).match(/Perception\s*([+-]\d+)/); if (p) checks.Perception = parseInt(p[1], 10); }
  checks.CMB = num(field(lines, 'CMB'));
  const data = {
    name, cr, xp: field(lines, 'XP'),
    line: before.concat(typeLine ? [typeLine] : []).join(', '),
    init: num(initLine),
    senses: field(lines, 'Senses').replace(/;?\s*Perception\s*[+-]\d+.*$/, ''),
    ac: field(lines, 'AC').replace(/\s*\(.*$/, ''),
    hp: field(lines, 'hp'),
    saves: { Fort: num(fortS), Ref: num(refS), Will: num(willS) },
    saveNote,
    defense: def,
    aura: field(lines, 'Aura'),
    speed: field(lines, 'Speed') + (field(lines, 'Space') ? '; space ' + field(lines, 'Space') : '') + (field(lines, 'Reach') ? ', reach ' + field(lines, 'Reach') : ''),
    melee, ranged,
    specialAttacks: numberConditions(field(lines, 'Special Attacks')),
    rangedTouch: bab + Math.floor((dex - 10) / 2) + (SIZE_MOD[size] || 0),
    // Strength, or Dexterity with Weapon Finesse when it is higher
    meleeTouch: bab + Math.floor(((/Weapon Finesse/.test(field(lines, 'Feats')) ? Math.max(str, dex) : str) - 10) / 2) + (SIZE_MOD[size] || 0),
    spells: parseSpellBlocks(lines),
    special: parseSpecials(html),
    abilities: stats,
    combat: ['Base Atk', 'CMB', 'CMD'].map(k => field(lines, k) ? (k === 'Base Atk' ? 'BAB' : k) + ' ' + field(lines, k) : '').filter(Boolean).join('; '),
    checks,
    feats: field(lines, 'Feats'),
    languages: field(lines, 'Languages'),
    sq: field(lines, 'SQ'),
    gear: field(lines, 'Gear') || field(lines, 'Combat Gear') || field(lines, 'Other Gear'),
  };
  for (const k of Object.keys(data)) if (data[k] === '' || (Array.isArray(data[k]) && !data[k].length)) delete data[k];
  return data;
}

// ---------- page ----------
function pageFor(html, bookKey) {
  const start = html.indexOf('<h1 class="title">');
  const end = html.indexOf('</span>', html.indexOf('<h2 class="title">'));
  let main = html.slice(start, end > start ? end : undefined);
  main = main.replace(/<span[^>]*>|<\/span>/g, '');
  const pageName = plainText((main.match(/<h1 class="title">([\s\S]*?)<\/h1>/) || [])[1]);
  // stat blocks: each <h2 class="title"> up to the Description heading or the next h2/h1
  const blocks = [];
  const re = /<h2 class="title">[\s\S]*?(?=<h2 class="title">|<h1 class="title">|<h3 class="framing">\s*Description|$)/g;
  let m;
  while ((m = re.exec(main))) {
    const b = m[0];
    const src = plainText((b.match(/<b>Source<\/b>([\s\S]*?)<br/) || [])[1] || '');
    // only stat blocks: a golem's second title block is its Construction entry (no CR)
    if (!/<h2 class="title">[^<]*\bCR\b/.test(b)) continue;
    // template and variant boxes ("True Hunter (CR +1)") have no AC or hit points of their own
    if (!/<b>AC<\/b>/.test(b) && !/<b>hp<\/b>/.test(b)) continue;
    blocks.push({ html: maxHp(applyFeatRules(b)), source: src }); // house rules: feats, then maximum hit points
  }
  const book = BOOKS[bookKey];
  const mine = blocks.filter(b => {
    if (!book.re.test(b.source)) return false;
    if (!book.exclude) return true;
    // other sources: leave out unique named characters ("X, the Y") and blocks that name Golarion places, groups or powers
    const name = plainText((b.html.match(/<h2 class="title">([\s\S]*?)<\/h2>/) || [])[1] || '');
    const body = plainText(b.html.replace(/<b>Source<\/b>[\s\S]*?<br\s*\/?>/, ''));
    return !/,/.test(name) && !book.exclude.test(body) && !book.exclude.test(pageName);
  });
  if (!mine.length) return null;
  let md = '# ' + pageName + '\n\n';
  for (const b of mine) {
    const data = parseBlock(b.html, b.source);
    const statHtml = b.html.replace(/<h2 class="title">[\s\S]*?<\/h2>/, '').replace(/<b>Source<\/b>[\s\S]*?<br\s*\/?>/, '');
    // data in an attribute, so the site search does not index it
    md += '<div class="r20-export" data-r20="' + JSON.stringify(data).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '"></div>\n\n';
    md += '## ' + data.name + (data.cr ? ' (CR ' + data.cr + ')' : '') + '\n\n' + toMarkdown(statHtml) + '\n\n';
  }
  return { name: scrubNames(pageName), md: scrubNames(md.trim()) + '\n', blocks: mine.map(b => JSON.parse(scrubNames(JSON.stringify(parseBlock(b.html, b.source))))) };
}

// Windows sometimes locks a file for a moment (indexer, antivirus): try again before giving up
function writeRetry(file, text) {
  for (let i = 0; ; i++) {
    try { return fs.writeFileSync(file, text); } catch (e) {
      if (i >= 5) throw e;
      const until = Date.now() + 300 * (i + 1); while (Date.now() < until) { /* wait */ }
    }
  }
}

// ---------- main ----------
if (require.main === module) {
  const [dir, bookKey, flag, onlyArg] = process.argv.slice(2);
  if (!BOOKS[bookKey]) { console.error('book key?', Object.keys(BOOKS).join(', ')); process.exit(1); }
  const only = flag === '--only' ? new Set(onlyArg.split(',')) : null;
  const outDir = path.join(MON, bookKey);
  fs.mkdirSync(outDir, { recursive: true });
  // dir may list several download folders separated by commas (monsters and NPCs)
  const files = dir.split(',').flatMap(d => fs.readdirSync(path.join(d, 'pages')).filter(f => f.endsWith('.html')).map(f => path.join(d, 'pages', f)));
  const index = [];
  const seen = new Set();
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const p = pageFor(html, bookKey);
    if (!p || (only && !only.has(p.name))) continue;
    let slug = slugOf(p.name); while (seen.has(slug)) slug += '-2'; seen.add(slug);
    writeRetry(path.join(outDir, slug + '.md'), p.md);
    for (const b of p.blocks) index.push({ name: b.name, cr: b.cr, type: b.line || '', slug });
  }
  index.sort((a, b) => a.name.localeCompare(b.name));
  const crNum = c => c.includes('/') ? eval(c) : +c;
  let idx = '# ' + BOOKS[bookKey].title + '\n\nEvery creature here has a **Roll20** panel above its stat block: copy it into a Roll20 character\'s Bio & Info and each attack, save, check and spell rolls from there (see [Monsters in Roll20](../roll20.md) for the setup).\n\n| Creature | CR | Description |\n|---|---|---|\n';
  idx += index.map(e => '| [' + e.name + '](' + e.slug + '.md) | ' + e.cr + ' | ' + e.type.replace(/\|/g, '/') + ' |').join('\n') + '\n';
  if (!only) writeRetry(path.join(outDir, 'index.md'), idx);
  console.log(bookKey + ':', new Set(index.map(e => e.slug)).size, 'pages,', index.length, 'stat blocks');
}
module.exports = { parseBlock, parseAttacks, pageFor, toMarkdown, scrubNames };
