// Roll20 export for monster stat blocks. A page holds the creature as JSON in <script class="r20-data">; this script
// adds a "Copy for Bio & Info" button that puts the stat block on the clipboard as rich HTML. Pasted (Ctrl+V) into a
// Roll20 character's Bio & Info, it keeps its links, and each attack, save and check link rolls in chat when clicked
// (links of the form href="`<chat command>"). Works in free games: no API scripts.
// Every roll also adds the totals of the character's Pathfinder by Roll20 sheet, left blank (all 10s, no class), so
// those totals are 0 until a Buff or condition on the sheet changes them:
//   attacks  + melee_bonus / ranged_bonus + attack_bonus + attack_condition + half the Str / Dex buff
//   damage   + damage_bonus + melee_damage_bonus / ranged_damage_bonus + the Str buff's modifier (x1.5 two-handed,
//            x0.5 secondary), multiplied on a crit
//   saves, initiative, skills: + the sheet total for that stat (fortitude, stealth...) + its condition penalty
// So a buff written as on a character ("+4 to str") reaches attacks and damage: on a blank sheet the ability is
// 10 + the buff, and strength_bonus (the buffs' total to Str), strength_oneandahalf_mod and strength_half_mod
// exist on a new sheet. Not melee_mod / ranged_mod / strength_mod: a new sheet does not create them until something
// on it changes, and Roll20 then prints "No attribute was found".
// Rolls read @{selected|attr} (the selected token's sheet) unless a character name is typed in the panel.
// Chat output uses the sheet's "pc" roll template (the cards its own rolls post). Roll20's Bio editor deletes a link
// whose command starts with "&", so each command starts with /as "<creature name>", which also names the card's poster.
// Tested in a free Roll20 game (Power Attack buff: -1 to attack, +2 to damage; rage: +4 to str and the rest).
(function () {
  var me = document.currentScript && document.currentScript.src;
  var SPELLS = me ? new URL('../magic/spells/', me).href : ''; // absolute, so the links work from Roll20
  function sgn(n) { return (n < 0 ? '-' : '+') + Math.abs(n); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function sheetAttr(stat) {
    var map = { CMB: 'cmb_mod', Fort: 'fortitude', Ref: 'reflex', Will: 'will', Init: 'initiative' };
    // sheet names: "Knowledge (arcana)" -> knowledge_arcana, "Sense Motive" -> sense_motive
    return map[stat] || stat.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
  // the sheet keeps condition penalties (shaken, sickened...) apart from the totals and adds them when it rolls
  function conditionAttr(stat) {
    return { CMB: 'attack_condition', Fort: 'saves_condition', Ref: 'saves_condition', Will: 'saves_condition', Init: 'initiative_condition' }[stat] || 'skill_condition';
  }

  var SKILLS = ['acrobatics', 'appraise', 'bluff', 'climb', 'diplomacy', 'disable_device', 'disguise', 'escape_artist', 'fly',
    'handle_animal', 'heal', 'intimidate', 'knowledge_arcana', 'knowledge_dungeoneering', 'knowledge_engineering', 'knowledge_geography',
    'knowledge_history', 'knowledge_local', 'knowledge_nature', 'knowledge_nobility', 'knowledge_planes', 'knowledge_religion', 'linguistics',
    'perception', 'ride', 'sense_motive', 'sleight_of_hand', 'spellcraft', 'stealth', 'survival', 'swim', 'use_magic_device'];
  // wrap dice in text as inline rolls ("sleep for 2d4 minutes" -> "sleep for [[2d4]] minutes")
  function rollDice(t) { return t.replace(/\b(\d+d\d+(?:\s*[+-]\s*\d+(?!d))?)\b/g, function (d) { return '[[' + d.replace(/\s/g, '') + ']]'; }); }
  // old hand-written pages list attacks in one array; new ones list alternatives (melee/ranged groups of full attacks)
  function attackGroups(m) {
    if (m.melee || m.ranged) return { melee: m.melee || [], ranged: m.ranged || [] };
    var melee = [], ranged = [];
    (m.attacks || []).forEach(function (a) {
      var b = { name: a.name, count: 1, bonuses: [a.bonus], dice: a.dice, mod: a.mod, threat: a.threat, mult: a.mult, rider: a.rider || '', kind: a.kind };
      if (/ranged/i.test(a.kind)) ranged.push([b]); else melee.push(b);
    });
    return { melee: melee.length ? [melee] : [], ranged: ranged };
  }

  function bioHtml(m, who) {
    var A = function (attr) { return '@{' + who + '|' + attr + '}'; };
    // esc() turns the command's double quotes into &quot;, which the Bio keeps
    var link = function (label, text) { return '<a href="`' + esc(text) + '">' + esc(label) + '</a>'; };
    var row = function (k, v) { return '<tr><td><b>' + esc(k) + '</b></td><td>' + v + '</td></tr>'; };
    // a "pc" template card posted under the creature's name; fields: [name, value] pairs, empty ones left out
    var speaker = m.name.replace(/["{}|]/g, '');
    var T = function (fields) {
      fields = fields.filter(function (f) { return f && f[1] !== '' && f[1] != null; });
      var hasNotes = fields.some(function (f) { return f[0] === 'notes'; });
      return '/as "' + speaker + '" &{template:pc}' + fields.filter(function (f) { return hasNotes || f[0] !== 'shownotes'; })
        .map(function (f) { return ' {{' + f[0] + '=' + String(f[1]).replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }') + '}}'; }).join('');
    };
    var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
    // extra: text inside the roll, e.g. &{tracker} (adds the selected token to the turn order)
    var roll = function (label, base, stat, extra) {
      var attr = sheetAttr(stat), known = stat in { CMB: 1, Fort: 1, Ref: 1, Will: 1, Init: 1 } || SKILLS.indexOf(attr) >= 0;
      var type = stat === 'Init' ? 'initiative' : /^(Fort|Ref|Will)$/.test(stat) ? 'save' : stat === 'CMB' ? 'attack' : 'skill';
      var name = { Fort: 'Fortitude', Ref: 'Reflex', Will: 'Will', Init: 'Initiative', CMB: 'Combat Maneuver' }[stat] || label;
      return link(label + ' ' + sgn(base), T([['name', name], ['type', type],
        ['roll', '[[1d20' + sgn(base) + (known ? '+' + A(attr) : '') + '+' + A(conditionAttr(stat)) + (extra || '') + ']]']]));
    };
    // melee_bonus / ranged_bonus are the sheet's buff fields ("+1 to melee"); unlike melee_mod they exist on a new
    // sheet. A Str / Dex buff adds half of itself (the change to the modifier, from a blank sheet's 10).
    var atkMod = function (ranged) {
      return '+' + A(ranged ? 'ranged_bonus' : 'melee_bonus') + '+' + A('attack_bonus') + '+' + A('attack_condition') +
        '+floor(' + A(ranged ? 'dexterity_bonus' : 'strength_bonus') + '/2)';
    };
    // how much of the Str modifier an attack's damage carries: the stat block's damage bonus tells two-handed (x1.5)
    // and secondary natural attacks (x0.5) from the rest; anything else counts it once
    var strScore = /\bStr (\d+)/.exec(m.abilities || ''), strMod = strScore ? Math.floor(strScore[1] / 2) - 5 : null;
    var strDamage = function (a) {
      if (/ranged/i.test(a.kind)) return '';
      if (strMod > 1 && a.mod === Math.floor(strMod * 1.5)) return '+' + A('strength_oneandahalf_mod');
      if (strMod > 1 && a.mod === Math.floor(strMod / 2)) return '+' + A('strength_half_mod');
      return '+floor(' + A('strength_bonus') + '/2)';
    };

    // one weapon attack at one bonus, as template fields. i: '' for a lone attack (the template's damage row), or the
    // row of a full attack ('', 1, 2...: roll, roll1, roll2; the template labels them Attack #1, #2...). The template
    // shows the crit confirmation and crit damage only when the attack roll threatens.
    var attackFields = function (a, bonus, i, full) {
      var ranged = /ranged/i.test(a.kind);
      var atk = sgn(bonus) + atkMod(ranged);
      var cs = 'cs>' + (a.threat || 20);
      var f = [['roll' + i, '[[1d20' + cs + atk + ']]']];
      if (!a.dice) return f;
      f.push(['critconfirm' + i, '[[1d20' + atk + ']]']);
      var dmgBonus = '(' + (a.mod || 0) + '+' + A('damage_bonus') + '+' + A(ranged ? 'ranged_damage_bonus' : 'melee_damage_bonus') + strDamage(a) + ')';
      var critDice = a.dice.replace(/^(\d+)d/, function (_, n) { return (n * a.mult) + 'd'; });
      var dmg = '[[' + a.dice + '+' + dmgBonus + ']]', crit = '[[' + critDice + '+' + a.mult + '*' + dmgBonus + ']]';
      var p = i === '' ? 'rolldmg1' : 'roll' + i + 'dmg1';
      f.push([p, dmg], [p + 'type', full ? a.name : ''], [p + 'crit', crit]);
      if (!full) f.push(['damage', 1], ['dmg1flag', 1], ['dmg1', dmg], ['dmg1crit', crit]);
      return f;
    };
    var critText = function (a) { return a.threat < 20 ? a.threat + '-20/x' + a.mult : 'x' + a.mult; };
    var attackCard = function (a) {
      var ranged = /ranged/i.test(a.kind);
      // no attack roll (swarms): damage only
      if (a.auto) return T([['name', cap(a.name)], ['type', 'attackdamage'], ['damage', 1], ['dmg1flag', 1],
        ['dmg1', '[[' + (a.dice ? a.dice + sgn(a.mod || 0) : '0') + ']]'], ['shownotes', '[[1]]'], ['notes', 'no attack roll' + (a.rider ? '; ' + rollDice(a.rider) : '')]]);
      return T([['name', cap(a.name)], ['type', 'attackdamage'], ['attack', 1], ['atkvs', ranged ? '(Ranged)' : '(Melee)']]
        .concat(attackFields(a, a.bonuses[0], '', false))
        .concat([['shownotes', '[[1]]'], ['notes', [a.dice && critText(a) !== 'x2' ? 'crit ' + critText(a) : '', a.rider ? rollDice(a.rider) : ''].filter(Boolean).join('; ')]]));
    };
    var describe = function (a) {
      return (a.count > 1 ? a.count + ' ' : '') + a.name + ' ' + a.bonuses.map(sgn).join('/') + (a.touch ? ' touch' : '') + ' (' +
        (a.dice ? a.dice + (a.mod ? sgn(a.mod) : '') + (a.threat < 20 ? '/' + a.threat + '–20' : '') + (a.mult > 2 ? '/×' + a.mult : '') : '') +
        (a.rider ? (a.dice ? ' ' : '') + a.rider : '') + ')';
    };
    // a full attack in one card: each iterative bonus and each of "2 claws" is a row; each row's damage names its weapon
    var fullCard = function (group) {
      var f = [['name', 'Full attack'], ['type', 'attackdamage'], ['attack', 1]], n = 0, notes = [];
      group.forEach(function (a) {
        for (var c = 1; c <= (a.count || 1); c++) (a.auto ? [0] : a.bonuses).forEach(function (b) {
          if (a.auto) { notes.push(a.name + ' ' + '[[' + (a.dice ? a.dice + sgn(a.mod || 0) : '0') + ']] (no attack roll)'); return; }
          f = f.concat(attackFields(a, b, n ? n : '', true)); n++;
        });
        var bits = [];
        if (a.dice && critText(a) !== 'x2') bits.push('crit ' + critText(a));
        if (a.rider) bits.push(rollDice(a.rider));
        if (bits.length) notes.push(a.name + ': ' + bits.join('; '));
      });
      if (notes.length) f.push(['shownotes', '[[1]]'], ['notes', notes.join(' · ')]);
      return T(f);
    };
    var g = attackGroups(m), attackLines = [];
    ['melee', 'ranged'].forEach(function (kind) {
      g[kind].forEach(function (group, gi) {
        var singles = group.map(function (a) { return link(a.name, attackCard(a)); });
        var many = group.length > 1 || group.some(function (a) { return (a.count || 1) > 1 || a.bonuses.length > 1; });
        attackLines.push((gi ? 'or ' : '') + '<i>' + kind + '</i> ' + singles.join(', ') +
          (many ? ' · ' + link('Full attack', fullCard(group)) : '') +
          ' <small>' + esc(group.map(describe).join(', ')) + '</small>');
      });
    });
    var saves = Object.keys(m.saves).map(function (k) { return roll(k, m.saves[k], k); });
    var checks = Object.keys(m.checks || {}).map(function (k) { return roll(k, m.checks[k], k); });

    // spells: a spell card with DC, save, damage, healing, effect and duration; rays roll a ranged touch attack per ray
    // and touch spells a melee touch attack; the arrow opens the spell's page
    var spellButton = function (s, touch) {
      var name = cap(s.name), effect = [];
      var f = [['name', name], ['type', (s.touch || (s.melee && m.meleeTouch != null)) ? 'attackdamage' : 'spell']];
      if (s.touch) {
        f.push(['attack', 1], ['atkvs', '(Ranged touch)']);
        for (var i = 0; i < (s.rays || 1); i++) {
          var k = i ? i : '', atk = sgn(touch) + atkMod(true);
          f.push(['roll' + k, '[[1d20' + atk + ']]'], ['critconfirm' + k, '[[1d20' + atk + ']]']);
          if (s.damage) f.push([i ? 'roll' + i + 'dmg1' : 'rolldmg1', '[[' + s.damage + ']]']);
        }
        if (s.damage && !(s.rays > 1)) f.push(['damage', 1], ['dmg1flag', 1], ['dmg1', '[[' + s.damage + ']]']);
      } else if (s.melee && m.meleeTouch != null) {
        f.push(['attack', 1], ['atkvs', '(Melee touch)'], ['roll', '[[1d20' + sgn(m.meleeTouch) + atkMod(false) + ']]'], ['critconfirm', '[[1d20' + sgn(m.meleeTouch) + atkMod(false) + ']]']);
      }
      if (s.dc) f.push(['save', 1], ['savedc', '[[' + s.dc + ']]'], ['saveeffect', s.save || '']);
      else if (s.save) effect.push(s.save);
      if (s.damage && !s.touch) f.push(['damage', 1], ['dmg1flag', 1], ['dmg1', '[[' + s.damage + ']]'], ['dmg1type', s.damageLabel || '']);
      if (s.heal) {
        if (s.damage) effect.push('heals [[' + s.heal + ']]');
        else f.push(['damage', 1], ['dmg1flag', 1], ['dmg1', '[[' + s.heal + ']]'], ['dmg1type', 'healing']);
      }
      if (s.note) effect.push(/^\d+$/.test(s.note) ? 'prepared ' + s.note + ' times' : rollDice(s.note));
      if (s.effect) effect.push(s.effect); // dice in it are already [[rolls]]
      if (effect.length) f.push(['effect', effect.join('; ')]);
      if (s.duration) f.push(['duration', s.duration]);
      var slug = s.page || (s.page === undefined && m.attacks ? s.name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '');
      return link(s.name, T(f)) + (slug && SPELLS ? ' <a href="' + esc(SPELLS + slug + '/') + '">↗</a>' : '');
    };
    var spellRows = (m.spells || []).map(function (b) {
      var head = [b.cl ? esc('CL ' + b.cl) : '', b.concentration != null ? link('Concentration ' + sgn(b.concentration),
        T([['name', 'Concentration'], ['type', 'save'], ['roll', '[[1d20' + sgn(b.concentration) + ']]']])) : '',
        b.note ? esc(b.note) : ''].filter(Boolean).join(' &nbsp; ');
      return row(b.title, head + b.levels.map(function (l, i) {
        return (head || i ? '<br>' : '') + '<b>' + esc(l.label) + ':</b> ' + l.spells.map(function (s) { return spellButton(s, m.rangedTouch); }).join(', ');
      }).join(''));
    });
    var abilityCard = function (name, desc) { return T([['name', name], ['type', 'feat'], ['descflag', 1], ['desc', desc]]); };
    var showRow = function (label, name, text) { return row(label, link('Show', abilityCard(name, rollDice(text))) + ' ' + esc(text)); };
    // special attacks: one button each, so using one (channel energy, a breath weapon) does not show the players the rest
    var specialAttackRow = function (text) {
      var parts = [], depth = 0, cur = '';
      for (var i = 0; i < text.length; i++) {
        var c = text.charAt(i);
        if (c === '(' || c === '[') depth++;
        if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
        if (depth === 0 && (c === ',' || c === ';')) { if (cur.trim()) parts.push(cur.trim()); cur = ''; continue; }
        cur += c;
      }
      if (cur.trim()) parts.push(cur.trim());
      // the card's title is the entry's name ("Channel negative energy"); its text below, with the dice rolled
      return row('Special Attacks', parts.map(function (p) {
        var title = cap(p.split(/\s+(?=\(|\d|\+)/)[0]);
        return link(p, abilityCard(title, rollDice(cap(p))));
      }).join(', '));
    };
    var specialRows = (m.special || []).map(function (s) {
      var label = s.name + (s.type ? ' (' + s.type + ')' : '');
      var rolls = (s.rolls || []).map(function (r) { return r[0] + ' [[' + r[1] + ']]'; });
      if (rolls.length) return row(label, link('Show', abilityCard(label, s.text + ' - ' + rolls.join(', '))) + ' ' + esc(s.text));
      return showRow(label, label, s.text);
    });

    return '<h3>' + esc(m.name + (m.cr ? ' (CR ' + m.cr + ')' : '')) + '</h3>' +
      (m.line ? '<p><i>' + esc(m.line) + '</i></p>' : '') +
      '<table>' +
      (m.aura ? row('Aura', esc(m.aura)) : '') +
      row('AC', esc(m.ac)) + row('hp', esc(m.hp)) + row('Speed', esc(m.speed)) +
      (m.defense ? row('Defense', esc(m.defense)) : '') +
      (attackLines.length ? row('Attacks', attackLines.join('<br>')) : '') +
      (m.specialAttacks ? specialAttackRow(m.specialAttacks) : '') +
      row('Rolls', [roll('Init', m.init, 'Init', ' &{tracker}')].concat(saves).join(' &nbsp; ') + (m.saveNote ? ' <small>' + esc(m.saveNote) + '</small>' : '')) +
      (checks.length ? row('Checks', checks.join(' &nbsp; ')) : '') +
      spellRows.join('') + specialRows.join('') +
      buffRow(m, g) +
      (m.abilities ? row('Stats', esc(m.abilities + (m.combat ? '; ' + m.combat : ''))) : '') +
      (m.feats ? row('Feats', esc(m.feats)) : '') +
      (m.senses ? row('Senses', esc(m.senses)) : '') +
      (m.languages ? row('Languages', esc(m.languages)) : '') +
      (m.sq ? row('SQ', esc(m.sq)) : '') +
      (m.gear ? row('Gear', esc(m.gear)) : '') +
      '</table>';
  }

  // ---------- buffs ----------
  // What the creature's own modes and buff spells do, in the words of the Pathfinder by Roll20 sheet's Buffs box (one
  // modifier per line), to copy into a Buff on its sheet: the buttons then add it (see the top of this file).
  // Class levels come from the stat block line ("human barbarian 7"); a monster with the feature and no class uses its
  // Hit Dice. Spells bring theirs from tools/spell-rolls.js (s.buff, at the block's caster level).
  function buffList(m, g) {
    var out = [], seen = {};
    var add = function (name, lines, note) { if (lines.length && !seen[name.toLowerCase()]) { seen[name.toLowerCase()] = 1; out.push({ name: name, lines: lines, note: note || '' }); } };
    var line = String(m.line || '').toLowerCase();
    var hdMatch = /\((\d+)\s*(?:HD|d\d+)/i.exec(m.hp || ''), HD = hdMatch ? +hdMatch[1] : 1;
    var level = function (re) { var x = new RegExp('\\b(?:' + re + ')\\b[^\\d/;]*?(\\d+)').exec(line); return x ? +x[1] : 0; };
    var score = function (k) { var x = new RegExp('\\b' + k + ' (\\d+)').exec(m.abilities || ''); return x ? Math.floor(x[1] / 2) - 5 : 0; };
    var text = [m.specialAttacks || '', (m.special || []).map(function (s) { return s.name; }).join(', '), m.sq || '', m.feats || ''].join(', ').toLowerCase();
    var babMatch = /\bBAB ([+-]?\d+)/.exec((m.abilities || '') + ' ' + (m.combat || '')), bab = babMatch ? +babMatch[1] : 0;
    var hasMelee = g.melee.length > 0, hasRanged = g.ranged.length > 0;

    var bloodL = level('bloodrager'), skaldL = level('skald'), unchL = level('unchained barbarian|barbarian \\(unchained\\)');
    var barbL = unchL ? 0 : level('barbarian');
    if (!barbL && !unchL && !bloodL && /(^|[^a-z])rage\b/.test(text.replace(/bloodrage|raging song|rage powers?/g, ''))) barbL = HD;
    if (unchL) {
      var u = unchL >= 20 ? 4 : unchL >= 11 ? 3 : 2;
      add('Rage', ['+' + u + ' morale to melee', '+' + u + ' morale to melee damage', '+' + u + ' morale to will', '-2 to AC', '+' + u * HD + ' to hp']);
    }
    [['Rage', barbL], ['Bloodrage', bloodL]].forEach(function (r) {
      if (!r[1]) return;
      var s = r[1] >= 20 ? 8 : r[1] >= 11 ? 6 : 4;
      add(r[0], ['+' + s + ' morale to str', '+' + s + ' morale to con', '+' + s / 2 + ' morale to will', '-2 to AC', '+' + s / 2 * HD + ' to hp'],
        'the last line is the Con bonus\'s hit points');
    });
    if (skaldL || /raging song|inspired rage/.test(text)) {
      var sl = skaldL || HD, ss = sl >= 16 ? 6 : sl >= 8 ? 4 : 2;
      add('Inspired rage', ['+' + ss + ' morale to str', '+' + ss + ' morale to con', '+' + (1 + Math.floor(sl / 4)) + ' morale to will', '-1 to AC', '+' + ss / 2 * HD + ' to hp']);
    }
    var bardL = level('bard');
    if (bardL || /inspire courage/.test(text)) {
      var ic = Math.min(4, 1 + Math.floor(((bardL || HD) + 1) / 6));
      add('Inspire courage', ['+' + ic + ' competence to attack', '+' + ic + ' competence to damage']);
    }
    var palL = level('paladin|antipaladin'), smite = /smite (evil|good|chaos|law)/.exec(text);
    if (palL || smite) {
      var cha = Math.max(0, score('Cha')), sL = palL || HD;
      add(smite ? 'Smite ' + smite[1] : 'Smite', (cha ? ['+' + cha + ' to attack'] : []).concat(['+' + sL + ' to damage'], cha ? ['+' + cha + ' deflection to AC'] : []),
        'only against the smite\'s target');
    }
    (m.special || []).forEach(function (s) {
      if (!/^mutagen/i.test(s.name)) return;
      var t = s.text || '', up = /\+(\d+) (Str|Dex|Con)\b/.exec(t), nat = /\+(\d+) natural armor/.exec(t), down = /[–-](\d+) (Int|Wis|Cha)\b/.exec(t);
      add('Mutagen', [up ? '+' + up[1] + ' alchemical to ' + up[2].toLowerCase() : '', nat ? '+' + nat[1] + ' natural to AC' : '',
        down ? '-' + down[1] + ' alchemical to ' + down[2].toLowerCase() : ''].filter(Boolean));
    });
    // Power Attack and Deadly Aim need no feat (house rule); Combat Expertise only when the creature has it
    var pa = 1 + Math.floor(Math.max(bab, 0) / 4);
    if (hasMelee && bab >= 1) add('Power Attack', ['-' + pa + ' to melee', '-' + pa + ' to cmb', '+' + 2 * pa + ' to melee damage'], 'half again with a two-handed weapon, half with a secondary natural attack');
    if (hasRanged && bab >= 1) add('Deadly Aim', ['-' + pa + ' to ranged', '+' + 2 * pa + ' to ranged damage']);
    if (/combat expertise/.test(text) && bab >= 1) add('Combat Expertise', ['-' + pa + ' to melee', '-' + pa + ' to cmb', '+' + pa + ' dodge to AC']);
    (m.spells || []).forEach(function (b) { b.levels.forEach(function (l) { l.spells.forEach(function (s) {
      if (s.buff && s.buff.length) add(s.name.charAt(0).toUpperCase() + s.name.slice(1), s.buff, 'CL ' + b.cl);
    }); }); });
    return out;
  }
  function buffRow(m, g) {
    var list = buffList(m, g);
    if (!list.length) return '';
    return '<tr><td><b>Buffs</b><br><small>copy into a Buff on the sheet</small></td><td>' + list.map(function (b) {
      return '<b>' + esc(b.name) + '</b>' + (b.note ? ' <small>(' + esc(b.note) + ')</small>' : '') + '<br>' + b.lines.map(esc).join('<br>');
    }).join('<br><br>') + '</td></tr>';
  }

  function copyHtml(html, plain, btn) {
    var handler = function (e) { e.clipboardData.setData('text/html', html); e.clipboardData.setData('text/plain', plain); e.preventDefault(); };
    document.addEventListener('copy', handler);
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    document.removeEventListener('copy', handler);
    var t = btn.textContent; btn.textContent = ok ? 'Copied!' : 'Copy failed'; setTimeout(function () { btn.textContent = t; }, 1500);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  function build(box) {
    // data-r20 attribute (generated pages) or a <script class="r20-data"> inside the box (hand-written pages)
    var script = box.querySelector('script.r20-data');
    var raw = box.getAttribute('data-r20') || (script && script.textContent); if (!raw) return;
    var m; try { m = JSON.parse(raw); } catch (e) { return; }
    var wrap = el('details', 'r20'); wrap.appendChild(el('summary', null, 'Roll20'));
    var ol = el('ol', 'r20-steps');
    [ 'In the Roll20 Journal, create a character with any name and, when Roll20 asks how to create it, choose Edit Sheet Directly (Pathfinder by Roll20 sheet, left blank). Link its token to it.',
      'Click Copy for Bio & Info.',
      'In Roll20, open the character, click Edit, click inside the Bio & Info box and press Ctrl+V. Save Changes.',
      'Select the creature\'s token and click the buttons in its Bio & Info tab: each attack, save and check rolls in chat, with the buffs and conditions set on the selected token\'s sheet. Init also adds the token to the turn order.'
    ].forEach(function (s) { ol.appendChild(el('li', null, s)); });
    wrap.appendChild(ol);
    var row = el('div', 'r20-row');
    var label = el('label', 'r20-hint', 'Character name (optional): ');
    // empty: rolls read the selected token's sheet (@{selected|...}), so the Roll20 name does not matter
    var input = el('input', 'r20-name'); input.type = 'text'; input.value = ''; input.placeholder = 'selected token'; label.appendChild(input);
    var b = el('button', 'md-button r20-btn', 'Copy for Bio & Info'); b.type = 'button';
    b.addEventListener('click', function () {
      var who = input.value.replace(/[()|]/g, '').replace(/\s+/g, ' ').trim() || 'selected';
      copyHtml(bioHtml(m, who), m.name + ' (CR ' + m.cr + ')', b);
    });
    row.appendChild(b); row.appendChild(label);
    wrap.appendChild(row);
    wrap.appendChild(el('p', 'r20-sub', 'With the name left empty, the buttons read the sheet of whichever token is selected; with no token selected Roll20 warns and rolls the base numbers. Type a name only to tie the buttons to one Roll20 character, so they work without selecting a token.'));
    box.appendChild(wrap);
  }
  // the Enemy Builder (tools/enemy-builder.md) copies its creature with these
  window.canefinderRoll20 = { bioHtml: bioHtml, copyHtml: copyHtml };
  function start() { document.querySelectorAll('.r20-export').forEach(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
