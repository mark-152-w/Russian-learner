#!/usr/bin/env bash
# Download pinned source datasets into tools/raw/ (gitignored, except tools/raw/tatoeba/).
set -euo pipefail
cd "$(dirname "$0")"
RAW=raw
mkdir -p "$RAW"

OR_COMMIT=$(python3 -c "import json;print(json.load(open('sources.json'))['openrussian']['commit'])")
if [ ! -d "$RAW/openrussian/.git" ]; then
  git clone -q https://github.com/Badestrand/russian-dictionary.git "$RAW/openrussian"
fi
git -C "$RAW/openrussian" fetch -q origin "$OR_COMMIT" 2>/dev/null || true
git -C "$RAW/openrussian" checkout -q "$OR_COMMIT"

mkdir -p "$RAW/frequency"
python3 - <<'EOF'
import json, os, urllib.request
src = json.load(open("sources.json"))["frequency"]["files"]
for name, url in src.items():
    dest = os.path.join("raw", "frequency", name)
    if not os.path.exists(dest):
        print("downloading", name)
        urllib.request.urlretrieve(url, dest)
EOF
echo "sources ready in tools/raw/"
