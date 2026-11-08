"""Shrinks the search index after the site is built.

The full index held the whole text of every section (about 35 MB), and browsers ran out of memory
loading it. Each section now keeps its title and only the start of its text, which is enough to
find spells, feats, classes and rules by name, and makes the index several times smaller.
"""
import json
import os
import re

MAX_CHARS = 150
TAG = re.compile(r"<[^>]+>")
SPACE = re.compile(r"\s+")


def _short(text):
    plain = SPACE.sub(" ", TAG.sub(" ", text or "")).strip()
    if len(plain) <= MAX_CHARS:
        return plain
    cut = plain[:MAX_CHARS]
    space = cut.rfind(" ")
    if space > MAX_CHARS // 2:
        cut = cut[:space]
    return cut + "…"


def on_post_build(config, **kwargs):
    path = os.path.join(config["site_dir"], "search", "search_index.json")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        index = json.load(f)
    for doc in index.get("docs", []):
        doc["text"] = _short(doc.get("text", ""))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
