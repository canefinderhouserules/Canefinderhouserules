// What a spell does at the caster's level, for the Roll20 spell buttons of monster stat blocks (tools/build-monsters.js,
// tools/update-spell-rolls.js): damage and healing dice, scaling bonuses and the duration, worked out at the stat
// block's CL. Formulas are the wiki's own (house versions where it has them: magic missile 1d4+2 per missile, shield +3,
// call lightning up to 6d6, flame blade +1 per level). Fields set on the spell:
//   damage, damageLabel  dice rolled as damage          heal    dice rolled as healing
//   touch, rays          ranged touch attack per ray    melee   melee touch attack
//   effect               text; dice in it become rolls  duration  the spell's duration at that CL
//   buff                 lines for the sheet's Buffs box (BUFF below)
'use strict';
const fs = require('fs');
const path = require('path');
const SPELL_DIR = path.join(__dirname, '..', 'docs', 'magic', 'spells');

const min = Math.min, max = Math.max, fl = Math.floor;
const perCL = (die, cap) => cl => min(cl, cap) + die;
const per2 = (die, cap) => cl => max(1, min(fl(cl / 2), cap)) + die;
const plusCL = (dice, cap) => cl => dice + '+' + min(cl, cap);
const sg = n => (n < 0 ? '' : '+') + n;
// "+1 per four caster levels (maximum +5)"
const every = (k, cap) => cl => max(1, min(fl(cl / k), cap));
const smite = { damage: per2('d8', 5), effect: cl => 'outsiders take [[' + min(cl, 10) + 'd6]] instead' };
const word = { effect: cl => 'on a successful save: [[3d6+' + min(cl, 25) + ']] damage' };

const T = {
  // ---- damage ----
  'fireball': { damage: perCL('d6', 10), label: 'fire damage' },
  'lightning-bolt': { damage: perCL('d6', 10), label: 'electricity damage' },
  'cone-of-cold': { damage: perCL('d6', 15), label: 'cold damage' },
  'burning-hands': { damage: perCL('d4', 5), label: 'fire damage' },
  'shocking-grasp': { damage: perCL('d6', 5), label: 'electricity damage', melee: true, effect: () => '+3 to hit against metal armor or a metal creature' },
  'flame-strike': { damage: perCL('d6', 15) },
  'chain-lightning': { damage: perCL('d6', 20), label: 'electricity damage to the primary target' },
  'horrid-wilting': { damage: perCL('d6', 20), effect: cl => 'water elementals and plants take [[' + min(cl, 20) + 'd8]] instead' },
  'delayed-blast-fireball': { damage: perCL('d6', 20), label: 'fire damage' },
  'fire-storm': { damage: perCL('d6', 20), label: 'fire damage', effect: () => 'on a failed save the target catches fire: [[4d6]] fire damage each round' },
  'polar-ray': { damage: perCL('d6', 25), label: 'cold damage', touch: true, effect: () => '[[1d4]] Dexterity drain' },
  'disintegrate': { damage: cl => min(2 * cl, 40) + 'd6', touch: true, effect: () => 'Fort save: [[5d6]] instead' },
  'searing-light': { damage: per2('d8', 5), touch: true, effect: cl => 'undead take [[' + min(cl, 10) + 'd6]] instead' },
  'vampiric-touch': { damage: per2('d6', 10), melee: true, effect: () => 'you gain the damage dealt as temporary hit points' },
  'chill-touch': { damage: () => '1d6', melee: true, effect: cl => '1 Strength damage (Fort negates); ' + cl + ' touches' },
  'acid-splash': { damage: () => '1d3', label: 'acid damage', touch: true },
  'ray-of-frost': { damage: () => '1d3', label: 'cold damage', touch: true },
  'disrupt-undead': { damage: () => '1d6', label: 'damage to undead', touch: true },
  'produce-flame': { damage: plusCL('1d6', 5), label: 'fire damage', melee: true },
  'flame-blade': { damage: plusCL('1d8', 10), label: 'fire damage', melee: true },
  'inflict-light-wounds': { damage: plusCL('1d8', 5), melee: true },
  'inflict-moderate-wounds': { damage: plusCL('2d8', 10), melee: true },
  'inflict-serious-wounds': { damage: plusCL('3d8', 15), melee: true },
  'inflict-critical-wounds': { damage: plusCL('4d8', 20), melee: true },
  'inflict-light-wounds-mass': { damage: plusCL('1d8', 25) },
  'inflict-moderate-wounds-mass': { damage: plusCL('2d8', 30) },
  'inflict-serious-wounds-mass': { damage: plusCL('3d8', 35) },
  'inflict-critical-wounds-mass': { damage: plusCL('4d8', 40) },
  'magic-missile': { damage: cl => { const n = min(5, 1 + fl((cl - 1) / 2)); return n + 'd4+' + 2 * n; }, label: cl => 'force damage, ' + min(5, 1 + fl((cl - 1) / 2)) + ' missiles' },
  'scorching-ray': { damage: () => '4d6', label: 'fire damage', touch: true, rays: cl => (cl >= 11 ? 3 : cl >= 7 ? 2 : 1) },
  'ray-of-enfeeblement': { damage: cl => '1d6+' + min(fl(cl / 2), 5), label: 'Strength penalty', touch: true },
  'sound-burst': { damage: () => '1d8', label: 'sonic damage', effect: () => 'Fort or stunned 1 for 1 round' },
  'ice-storm': { damage: () => '3d6', label: 'bludgeoning damage', effect: () => 'plus [[2d6]] cold damage' },
  'flaming-sphere': { damage: () => '3d6', label: 'fire damage' },
  'harm': { damage: cl => String(min(10 * cl, 150)), melee: true },
  'finger-of-death': { damage: cl => String(10 * cl), effect: cl => 'Fort save: [[3d6+' + cl + ']] instead' },
  'destruction': { damage: cl => String(10 * cl), effect: () => 'Fort save: [[10d6]] instead' },
  'slay-living': { damage: cl => '12d6+' + cl, melee: true, effect: cl => 'Fort save: [[3d6+' + cl + ']] instead' },
  'wail-of-the-banshee': { damage: cl => String(10 * cl), effect: cl => 'up to ' + cl + ' creatures' },
  'implosion': { damage: cl => String(10 * cl), effect: () => 'one creature each round you concentrate' },
  'call-lightning': { damage: cl => min(6, 3 + max(0, fl((cl - 5) / 2))) + 'd6', label: 'electricity damage per bolt', effect: cl => 'one bolt per round, ' + min(cl, 10) + ' bolts' },
  'call-lightning-storm': { damage: cl => min(9, 5 + max(0, fl((cl - 10) / 2))) + 'd6', label: 'electricity damage per bolt (d10s in a storm)', effect: cl => 'one bolt per round, ' + min(cl, 15) + ' bolts' },
  'unholy-blight': smite, 'holy-smite': smite, 'chaos-hammer': smite, 'orders-wrath': smite,
  'blade-barrier': { damage: perCL('d6', 15) },
  'fire-shield': { effect: cl => 'attackers that hit you take [[1d6+' + min(cl, 15) + ']]' },
  'wall-of-fire': { damage: plusCL('2d6', 20), label: 'fire damage passing through', effect: () => 'heat: [[2d4]] within 10 ft., [[1d4]] within 20 ft.' },
  'wall-of-ice': { effect: cl => 'stepping through: [[1d6+' + cl + ']] cold damage' },
  'spiritual-weapon': { damage: cl => '1d8+' + min(fl(cl / 3), 5), label: 'force damage per hit' },
  'acid-arrow': { damage: () => '2d4', label: 'acid damage', touch: true, effect: cl => fl(cl / 3) ? '[[2d4]] more each round for ' + min(fl(cl / 3), 6) + ' rounds' : '' },
  'phantasmal-killer': { effect: () => 'Fort save: [[3d6]] damage' },
  'weird': { effect: () => 'Fort save: [[3d6]] damage, stunned 1 for 1 round and [[1d4]] Strength damage' },
  'shout': { damage: () => '5d6', label: 'sonic damage', effect: () => 'deafened [[2d6]] rounds' },
  'sunburst': { damage: () => '6d6', effect: cl => 'undead take [[' + min(cl, 25) + 'd6]] instead' },
  'meteor-swarm': { damage: () => '6d6', label: 'fire damage per sphere', effect: () => 'a creature struck by a sphere takes [[2d6]] bludgeoning damage' },
  'acid-fog': { damage: () => '2d6', label: 'acid damage per round' },
  'incendiary-cloud': { damage: () => '6d6', label: 'fire damage per round' },
  'cloudkill': { damage: () => '1d4', label: 'Con damage per round (over 6 HD)' },
  'nightmare': { damage: () => '1d10' },
  'black-tentacles': { effect: cl => 'CMB +' + (cl + 5) + ' ([[1d20+' + (cl + 5) + ']]), grapple damage [[1d6+4]]' },
  'circle-of-death': { effect: cl => 'slays [[' + min(cl, 20) + 'd4]] HD of creatures' },
  'enervation': { touch: true, effect: () => '[[1d4]] temporary negative levels' },
  'energy-drain': { touch: true, effect: () => '[[2d4]] temporary negative levels' },
  'poison': { damage: () => '1d3', label: 'Con damage per round for 6 rounds (Fort each round ends it)', melee: true },
  'touch-of-idiocy': { melee: true, effect: () => '[[1d6]] penalty to Int, Wis and Cha' },
  'touch-of-fatigue': { melee: true }, 'bestow-curse': { melee: true }, 'contagion': { melee: true }, 'ghoul-touch': { melee: true },
  'death-knell': { melee: true, effect: () => 'if it dies: you gain [[1d8]] temporary hp, +2 Str and +1 caster level' },
  'hypnotism': { effect: () => '[[2d4]] HD affected' },
  'hypnotic-pattern': { effect: cl => '[[2d4+' + min(cl, 10) + ']] HD affected' },
  'rusting-grasp': { melee: true, effect: cl => 'ferrous creature: [[3d6+' + min(cl, 15) + ']] damage' },
  // ---- healing ----
  'cure-light-wounds': { heal: plusCL('1d8', 5) },
  'cure-moderate-wounds': { heal: plusCL('2d8', 10) },
  'cure-serious-wounds': { heal: plusCL('3d8', 15) },
  'cure-critical-wounds': { heal: plusCL('4d8', 20) },
  'cure-light-wounds-mass': { heal: plusCL('1d8', 25) },
  'cure-moderate-wounds-mass': { heal: plusCL('2d8', 30) },
  'cure-serious-wounds-mass': { heal: plusCL('3d8', 35) },
  'cure-critical-wounds-mass': { heal: plusCL('4d8', 40) },
  'heal': { heal: cl => String(min(10 * cl, 150)) },
  'heal-mass': { heal: cl => String(min(10 * cl, 250)) },
  'breath-of-life': { heal: plusCL('5d8', 25) },
  'regenerate': { heal: plusCL('4d8', 35) },
  'restoration-lesser': { effect: () => 'cures [[1d4]] ability damage' },
  'aid': { effect: cl => '+1 morale on attacks and saves against fear, [[1d8+' + min(cl, 10) + ']] temporary hp' },
  'false-life': { effect: cl => '[[1d10+' + min(cl, 10) + ']] temporary hp' },
  'virtue': { effect: () => '1 temporary hp' },
  // ---- bonuses at this level ----
  'divine-power': { effect: cl => '+' + max(1, min(fl(cl / 3), 6)) + ' luck on attacks, weapon damage, Str checks and Str skills; ' + cl + ' temporary hp; an extra attack at full BAB in a full attack' },
  'divine-favor': { effect: cl => '+' + max(1, min(fl(cl / 3), 3)) + ' luck on attacks and weapon damage' },
  'shield-of-faith': { effect: cl => '+' + min(2 + fl(cl / 6), 5) + ' deflection to AC' },
  'barkskin': { effect: cl => '+' + min(2 + max(0, fl((cl - 3) / 3)), 5) + ' enhancement to natural armor' },
  'magic-vestment': { effect: cl => '+' + every(4, 5)(cl) + ' enhancement to armor or shield' },
  'magic-weapon-greater': { effect: cl => '+' + every(4, 5)(cl) + ' enhancement on attack and damage' },
  'magic-fang-greater': { effect: cl => '+' + every(4, 5)(cl) + ' enhancement on attack and damage (or +1 to all natural weapons)' },
  'magic-weapon': { effect: () => '+1 enhancement on attack and damage' },
  'magic-fang': { effect: () => '+1 enhancement on attack and damage with one natural weapon' },
  'shillelagh': { effect: () => '+1 enhancement; a Medium club or quarterstaff deals [[2d6+1]]' },
  'magic-stone': { effect: () => '3 stones, +1 on attack, [[1d6+1]] damage each ([[2d6+2]] against undead)' },
  'resist-energy': { effect: cl => 'resist ' + (cl >= 11 ? 30 : cl >= 7 ? 20 : 10) + ' to one energy type' },
  'protection-from-energy': { effect: cl => 'absorbs ' + 12 * min(cl, 10) + ' points of one energy type' },
  'stoneskin': { effect: cl => 'DR 10/adamantine, until it has prevented ' + min(10 * cl, 150) + ' damage' },
  'protection-from-arrows': { effect: cl => 'DR 10/magic against ranged weapons, until it has prevented ' + min(10 * cl, 100) + ' damage' },
  'mirror-image': { effect: cl => '[[{1d4+' + fl(cl / 3) + ', 8}kl1]] images (maximum 8)' },
  'shield': { effect: () => '+3 shield to AC, immune to magic missile' },
  'mage-armor': { effect: () => '+4 armor to AC' },
  'haste': { effect: () => '+1 on attacks, +1 dodge to AC and Reflex, +30 ft. speed, one extra attack in a full attack' },
  'bless': { effect: () => 'allies: +1 on attacks and saves against fear' },
  'bane': { effect: () => 'enemies: -1 on attacks and saves against fear' },
  'prayer': { effect: () => 'allies +1 luck, foes -1, on attacks, weapon damage, saves and skill checks' },
  'heroism': { effect: () => '+2 morale on attacks, saves and skill checks' },
  'good-hope': { effect: () => '+2 morale on saves, attacks, ability and skill checks and weapon damage' },
  'crushing-despair': { effect: () => '-2 on attacks, saves, ability and skill checks and weapon damage' },
  'rage': { effect: () => '+2 morale to Str and Con, +1 on Will saves, -2 AC' },
  'bulls-strength': { effect: () => '+4 enhancement to Strength' },
  'cats-grace': { effect: () => '+4 enhancement to Dexterity' },
  'bears-endurance': { effect: () => '+4 enhancement to Constitution' },
  'eagles-splendor': { effect: () => '+4 enhancement to Charisma' },
  'enlarge-person': { effect: () => '+2 Str, -2 Dex, -1 on attacks and AC, one size larger' },
  'reduce-person': { effect: () => '+2 Dex, -2 Str, +1 on attacks and AC, one size smaller' },
  'righteous-might': { effect: () => '+4 size to Str and Con, -2 Dex, +2 enhancement to natural armor, one size larger' },
  'protection-from-evil': { effect: () => '+2 deflection to AC and +2 resistance on saves against evil creatures' },
  'protection-from-good': { effect: () => '+2 deflection to AC and +2 resistance on saves against good creatures' },
  'protection-from-law': { effect: () => '+2 deflection to AC and +2 resistance on saves against lawful creatures' },
  'protection-from-chaos': { effect: () => '+2 deflection to AC and +2 resistance on saves against chaotic creatures' },
  'magic-circle-against-evil': { effect: () => '+2 deflection to AC and +2 resistance on saves against evil creatures, 10-ft. radius' },
  'magic-circle-against-good': { effect: () => '+2 deflection to AC and +2 resistance on saves against good creatures, 10-ft. radius' },
  'unholy-aura': { effect: () => '+4 deflection to AC, +4 resistance on saves, SR 25 against good; good attackers that hit take [[1d6]] Str damage (Fort negates)' },
  'holy-aura': { effect: () => '+4 deflection to AC, +4 resistance on saves, SR 25 against evil' },
  'shield-other': { effect: () => '+1 deflection to AC and +1 resistance on saves' },
  'foresight': { effect: () => '+2 insight to AC and on Reflex saves; never surprised or flat-footed' },
  'death-ward': { effect: () => '+4 morale on saves against death effects' },
  'mind-blank': { effect: () => '+8 resistance on saves against mind-affecting effects' },
  'true-strike': { effect: () => '+20 insight on the next attack roll' },
  'guidance': { effect: () => '+1 competence on one attack, save or skill check' },
  'resistance': { effect: () => '+1 resistance on saves' },
  'blur': { effect: () => '20% miss chance' },
  'displacement': { effect: () => '50% miss chance' },
  'entropic-shield': { effect: () => '20% miss chance against ranged attacks' },
  'longstrider': { effect: () => '+10 ft. land speed' },
  'expeditious-retreat': { effect: () => '+30 ft. land speed' },
  'fly': { effect: cl => 'fly 60 ft. (good), +' + fl(cl / 2) + ' on Fly checks' },
  'spider-climb': { effect: () => 'climb 20 ft., +8 on Climb checks' },
  'jump': { effect: cl => '+' + (cl >= 9 ? 30 : cl >= 5 ? 20 : 10) + ' on Acrobatics checks to jump' },
  'moment-of-prescience': { effect: cl => '+' + min(cl, 25) + ' insight on one roll or to AC against one attack' },
  'remove-fear': { effect: () => '+4 morale against fear for 10 minutes' },
  'desecrate': { effect: () => 'undead +1 profane on attacks, damage and saves; +3 to negative channel DCs' },
  'invisibility': { effect: () => '+40 on Stealth when still, +20 when moving' },
  // ---- checks ----
  'dispel-magic': { effect: cl => 'dispel check [[1d20+' + cl + ']]' },
  'dispel-magic-greater': { effect: cl => 'dispel check [[1d20+' + cl + ']] (+4 to counterspell), up to ' + max(1, fl(cl / 4)) + ' spells' },
  'break-enchantment': { effect: cl => 'caster level check [[1d20+' + min(cl, 15) + ']]' },
  'remove-curse': { effect: cl => 'caster level check [[1d20+' + cl + ']]' },
  'remove-disease': { effect: cl => 'caster level check [[1d20+' + cl + ']]' },
  'neutralize-poison': { effect: cl => 'caster level check [[1d20+' + cl + ']]' },
  'divination': { effect: cl => min(70 + cl, 90) + '% chance of a correct answer' },
  'augury': { effect: cl => min(70 + cl, 90) + '% chance of a meaningful reply' },
  'spell-turning': { effect: () => '[[1d4+6]] spell levels turned' },
};

// Buff spells: their effect in the words of the Pathfinder by Roll20 sheet's Buffs box ("+4 enhancement to str", one per
// line), at the CL, to copy into the caster's sheet. Tested targets: str..cha, attack, melee, ranged, damage, melee
// damage, ranged damage, cmb, cmd, AC (dodge, deflection, natural, armor, shield...), saves, fort, ref, will, skills,
// init, speed, hp, temp hp. Effects with conditions (only against evil, only fear) are left to the spell's text.
const ability = (k, n, type) => cl => ['+' + n + ' ' + type + ' to ' + k];
const BUFF = {
  'bless': () => ['+1 morale to attack'],
  'prayer': () => ['+1 luck to attack', '+1 luck to damage', '+1 luck to saves', '+1 luck to skills'],
  'heroism': () => ['+2 morale to attack', '+2 morale to saves', '+2 morale to skills'],
  'heroism-greater': cl => ['+4 morale to attack', '+4 morale to saves', '+4 morale to skills', '+' + min(cl, 20) + ' to hp'],
  'good-hope': () => ['+2 morale to attack', '+2 morale to damage', '+2 morale to saves', '+2 morale to skills'],
  'aid': () => ['+1 morale to attack'],
  'divine-favor': cl => { const n = max(1, min(fl(cl / 3), 3)); return ['+' + n + ' luck to attack', '+' + n + ' luck to damage']; },
  'divine-power': cl => { const n = max(1, min(fl(cl / 3), 6)); return ['+' + n + ' luck to attack', '+' + n + ' luck to damage', '+' + cl + ' to hp']; },
  'shield-of-faith': cl => ['+' + min(2 + fl(cl / 6), 5) + ' deflection to AC'],
  'barkskin': cl => ['+' + min(2 + max(0, fl((cl - 3) / 3)), 5) + ' natural to AC'],
  'magic-vestment': cl => ['+' + every(4, 5)(cl) + ' enhancement to AC'],
  'magic-weapon': () => ['+1 enhancement to attack', '+1 enhancement to damage'],
  'magic-weapon-greater': cl => ['+' + every(4, 5)(cl) + ' enhancement to attack', '+' + every(4, 5)(cl) + ' enhancement to damage'],
  'magic-fang': () => ['+1 enhancement to melee', '+1 enhancement to melee damage'],
  'magic-fang-greater': cl => ['+' + every(4, 5)(cl) + ' enhancement to melee', '+' + every(4, 5)(cl) + ' enhancement to melee damage'],
  'shield': () => ['+3 shield to AC'],
  'mage-armor': () => ['+4 armor to AC'],
  'haste': () => ['+1 to attack', '+1 dodge to AC', '+1 dodge to ref', '+30 enhancement to speed'],
  'rage': () => ['+2 morale to str', '+2 morale to con', '+1 morale to will', '-2 to AC'],
  'bulls-strength': ability('str', 4, 'enhancement'), 'bulls-strength-mass': ability('str', 4, 'enhancement'),
  'cats-grace': ability('dex', 4, 'enhancement'), 'cats-grace-mass': ability('dex', 4, 'enhancement'),
  'bears-endurance': ability('con', 4, 'enhancement'), 'bears-endurance-mass': ability('con', 4, 'enhancement'),
  'foxs-cunning': ability('int', 4, 'enhancement'), 'owls-wisdom': ability('wis', 4, 'enhancement'),
  'eagles-splendor': ability('cha', 4, 'enhancement'),
  'enlarge-person': () => ['+2 size to str', '-2 size to dex', '-1 size to attack', '-1 size to AC'],
  'reduce-person': () => ['-2 size to str', '+2 size to dex', '+1 size to attack', '+1 size to AC'],
  'righteous-might': () => ['+4 size to str', '+4 size to con', '-2 size to dex', '+2 natural to AC', '-1 size to attack', '-1 size to AC'],
  'unholy-aura': () => ['+4 deflection to AC', '+4 resistance to saves'],
  'holy-aura': () => ['+4 deflection to AC', '+4 resistance to saves'],
  'shield-other': () => ['+1 deflection to AC', '+1 resistance to saves'],
  'foresight': () => ['+2 insight to AC', '+2 insight to ref'],
  'resistance': () => ['+1 resistance to saves'],
  'true-strike': () => ['+20 insight to attack'],
  'longstrider': () => ['+10 enhancement to speed'],
  'expeditious-retreat': () => ['+30 enhancement to speed'],
  'spider-climb': () => ['+8 racial to climb'],
};
for (const k of ['protection-from-evil', 'protection-from-good', 'protection-from-law', 'protection-from-chaos',
  'magic-circle-against-evil', 'magic-circle-against-good', 'magic-circle-against-law', 'magic-circle-against-chaos'])
  BUFF[k] = () => ['+2 deflection to AC', '+2 resistance to saves'];
// buff spells the damage table above does not list yet
T['heroism-greater'] = T['heroism-greater'] || { effect: cl => '+4 morale on attacks, saves and skill checks, immune to fear, ' + min(cl, 20) + ' temporary hp' };
for (const [k, a] of [['foxs-cunning', 'Intelligence'], ['owls-wisdom', 'Wisdom'], ['bulls-strength-mass', 'Strength'], ['cats-grace-mass', 'Dexterity'], ['bears-endurance-mass', 'Constitution']])
  T[k] = T[k] || { effect: () => '+4 enhancement to ' + a };
for (const k of ['protection-from-law', 'protection-from-chaos', 'magic-circle-against-law', 'magic-circle-against-chaos'])
  T[k] = T[k] || { effect: () => '+2 deflection to AC and +2 resistance on saves against ' + (/law/.test(k) ? 'lawful' : 'chaotic') + ' creatures' + (/circle/.test(k) ? ', 10-ft. radius' : '') };

// "1 min./level (D)" at CL 7 -> "7 min. (D)"; "1 round + 1 round per three levels" -> worked out too
const NUMS = { two: 2, three: 3, four: 4, five: 5, six: 6 };
const durationCache = {};
function durationText(slug) {
  if (!(slug in durationCache)) {
    let d = '';
    try { d = (fs.readFileSync(path.join(SPELL_DIR, slug + '.md'), 'utf8').match(/\*\*Duration\*\*\s*([^\n]*)/) || [])[1] || ''; } catch (e) {}
    durationCache[slug] = d.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '').replace(/\s+$/, '');
  }
  return durationCache[slug];
}
function durationAt(slug, cl) {
  const d = durationText(slug);
  const re = /(\d+)\s*(rounds?|min\.|minutes?|hours?|hr\.|days?|weeks?)\s*(?:\/\s*|per\s+)(?:(\d+|two|three|four|five|six)\s+)?(?:caster\s+)?levels?/gi;
  if (!d.match(re)) return '';
  const at = (all, k, unitText, perText) => {
    const per = perText ? (NUMS[perText.toLowerCase()] || +perText) : 1;
    const n = +k * (per > 1 ? fl(cl / per) : cl);
    let unit = unitText.toLowerCase();
    if (/^min/.test(unit)) unit = 'min.'; else if (/^hr|^hour/.test(unit)) unit = n === 1 ? 'hour' : 'hours';
    else unit = unit.replace(/s$/, '') + (n === 1 ? '' : 's');
    return n + ' ' + unit;
  };
  const out = d.replace(re, at).replace(/^1 round \+ (\d+) rounds?$/, (_, k) => +k ? (1 + +k) + ' rounds' : '1 round');
  return out.replace(/;?\s*see text$/i, '').trim();
}

function spellRoll(s, slug, cl) {
  if (!cl) return;
  const r = T[slug];
  if (r) {
    if (r.damage) s.damage = r.damage(cl);
    if (r.label) s.damageLabel = typeof r.label === 'function' ? r.label(cl) : r.label;
    if (r.heal) s.heal = r.heal(cl);
    if (r.touch) s.touch = true;
    if (r.melee) s.melee = true;
    if (r.rays) s.rays = r.rays(cl);
    const e = r.effect && r.effect(cl);
    if (e) s.effect = e;
  }
  if (BUFF[slug]) s.buff = BUFF[slug](cl);
  const d = durationAt(slug, cl);
  if (d) s.duration = d;
  // metamagic on the stat block line: maximized = top of every die, empowered = half again
  const meta = dice => {
    if (/^maximized\b/i.test(s.name)) return String(dice.split('+').reduce((t, p) => { const x = p.match(/^(\d+)d(\d+)$/); return t + (x ? x[1] * x[2] : +p); }, 0));
    if (/^empowered\b/i.test(s.name)) return 'floor(1.5*(' + dice + '))';
    return dice;
  };
  if (s.damage) s.damage = meta(s.damage);
  if (s.heal) s.heal = meta(s.heal);
}

module.exports = { spellRoll, SPELL_TABLE: T, durationAt };
