import pytest

from core.rate_limit import reset_all_rate_limiters


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """RNF-RL-03: the per-IP limiters of `main.py`/`local_server.py` are
    module-level (in-memory, per process). Every TestClient request comes from
    the same peer ("testclient"), so without this reset the counters would
    leak between tests and an unrelated test could get a 429 just for running
    after others. Lives in `core/` (not `local_server`) so importing it here
    does not drag torch into the lean CI job."""
    reset_all_rate_limiters()
    yield
    reset_all_rate_limiters()
