"""Guards the fix for "legendas com fontes proprietárias/não instaladas".

Before this fix, `main.py`'s container image build downloaded only the
"Anton" font, while `core/subtitle_styles.py::get_preset_style` requested 5
other font families (Arial, Helvetica, Impact, Courier New, Georgia) for 6
of the 11 presets. Those fonts were never installed, so fontconfig silently
substituted a different font at render time -- no error, no log line, just
the wrong typeface burned into the final clip.

`core/fonts.py` is now the single source of truth for which font family
each preset uses (`PRESET_FONT_FAMILIES`) and which files/URLs provide that
family (`FONT_FILE_DOWNLOADS`), imported by both `core/subtitle_styles.py`
(to assign `style.fontname`) and `main.py` (to build the image's
`run_commands` download list). These tests fail (RED) if a preset's font
family is ever added without a matching download entry, or if `main.py`
stops consuming `core.fonts` and goes back to hardcoding its own
(divergence-prone) font list.
"""

import ast
import pathlib

from core.fonts import FONT_FILE_DOWNLOADS, PRESET_FONT_FAMILIES, iter_download_commands
from core.subtitle_styles import SUPPORTED_PRESETS

MAIN_PY = pathlib.Path(__file__).resolve().parent.parent / "main.py"


class TestPresetFontFamiliesHaveDownloadEntries:
    def test_every_preset_family_has_at_least_one_download(self):
        families_used = set(PRESET_FONT_FAMILIES.values())
        assert families_used, "PRESET_FONT_FAMILIES must not be empty"
        for family in families_used:
            assert family in FONT_FILE_DOWNLOADS, (
                f"Font family {family!r} is used by a preset but has no "
                f"entry in core.fonts.FONT_FILE_DOWNLOADS -- it would never "
                f"be installed in the container image."
            )
            assert len(FONT_FILE_DOWNLOADS[family]) >= 1

    def test_every_non_none_supported_preset_is_mapped(self):
        # CLEAN normalizes to MINIMAL inside get_preset_style(), so it is not
        # expected to have its own entry; NONE is the explicit "no subtitle"
        # sentinel (core/subtitle_styles.py raises for it) and has no font.
        unmapped = SUPPORTED_PRESETS - {"CLEAN", "NONE"} - PRESET_FONT_FAMILIES.keys()
        assert not unmapped, (
            f"Preset(s) {unmapped} have no entry in "
            f"core.fonts.PRESET_FONT_FAMILIES; add one so the font it "
            f"needs actually gets downloaded/installed."
        )

    def test_download_urls_point_at_the_canonical_google_fonts_repo(self):
        for dest, url in iter_download_commands():
            assert url.startswith("https://github.com/google/fonts/raw/main/"), (
                f"Font download for {dest!r} ({url!r}) is not from the "
                f"canonical google/fonts GitHub repo."
            )
            assert dest.endswith(".ttf")


class TestMainPyBuildsFontsFromSharedSource:
    def test_main_py_imports_core_fonts(self):
        source = MAIN_PY.read_text(encoding="utf-8")
        tree = ast.parse(source)
        imported_names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "core.fonts":
                imported_names.update(alias.name for alias in node.names)
        assert "iter_download_commands" in imported_names, (
            "main.py must import core.fonts.iter_download_commands and use "
            "it to build the image's font download commands, instead of "
            "hardcoding its own font list again (the original bug)."
        )

    def test_main_py_does_not_hardcode_a_second_font_url(self):
        source = MAIN_PY.read_text(encoding="utf-8")
        # The only place a google/fonts raw URL literal may appear in
        # main.py's source is inside core/fonts.py's own module (not
        # main.py) -- main.py should only ever reference font URLs
        # indirectly through iter_download_commands().
        assert "github.com/google/fonts/raw" not in source, (
            "main.py must not hardcode a google/fonts download URL "
            "directly; it should come exclusively from "
            "core.fonts.iter_download_commands(), the single source of "
            "truth shared with core/subtitle_styles.py and "
            "scripts/install-fonts.sh."
        )
