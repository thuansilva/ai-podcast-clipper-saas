"""Regression guard for the GPU cost cap on `AiPodcastClipper` (Modal).

Before this fix, `@app.cls(gpu="L40S", ...)` had no `max_containers`, so a
flood of `/process_video` requests (the Bearer token is static, no per-user
throttling on this endpoint) could spin up an unbounded number of GPU
containers in parallel — unbounded GPU spend (checklist-go-live.md HIGH,
P0: "Rate limiting nos endpoints do backend Python").

A real test harness for Modal's actual autoscaling isn't practical here (it
requires a live Modal deployment). Instead this asserts, at the source
level, that the decorator applied to `AiPodcastClipper` declares
`max_containers=2` — the simplest check that doesn't depend on Modal's
internal (undocumented, version-fragile — see the `scenedetect`/`modal`
incidents this same session) class-service-options representation.
"""

import ast
import pathlib

MAIN_PY = pathlib.Path(__file__).resolve().with_name("..").joinpath("main.py").resolve()


def _find_decorator_kwargs(class_or_func_name: str, decorator_attr: str) -> dict:
    tree = ast.parse(MAIN_PY.read_text())
    for node in ast.walk(tree):
        if not isinstance(node, (ast.ClassDef, ast.FunctionDef)):
            continue
        if node.name != class_or_func_name:
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            func = decorator.func
            attr = getattr(func, "attr", None)
            if attr == decorator_attr:
                result = {}
                for kw in decorator.keywords:
                    if kw.arg is None:
                        continue
                    try:
                        result[kw.arg] = ast.literal_eval(kw.value)
                    except ValueError:
                        result[kw.arg] = "<non-literal>"
                return result
    raise AssertionError(
        f"No @app.{decorator_attr}(...) decorator found on {class_or_func_name!r} in main.py"
    )


class TestAiPodcastClipperGpuCap:
    def test_max_containers_is_capped(self):
        kwargs = _find_decorator_kwargs("AiPodcastClipper", "cls")
        assert kwargs.get("max_containers") == 2

    def test_gpu_class_is_unchanged_otherwise(self):
        kwargs = _find_decorator_kwargs("AiPodcastClipper", "cls")
        assert kwargs.get("gpu") == "L40S"
        assert kwargs.get("timeout") == 900
