"""Shrinks the search index after the site is built.

The full index held the whole text of every section (about 35 MB), and browsers ran out of memory
loading it. Each section now keeps its title and only the start of its text, which is enough to
find spells, feats, classes and rules by name, and makes the index several times smaller.
"""
import json
import os
import re
import shutil

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


WORKER = re.compile(r'("search":\s*")([^"]*?)assets/javascripts/workers/search\.[0-9a-f]+\.min\.js"')


def on_post_page(output, page, config, **kwargs):
    """Points the search box to the wiki's own search worker (docs/javascripts/canefinder-search.js).

    It ranks the exact name first ("Fireball" before "Controlled Fireball"), then names that start
    with the search, then names holding every word, and needs no index to be built in the browser.
    """
    return WORKER.sub(lambda m: m.group(1) + m.group(2) + 'javascripts/canefinder-search.js"', output)


def on_post_build(config, **kwargs):
    path = os.path.join(config["site_dir"], "search", "search_index.json")
    if not os.path.exists(path):
        return
    # The Deep Search page needs the whole text: keep an untrimmed copy for tools/build-fulltext.js,
    # which splits it into small files after the build and deletes the copy.
    shutil.copyfile(path, os.path.join(os.path.dirname(path), "full_index.json"))
    with open(path, encoding="utf-8") as f:
        index = json.load(f)
    for doc in index.get("docs", []):
        doc["text"] = _short(doc.get("text", ""))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
