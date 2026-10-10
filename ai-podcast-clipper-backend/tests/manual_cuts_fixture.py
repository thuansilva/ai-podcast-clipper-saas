"""Deterministic manual-cut request payload shared by unit, integration and
future e2e tests.

The payload lives in `tests/fixtures/manual_cuts_payload.json`. It is the
exact wire format the frontend sends for `mode="manual"` (see spec
`docs/historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md`,
sections 3 and 8). Keep it free of implementation details so an e2e test can
reuse it as-is: only `s3_key` is environment-specific, and tests that run
against a local file replace it explicitly (never by editing the JSON).
"""

import json
import pathlib
from typing import Any, Dict

MANUAL_CUTS_PAYLOAD_PATH = (
    pathlib.Path(__file__).parent / "fixtures" / "manual_cuts_payload.json"
)

# Ends of the fixture cuts, used by tests to pick a video duration that is
# long enough (or deliberately too short).
FIXTURE_MAX_CUT_END_SECONDS = 12.0
FIXTURE_CUT_COUNT = 3


def load_manual_cuts_payload() -> Dict[str, Any]:
    """Return a fresh dict with the deterministic manual-cut request payload."""
    with MANUAL_CUTS_PAYLOAD_PATH.open(encoding="utf-8") as fh:
        payload: Dict[str, Any] = json.load(fh)
    return payload
