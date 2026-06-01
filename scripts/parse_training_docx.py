#!/usr/bin/env python3
"""Parse a Mad Kitchen training-manual .docx into the app's training-module
shape and emit JSON:

  { venue, sourceTitle, sourceSubtitle, modules: [
      { key, title, cat, venue, duration, icon, color, mandatory, desc,
        steps: [ {heading, items:[str]} ] } ] }

Each Heading 1 becomes a section. Multi-part headings that share a stem
("Back Of House – Closing – X", "… Customer Service pt.X") are grouped into a
single module with multiple sections, matching the demo's layout. List items
beneath each heading become that section's items (sub-level items prefixed "— ").
Iterates the raw document XML in document order so content nested in content
controls (SDTs) is not skipped.
"""
import sys, json, re, zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
VENUE = sys.argv[2] if len(sys.argv) > 2 else "Mad Benji"

def ptext(p):
    return "".join(t.text or "" for t in p.iter(W + "t"))

def pstyle(p):
    pr = p.find(W + "pPr")
    if pr is None: return ""
    s = pr.find(W + "pStyle")
    return s.get(W + "val") if s is not None else ""

def is_sub(style):
    s = (style or "").lower()
    return s.endswith("2") or "2" in s

def clean(t):
    t = (t or "").replace("☐", "").replace("☑", "").replace("☒", "")  # ballot boxes
    return re.sub(r"\s+", " ", t).strip()

def cat_for(title):
    u = title.upper()
    if "FRONT OF HOUSE" in u or "FOH" in u: return "FOH"
    if "BACK OF HOUSE" in u or "BOH" in u: return "BOH"
    if "MANAGER" in u or "MANAGEMENT" in u: return "Management"
    return "All"

ICONS = {"FOH": "🤝", "BOH": "🍳", "Management": "👑", "All": "🛡️"}
COLORS = {"FOH": "#dcfce7", "BOH": "#fde68a", "Management": "#fce7f3", "All": "#cffafe"}
DASH = re.compile(r"\s[–—-]\s")

def split_heading(title):
    """Return (module_key, section_heading)."""
    if re.search(r"\bpt\.", title, re.I):
        stem = re.split(r"\bpt\.", title, flags=re.I)[0].strip(" –—-")
        part = title.split(".")[-1].strip()
        return stem, "Part " + part
    parts = DASH.split(title)
    if len(parts) >= 3:
        return " – ".join(parts[:-1]).strip(), parts[-1].strip()
    if len(parts) == 2:
        return title.strip(), parts[-1].strip()
    return title.strip(), "Procedure"

def slug(s):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", s.lower().strip()))

def main():
    root = ET.fromstring(zipfile.ZipFile(sys.argv[1]).read("word/document.xml"))
    title = subtitle = None
    modules = {}   # key -> module dict
    order = []     # module keys in first-seen order
    cur_section = None

    for p in root.iter(W + "p"):
        txt = clean(ptext(p))
        if not txt:
            continue
        st = pstyle(p)
        sl = st.lower()
        if sl == "title":
            title = txt; continue
        if "subtitle" in sl:
            subtitle = txt; continue
        if sl.startswith("heading 1") or sl == "heading1":
            mkey, sheading = split_heading(txt)
            if mkey not in modules:
                cat = cat_for(mkey)
                modules[mkey] = {
                    "key": "mb-" + slug(mkey), "title": mkey, "cat": cat, "venue": VENUE,
                    "duration": "30 min", "icon": ICONS[cat], "color": COLORS[cat],
                    "mandatory": bool(re.search(r"open|clos|food saf|hygien|safety|induct", mkey, re.I)),
                    "desc": "", "steps": [],
                }
                order.append(mkey)
            cur_section = {"heading": sheading, "items": []}
            modules[mkey]["steps"].append(cur_section)
            continue
        # any other non-empty line under a heading is an item
        if cur_section is None:
            mkey = "Induction — All Staff"
            modules[mkey] = {"key": "mb-induction-all-staff", "title": mkey, "cat": "All",
                             "venue": VENUE, "duration": "30 min", "icon": ICONS["All"], "color": COLORS["All"],
                             "mandatory": True, "desc": "", "steps": [{"heading": "Procedure", "items": []}]}
            order.append(mkey)
            cur_section = modules[mkey]["steps"][0]
        cur_section["items"].append(("— " if is_sub(st) else "") + txt)

    out = []
    for k in order:
        m = modules[k]
        m["steps"] = [s for s in m["steps"] if s["items"]]
        if not m["steps"]:
            continue
        first = m["steps"][0]["items"][0]
        m["desc"] = first[:120] + ("…" if len(first) > 120 else "")
        out.append(m)

    print(json.dumps({"venue": VENUE, "sourceTitle": title, "sourceSubtitle": subtitle, "modules": out},
                     ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
