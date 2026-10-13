#!/usr/bin/env bash
# Installs the same subtitle fonts the Modal container image bakes in
# (main.py) on the current machine. This is a PREREQUISITE for running
# `local_server.py` (the local GPU dev runner) if you want every subtitle
# preset to render with its intended font — without it, fontconfig
# silently substitutes a different font for any preset whose family isn't
# installed (no error, just the wrong typeface burned into the clip).
#
# core/fonts.py is the single source of truth for which font family each
# preset uses and which URLs provide it; this script has no font URLs of
# its own — it reads them from `python3 -m core.fonts` so it can never
# drift from main.py's image build or core/subtitle_styles.py.
#
# Usage (run once per machine, from the ai-podcast-clipper-backend/ dir):
#   ./scripts/install-fonts.sh
#
# Destination defaults to ~/.local/share/fonts/ai-podcast-clipper (no root
# needed); pass a different directory as $1 to override (e.g. to match
# /usr/share/fonts/truetype/custom like the container image, if you have
# write access there).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
DEST_DIR="${1:-$HOME/.local/share/fonts/ai-podcast-clipper}"

mkdir -p "$DEST_DIR"

echo "Installing AI Podcast Clipper subtitle fonts into: $DEST_DIR"

cd "$BACKEND_DIR"
python3 -m core.fonts | while read -r dest_filename url; do
    echo "  - $dest_filename <- $url"
    wget -q -O "$DEST_DIR/$dest_filename" "$url"
done

fc-cache -f "$DEST_DIR"

echo "Done. Verify with, e.g.: fc-match Arimo"
