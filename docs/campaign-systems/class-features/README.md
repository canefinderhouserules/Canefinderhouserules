# Shared class feature lists

The Star Wars, Chakra (Naruto) and Superhero subsystems use the same Build Your Own Class rules, so they
share one list of the class features each class type can copy. This folder is that list, and the only
place to edit it. It is not published as pages of its own: it is rendered into

| Role         | Star Wars                     | Chakra                                 | Superheroes                       |
|--------------|-------------------------------|----------------------------------------|-----------------------------------|
| `warrior`    | `class-features-warrior.md`   | `class-features-shinobi-warrior.md`    | `class-features-warrior.md`       |
| `specialist` | `class-features-specialist.md`| `class-features-shinobi-specialist.md` | `class-features-specialist.md`    |
| `caster`     | `class-features-consular.md`  | `class-features-jutsu-master.md`       | `class-features-power-master.md`  |

and it feeds the three subsystem Enemy Builders and the Class Feature Search (`node tools/build-starwars-builder.js`).

## Files

One file per class or prestige class whose features are listed (`fighter.md` holds the Fighter and every
Fighter archetype; `dragon-disciple.md` the Dragon Disciple). Generic class features go in `generic.md`.
File order and line order do not matter: the pages are sorted on their own.

The `#` heading is the class name. The role pages add it to every feature from that file, so players see
where it comes from: `Adrenaline Rush (Darechaser)`, and inside an archetype's parentheses
`Animal Companion (Wild Child, Brawler)`. Don't write the class in the feature's name yourself; a name that
already ends with it (`Bonus Feat (Cavalier)`, `Lifeblood (Blood Alchemist)`) is left as it is.

## A feature line

```
- [Armor Training](../../characters/classes/fighter.md#armor-training-ex): warrior 1–8 common
```

- The link is copied as it is into the role pages, which sit at the same depth as this folder, so write it
  the same way (`../../characters/...`). A title such as `"only: free-fighting-style-ex"` or
  `"also: deeds"` still controls the hover preview.
- After the colon, one placement or several separated by commas: the **role** (`warrior`, `specialist` or
  `caster`), the **level band** (`1–8`, `9–15` or `16–20`; a plain `-` works too) and the **price**
  (`iconic`, `op`, `common` or `weak`):

  ```
  - [Grit and Deeds](../../characters/classes/gunslinger.md#grit-ex "also: deeds"): warrior 1–8 op, specialist 1–8 op
  ```

- Prestige class features go 3 levels higher than in their class, as before.
- To move a feature to another price or band, change its placement; to remove it from one role, delete that
  placement (or the whole line).

## Notes

An indented line under a feature is a note. It is printed on every role page that lists the feature, right
after the price line it is in:

```
- [Spirit (Prowler at World’s End)](../../characters/classes/bloodrager-archetypes.md#prowler-at-worlds-end): warrior 1–8 iconic
    *Spirit (Prowler at World’s End)* gives only the Spirit ability: ...
```

## Features of a single subsystem

Put the subsystem's folder name before the role, and the feature shows only on that subsystem's page:

```
- [Some Feature](../../characters/classes/fighter.md#some-feature): star-wars/warrior 1–8 common
```

A role page can also list features of its own, between its marker and a closing marker, in the same format
without the role (the page already says which role it is). They are merged into its list:

```
<!-- class-features: warrior -->
- [Lightsaber Defense](lightsabers.md#lightsaber-defense): 1–8 common
<!-- /class-features -->
```
