"""Renders the class feature lists of the Build Your Own Class subsystems (Star Wars, Chakra, Superheroes).

Every listed class feature is written once, in docs/campaign-systems/class-features/ (one file per class,
see the README there). A role page asks for its list with a marker:

    <!-- class-features: warrior -->

and this hook replaces it with the list for that role in that subsystem, by level band and price. Lines
between the marker and <!-- /class-features --> are features only that page lists, in the same format
without the role ("- [Name](link): 1–8 common"); they are merged into the list.

tools/class-features.js reads the same files for the Enemy Builders and the Class Feature Search.
"""
import os
import re
import unicodedata

SOURCE = os.path.join("campaign-systems", "class-features")
ROLES = ("warrior", "specialist", "caster")
BANDS = ("1–8", "9–15", "16–20")
TIERS = (("iconic", "Iconic"), ("op", "Overpowered (OP)"), ("common", "Common"), ("weak", "Weak"))
TIER_KEYS = {k for k, _ in TIERS}

ITEM = re.compile(r"^- (\[[^\]]+\]\([^)]+\))\s*:\s*(.+)$")
NAME = re.compile(r"^\[([^\]]+)\]")
PLACE = re.compile(r"^(?:([a-z-]+)/)?(?:(warrior|specialist|caster)\s+)?(\d+)\s*[–-]\s*(\d+)\s+(iconic|op|common|weak)$")
MARKER = re.compile(r"^<!-- class-features: ([a-z-]+) -->[ \t]*\n(?:((?:(?!<!--).*\n)*?)<!-- /class-features -->[ \t]*\n?)?", re.M)

_features = None


def fold(s):
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().replace("’", "").replace("'", "")


def parse(text, where, role=None):
    """Feature lines -> [{link, name, note, places: [(system, role, band, tier)]}]. An indented line is a note."""
    out = []
    for n, line in enumerate(text.split("\n"), 1):
        m = ITEM.match(line)
        if m:
            places = []
            for p in m.group(2).split(","):
                q = PLACE.match(p.strip())
                if not q or not (q.group(2) or role):
                    raise ValueError(f"{where}:{n}: cannot read the placement “{p.strip()}”")
                band = q.group(3) + "–" + q.group(4)
                if band not in BANDS:
                    raise ValueError(f"{where}:{n}: unknown level band “{band}” (use 1–8, 9–15 or 16–20)")
                places.append((q.group(1), q.group(2) or role, band, q.group(5)))
            out.append({"link": m.group(1), "name": NAME.match(m.group(1)).group(1), "note": None, "places": places})
        elif line.startswith(("    ", "\t")) and line.strip() and out:
            out[-1]["note"] = line.strip()
    return out


def load(docs_dir):
    folder = os.path.join(docs_dir, SOURCE)
    feats = []
    for f in sorted(os.listdir(folder)):
        if f.endswith(".md") and f.lower() != "readme.md":
            with open(os.path.join(folder, f), encoding="utf-8") as fh:
                text = fh.read()
            here = parse(text, os.path.join(SOURCE, f))
            # the file's heading is the class the features come from (generic.md has none to show)
            heading = re.search(r"^# (.+)$", text, re.M)
            for feat in here:
                feat["cls"] = heading.group(1).strip() if heading and f != "generic.md" else ""
            feats += here
    return feats


def labelled(f):
    """The feature's link with its class added to the name: "Adrenaline Rush (Darechaser)", and for an archetype
    feature, inside its archetype's parentheses: "Animal Companion (Wild Child, Brawler)". Left as it is when the
    name already ends a parenthesis with the class ("Bonus Feat (Cavalier)", "Lifeblood (Blood Alchemist)")."""
    cls = f.get("cls")
    if not cls:
        return f["link"]
    # "Shifter (Ultimate Wilderness)" reads badly inside parentheses
    cls = re.sub(r"^(.+) \((.+)\)$", r"\2 \1", cls)
    name = f["name"]
    if re.search(r"(^|[\s(,])" + re.escape(cls) + r"\s*[),]", name, re.I):
        return f["link"]
    # merge only into parentheses that name the archetype the link points to ("(Wild Child)" -> #wild-child)
    last = re.search(r"\(([^()]+)\)$", name)
    anchor = re.search(r"#([^)\s\"]+)", f["link"])
    slug = lambda t: re.sub(r"[-\s]+", "-", re.sub(r"[^\w\s-]", "", fold(t))).strip("-")
    if last and anchor and slug(last.group(1)) == anchor.group(1):
        new = name[:-1] + ", " + cls + ")"
    else:
        new = name + " (" + cls + ")"
    return "[" + new + "]" + f["link"][len(name) + 2:]


def render(feats, system, role):
    lines = []
    for band in BANDS:
        block = []
        for tier, label in TIERS:
            here = [f for f in feats if any((s is None or s == system) and r == role and b == band and t == tier for s, r, b, t in f["places"])]
            if not here:
                continue
            here.sort(key=lambda f: (fold(f["name"]), f["link"]))
            block += ["**" + label + ":** " + ", ".join(labelled(f) for f in here), ""]
            block += [f["note"] + "\n" for f in here if f["note"]]
        if block:
            lines += ["## Levels " + band, ""] + block
    return "\n".join(lines)


def on_pre_build(config, **kwargs):
    global _features
    _features = load(config["docs_dir"])


def on_page_markdown(markdown, page, config, files, **kwargs):
    if "<!-- class-features:" not in markdown:
        return markdown
    parts = page.file.src_uri.split("/")
    system = parts[1] if len(parts) > 2 and parts[0] == "campaign-systems" else None

    def sub(m):
        role = m.group(1)
        if role not in ROLES:
            raise ValueError(f"{page.file.src_uri}: unknown role “{role}” (use {', '.join(ROLES)})")
        extra = parse(m.group(2) or "", page.file.src_uri, role)
        for f in extra:
            f["places"] = [(system, r, b, t) for _, r, b, t in f["places"]]
        return render(_features + extra, system, role) + "\n"

    return MARKER.sub(sub, markdown)
