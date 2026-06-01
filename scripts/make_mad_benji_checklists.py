#!/usr/bin/env python3
"""Build Mad Benji checklists from the already-parsed Training Manual modules.
Picks the procedural (opening/closing/cleaning/prep) modules and flattens their
section items into tickable checklists."""
import json, re

SRC = "/Users/mac/Projects/MyMorAdmin/scripts/content/mad-benji-training.json"
OUT = "/Users/mac/Projects/MyMorAdmin/scripts/content/mad-benji-checklists.json"

# module key -> (checklist key, title, type)
MAP = [
    ("mb-back-of-house-opening", "mb-boh-opening-cl", "BOH Opening — Mad Benji", "Opening"),
    ("mb-back-of-house-closing", "mb-boh-closing-cl", "BOH Closing — Mad Benji", "Closing"),
    ("mb-boh-cleaning",          "mb-boh-cleaning-cl", "BOH Cleaning — Mad Benji", "Cleaning"),
    ("mb-front-of-house-opening","mb-foh-opening-cl", "FOH Opening — Mad Benji", "Opening"),
    ("mb-front-of-house-closing","mb-foh-closing-cl", "FOH Closing — Mad Benji", "Closing"),
    ("mb-front-of-house-prep",   "mb-foh-prep-cl",    "FOH Prep — Mad Benji", "Prep"),
]

mods = {m["key"]: m for m in json.load(open(SRC))["modules"]}
checklists = []
for mkey, ckey, title, ctype in MAP:
    m = mods.get(mkey)
    if not m:
        print("  ! missing module", mkey); continue
    items = []
    multi = len(m["steps"]) > 1
    for sec in m["steps"]:
        for it in sec["items"]:
            it = re.sub(r"^[-–—]\s*", "", it).strip()
            # for multi-section modules (e.g. BOH closing), prefix the station/area
            if multi and sec["heading"] and sec["heading"].lower() not in ("procedure",):
                it = f"[{sec['heading']}] {it}"
            items.append(it)
    checklists.append({"key": ckey, "title": title, "type": ctype, "sub": "Daily", "days": [], "items": items})
    print(f"  {title} [{ctype}] — {len(items)} items")

json.dump({"sourceTitle": "Training Manual.docx (Mad Benji)", "venues": ["mad-benji"], "checklists": checklists},
          open(OUT, "w"), ensure_ascii=False, indent=2)
print("wrote", OUT)
