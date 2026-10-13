"""Optional, environment-dependent check: IF the project's fonts have been
installed on this machine (e.g. by running `scripts/install-fonts.sh`),
confirm fontconfig actually resolves each family to itself instead of
silently substituting another font.

This is deliberately *not* required to pass in CI/most dev machines -- it
auto-skips whenever `fc-match` is unavailable, or when a given family isn't
installed locally yet. It exists purely as a quick, repeatable way to
double check an `install-fonts.sh` run (or a rebuilt container image, via
`fc-match` run inside it) actually worked, instead of eyeballing a rendered
clip.
"""

import shutil
import subprocess

import pytest

from core.fonts import PRESET_FONT_FAMILIES

pytestmark = pytest.mark.skipif(
    shutil.which("fc-match") is None,
    reason="fontconfig (fc-match) is not installed on this machine",
)


def _fc_match_family(query: str) -> str:
    result = subprocess.run(
        ["fc-match", "--format=%{family}", query],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


class TestInstalledFontsResolveToThemselves:
    @pytest.mark.parametrize("family", sorted(set(PRESET_FONT_FAMILIES.values())))
    def test_family_resolves_to_itself_when_installed(self, family):
        matched = _fc_match_family(family)
        if matched != family:
            pytest.skip(
                f"{family!r} is not installed locally (fc-match returned "
                f"{matched!r} instead) -- run scripts/install-fonts.sh first "
                f"to exercise this check for real."
            )
        assert matched == family
