"""Guards the fix for the HIGH checklist item "Bucket S3 hardcoded divergente
entre front e backend" (docs/operacao/checklist-go-live.md).

`core/storage/factory.py::DEFAULT_BUCKET` is the single source of truth for
the default S3 bucket name shared by the Modal runner (`main.py`) and the
local GPU runner (`local_server.py`) — see the module docstring of
`core/storage/factory.py`. Before this fix, `local_server.py` additionally
declared its own `S3_BUCKET = os.environ.get("S3_BUCKET_NAME",
"ai-podcast-clipper")` module-level constant: a dead-code duplicate (never
read anywhere else in the file) that silently hardcoded the same default a
second time, with no compiler/test signal if the two defaults ever drifted.

These tests fail (RED) against the pre-fix `local_server.py` and pass
(GREEN) once the duplicate literal is removed, keeping
`core/storage/factory.py::DEFAULT_BUCKET` as the only place this default is
spelled out in backend source code (outside of the documentation example in
`.env.example`).
"""

import pathlib
import re

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
# Matched as a standalone quoted string literal (`"ai-podcast-clipper"`), not
# as a substring — unrelated identifiers like the TORCH_HOME cache path
# `/tmp/ai-podcast-clipper-models` or the Modal app/secret name
# `"ai-podcast-clipper"` used in `main.py` for infra resource names must not
# trip this guard; only an actual standalone bucket-name literal should.
BUCKET_LITERAL_PATTERN = re.compile(r'"ai-podcast-clipper"')


def _read(relative_path: str) -> str:
    return (BACKEND_ROOT / relative_path).read_text(encoding="utf-8")


class TestNoDuplicateBucketLiteral:
    def test_local_server_does_not_hardcode_the_default_bucket_literal(self):
        source = _read("local_server.py")

        assert not BUCKET_LITERAL_PATTERN.search(source), (
            "local_server.py must not hardcode the default bucket name; it "
            "should rely exclusively on core.storage.factory.create_object_storage() "
            "(core.storage.factory.DEFAULT_BUCKET), the single source of truth."
        )

    def test_local_server_has_no_standalone_s3_bucket_constant(self):
        source = _read("local_server.py")

        assert not re.search(r"^S3_BUCKET\s*=", source, re.MULTILINE), (
            "local_server.py must not declare its own S3_BUCKET module-level "
            "constant; the bucket name is resolved exclusively inside "
            "create_object_storage()."
        )

    def test_main_does_not_hardcode_the_default_bucket_literal_for_s3(self):
        source = _read("main.py")

        # main.py legitimately uses "ai-podcast-clipper" as the Modal app
        # name / volume name / secret name (infrastructure identifiers,
        # unrelated to the S3 bucket) — those are fine. What must never
        # reappear is a literal default passed to S3_BUCKET_NAME lookup.
        assert "S3_BUCKET" not in source
        assert not re.search(
            r'os\.environ\.get\(\s*"S3_BUCKET_NAME"\s*,\s*"ai-podcast-clipper"',
            source,
        )
