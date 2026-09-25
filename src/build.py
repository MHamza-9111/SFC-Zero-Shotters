#!/usr/bin/env python3
"""Build DineIQ Intelligence Suite: concat parts -> single self-contained HTML."""
import pathlib, re, sys

SRC = pathlib.Path(__file__).parent
ROOT = SRC.parent
OUT_SUITE = ROOT / "dineiq-intelligence-suite.html"
OUT_INDEX = ROOT / "index.html"
OUT_TEMPLATE = ROOT / "templates" / "index.html"

PARTS_HTML_HEAD = ["01_head.html", "02_shell.html"]
PARTS_JS = [
    "03_data.js", "04_charts.js", "05_views_core.js", "06_views_ops.js",
    "07_views_risk.js", "08_views_models.js", "09_views_admin.js", "10_app.js",
]

def main():
    chunks = []
    for p in PARTS_HTML_HEAD:
        chunks.append((SRC / p).read_text(encoding="utf-8"))
    for p in PARTS_JS:
        body = (SRC / p).read_text(encoding="utf-8")
        chunks.append("<script>\n/* ===== %s ===== */\n%s\n</script>\n" % (p, body))
    chunks.append((SRC / "99_foot.html").read_text(encoding="utf-8"))
    html = "".join(chunks)
    
    # Sanity check
    assert "<<<" not in html, "unresolved placeholder"
    
    OUT_SUITE.write_text(html, encoding="utf-8")
    OUT_INDEX.write_text(html, encoding="utf-8")
    
    OUT_TEMPLATE.parent.mkdir(parents=True, exist_ok=True)
    OUT_TEMPLATE.write_text(html, encoding="utf-8")
    
    kb = len(html) / 1024
    print(f"built {OUT_SUITE}  ({kb:.1f} KB, {html.count(chr(10))} lines)")
    print(f"built {OUT_INDEX}")
    print(f"built {OUT_TEMPLATE}")

if __name__ == "__main__":
    main()
