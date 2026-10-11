#!/usr/bin/env python3
"""Package only the files needed by Foundry. No npm dependencies ship."""
import json
from pathlib import Path
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "module.json").read_text())
version = manifest["version"]
dist = root / "dist"
dist.mkdir(exist_ok=True)
archive = dist / f"holosuite-token-wardrobe-v{version}.zip"
files = [root / "module.json", root / "README.md", root / "LICENSE", root / "CHANGELOG.md"]
for folder in ["scripts", "styles", "templates", "lang", "assets"]:
    files.extend(p for p in (root / folder).rglob("*") if p.is_file())
for relative in manifest["esmodules"] + manifest["styles"]:
    if not (root / relative).is_file():
        raise SystemExit(f"Missing manifest file: {relative}")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
    for file in sorted(files):
        output.write(file, file.relative_to(root))
shutil.copyfile(root / "module.json", dist / "module.json")
print(archive)
