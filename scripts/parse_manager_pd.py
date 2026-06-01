#!/usr/bin/env python3
"""Parse a Store Manager Position Description .docx (English, optionally with a
Chinese version) into one training module (cat=Management) with English sections
followed by Chinese sections. Emits training JSON for a single venue."""
import sys, re, json, zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
DL = "/Users/mac/Downloads/"
OUT = "/Users/mac/Projects/MyMorAdmin/scripts/content/"

def has_cjk(s): return bool(re.search(r"[一-鿿]", s))
def clean(s): return re.sub(r"\s+", " ", s).strip()

KNOWN_EN = {"Operation Management", "Staff Management", "Inventory & Cost Control",
            "Sales & Business Performance", "Customer Experience & Brand Management",
            "Administration & Compliance"}
CN_HDR_KW = ["Store Operation", "Staff Management", "Cost Control", "Performance",
             "Brand & Customer Experience", "Administration"]
SKIP_EXACT = {"Position Description", "Key Responsibilities", "窗体顶端", "窗体底端"}

def parse(path):
    root = ET.fromstring(zipfile.ZipFile(DL + path).read("word/document.xml"))
    lines = [clean("".join(t.text or "" for t in p.iter(W + "t"))) for p in root.iter(W + "p")]
    lines = [l for l in lines if l]

    en_secs, cn_secs = [], []
    overview_en = overview_cn = ""
    manager = ""
    cur = None

    for ln in lines:
        if ln in SKIP_EXACT: continue
        if re.match(r"^(Store|Shop) Manager\s*[:：]", ln):
            manager = ln.split(":", 1)[-1].split("：")[-1].strip(); continue
        if re.match(r"^(Mad Benji|Mad Hot Pot|Mad Hotpot)$", ln): continue
        if re.match(r"^(Mad Hot Pot|Mad Benji)\s+Store Manager$", ln): continue
        if ln.startswith("The Store Manager is fully responsible"): overview_en = ln; continue
        if ln.startswith("店长是门店"): overview_cn = ln; continue

        # English header?
        m = re.match(r"^\d+\.\s+(.+)$", ln)
        if (m and not has_cjk(ln)) or (ln in KNOWN_EN):
            cur = {"heading": m.group(1).strip() if m else ln, "items": []}
            en_secs.append(cur); continue
        # Chinese header?
        if has_cjk(ln) and any(k in ln for k in CN_HDR_KW):
            heading = "🇨🇳 " + re.sub(r"^[一二三四五六七八九十]+[，,、]\s*", "", ln)
            cur = {"heading": heading, "items": []}
            cn_secs.append(cur); continue
        # otherwise item
        if cur is not None:
            cur["items"].append(re.sub(r"^[-–•]\s*", "", ln).strip())

    en_secs = [s for s in en_secs if s["items"]]
    cn_secs = [s for s in cn_secs if s["items"]]
    return overview_en, overview_cn, manager, en_secs + cn_secs

def main():
    path, venue = sys.argv[1], sys.argv[2]
    ov_en, ov_cn, manager, steps = parse(path)
    desc = ov_en or ov_cn
    if manager: desc = f"Current manager: {manager}. " + desc
    mod = {
        "key": "mgr-store-manager-pd", "title": "Store Manager — Position Description",
        "cat": "Management", "duration": "45 min", "icon": "👑", "color": "#fce7f3",
        "mandatory": True, "desc": desc, "steps": steps,
    }
    out = {"sourceTitle": path, "venues": [venue], "modules": [mod]}
    fname = OUT + f"mgr-pd-{venue}-training.json"
    json.dump(out, open(fname, "w"), ensure_ascii=False, indent=2)
    en = sum(1 for s in steps if not s["heading"].startswith("🇨🇳"))
    cn = len(steps) - en
    print(f"{path} → venue {venue}: {en} EN sections, {cn} CN sections, manager={manager}")

if __name__ == "__main__":
    main()
