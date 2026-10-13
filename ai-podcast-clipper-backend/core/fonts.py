"""Single source of truth for the fonts used by subtitle presets.

Why this module exists: `core/subtitle_styles.py::get_preset_style` assigns
a font family per subtitle preset, but whatever runs `ffmpeg -vf ass=...`
(libass, via fontconfig) only renders that family correctly if the actual
`.ttf` file is installed on the machine. Before this module existed,
`main.py`'s container image build downloaded *only* the "Anton" font, while
6 of the 11 presets in `core/subtitle_styles.py` requested other families
(Arial, Helvetica, Impact, Courier New, Georgia) that were never installed.
fontconfig does not error when a requested family is missing — it silently
substitutes a different, available font — so those 6 presets rendered with
the wrong typeface with no warning anywhere in the logs.

Arial, Helvetica, Impact, Courier New and Georgia are also proprietary
(Microsoft / Adobe-Linotype) and not legally redistributable inside this
image, so they were replaced with free (OFL/Apache-licensed) Google Fonts
chosen as metric/visual substitutes:

  - Arial / Helvetica -> **Arimo** — designed by Google specifically as a
    metric-compatible replacement for Arial; also commonly cited as a
    Helvetica substitute (very similar proportions/x-height).
  - Courier New -> **Courier Prime** — a free monospace typewriter font
    with the same general look as Courier New, widely used as its
    substitute (e.g. in screenwriting software).
  - Georgia -> **Gelasio** — designed by Google specifically as a
    metric-compatible replacement for Georgia.
  - Impact -> **Anton** (reused, no new download). Anton is itself a
    heavy, ultra-bold, condensed display face in the same spirit as
    Impact/Haettenschweiler (it's commonly cited as a free Impact-style
    font), closer to Impact's thick block look than a more conventional
    condensed font like Oswald. Reusing it also means zero new
    download/build risk for this preset, since Anton is already proven to
    install and render correctly in this image for 4 other presets.

Both `main.py` (Modal container image build) and
`scripts/install-fonts.sh` (prerequisite for `local_server.py`, the local
GPU runner) must install the *same* files from the *same* URLs — this
module is what they both read, so the two runners (and any future preset)
can't drift apart again. `tests/test_font_contract.py` guards that every
family referenced by a preset has a download entry here.
"""

from typing import Dict, List, Tuple

# preset name (as used in core.subtitle_styles.SUPPORTED_PRESETS, already
# upper-cased/normalized) -> font family name (as fontconfig/libass should
# resolve it). This is the single source of truth for
# `get_preset_style()`'s `style.fontname` assignment -- see
# core/subtitle_styles.py, which imports this dict instead of hardcoding
# family names a second time.
PRESET_FONT_FAMILIES: Dict[str, str] = {
    "HORMOZI": "Anton",
    "POPPING_GREEN": "Anton",
    "MINIMAL": "Arimo",
    "NEON": "Anton",
    "VLOG": "Arimo",
    "TRUE_CRIME": "Courier Prime",
    "CORPORATE": "Arimo",
    "GAMER": "Anton",
    "ASMR": "Gelasio",
    "LOUD": "Anton",
}

# font family -> list of (destination filename, download URL) pairs, all
# served from the canonical google/fonts GitHub repo (OFL-licensed files).
#
# Arimo and Gelasio are only published upstream as variable fonts (a single
# file covering the whole weight axis, with a separate file for the italic
# axis) -- there is no separate static "Bold" file to download. This was
# verified in practice (per AGENTS.md's observability guidance: validate,
# don't assume) against an `ubuntu:22.04` container -- the same base OS as
# the Modal image -- on 2026-10-13: after installing just the single
# variable-font file and running `fc-cache`, `fc-match "Arimo:bold"` and
# `fc-match "Gelasio:bold:italic"` both resolved *inside that same file*
# (fontconfig's named-instance matching), not a silent fallback to another
# family. So one file per axis is sufficient; no missing-Bold risk despite
# there being no dedicated static Bold file.
FONT_FILE_DOWNLOADS: Dict[str, List[Tuple[str, str]]] = {
    "Anton": [
        (
            "Anton-Regular.ttf",
            "https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf",
        ),
    ],
    "Arimo": [
        (
            "Arimo.ttf",
            "https://github.com/google/fonts/raw/main/ofl/arimo/Arimo%5Bwght%5D.ttf",
        ),
    ],
    "Courier Prime": [
        (
            "CourierPrime-Regular.ttf",
            "https://github.com/google/fonts/raw/main/ofl/courierprime/CourierPrime-Regular.ttf",
        ),
        (
            "CourierPrime-Bold.ttf",
            "https://github.com/google/fonts/raw/main/ofl/courierprime/CourierPrime-Bold.ttf",
        ),
    ],
    "Gelasio": [
        (
            "Gelasio.ttf",
            "https://github.com/google/fonts/raw/main/ofl/gelasio/Gelasio%5Bwght%5D.ttf",
        ),
        (
            "Gelasio-Italic.ttf",
            "https://github.com/google/fonts/raw/main/ofl/gelasio/Gelasio-Italic%5Bwght%5D.ttf",
        ),
    ],
}


def iter_download_commands() -> List[Tuple[str, str]]:
    """Flatten `FONT_FILE_DOWNLOADS` into `(dest_filename, url)` pairs.

    Iterates families in a stable (sorted) order so `main.py`'s generated
    `run_commands` list -- and therefore the container image's build-layer
    cache key -- doesn't change just because dict insertion order changed.
    Consumed by `main.py` (Modal image build) and
    `scripts/install-fonts.sh` (via `python3 -m core.fonts`, see below).
    """
    pairs: List[Tuple[str, str]] = []
    for family in sorted(FONT_FILE_DOWNLOADS):
        pairs.extend(FONT_FILE_DOWNLOADS[family])
    return pairs


if __name__ == "__main__":
    # `scripts/install-fonts.sh` shells out to `python3 -m core.fonts` and
    # reads one "<dest_filename> <url>" pair per line, so it never needs its
    # own hardcoded copy of these URLs.
    for dest, url in iter_download_commands():
        print(f"{dest} {url}")
