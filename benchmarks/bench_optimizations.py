"""Local synthetic benchmark: pre-optimization vs optimized behaviour.

Runs fully offline (no API keys, no network). Each scenario places a "baseline"
implementation — a faithful, inlined replica of the *pre-optimization* code path
— next to the *optimized* production implementation, and reports the delta in a
single run. This avoids any reliance on git history / timing.

Scenarios:
  1. LLM retry resilience      — success rate under transient 429/5xx
  2. Error classification      — retry decisions + wasted attempts
  3. Stage degradation         — run delivery when an auxiliary stage fails
  4. Run log                   — append throughput + bounded file size
  5. ReportStore reads         — get_report throughput (O(n) vs O(1))
  6. Context dedupe + budget   — prompt characters / documents sent to the LLM
  7. Usage collection overhead — per-call cost of stage token accounting

Usage:
    .venv\\Scripts\\python.exe benchmarks/bench_optimizations.py
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gpt_researcher.harness import (  # noqa: E402
    RateLimitError,
    RetryPolicy,
    RunLog,
    async_retry,
    classify_status_code,
    collect_stage,
    is_retryable,
    report_usage,
    run_stage,
)
from gpt_researcher.utils.context_budget import budget_documents  # noqa: E402


def _load_report_store():
    """Load backend/server/report_store.py without importing the whole backend."""
    spec = importlib.util.spec_from_file_location(
        "report_store", ROOT / "backend" / "server" / "report_store.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.ReportStore


ReportStore = _load_report_store()


# ═══════════════════════════════════════════════════════════════
# Scenario 1: LLM retry resilience
# ═══════════════════════════════════════════════════════════════


def _flaky(fail_times: int, exc: BaseException):
    """Coroutine factory that fails ``fail_times`` then succeeds."""
    state = {"n": 0}

    async def fn():
        if state["n"] < fail_times:
            state["n"] += 1
            raise exc
        return "ok"

    return fn


async def bench_retry(trials: int = 300, fail_times: int = 2) -> dict:
    policy = RetryPolicy(max_attempts=3, base_delay=0.0, jitter=False)
    noop = lambda _d: asyncio.sleep(0)  # noqa: E731 - never actually sleep
    quiet = lambda *_a: None  # noqa: E731 - suppress retry logging in the loop

    base_ok = opt_ok = 0
    for _ in range(trials):
        # Baseline: a single attempt, no retry (pre-optimization behaviour).
        try:
            await _flaky(fail_times, RateLimitError("429"))()
            base_ok += 1
        except Exception:
            pass
        # Optimized: exponential-backoff retry wrapper.
        try:
            await async_retry(
                _flaky(fail_times, RateLimitError("429")),
                policy=policy,
                on_retry=quiet,
                sleep=noop,
            )
            opt_ok += 1
        except Exception:
            pass

    return {
        "scenario": "1. LLM retry resilience",
        "metric": "call success rate (2 transient failures then success)",
        "baseline": round(100 * base_ok / trials, 1),
        "optimized": round(100 * opt_ok / trials, 1),
        "unit": "%",
        "higher_is_better": True,
    }


# ═══════════════════════════════════════════════════════════════
# Scenario 2: Error classification
# ═══════════════════════════════════════════════════════════════

_CLASSIFY_CASES = [
    (429, "rate limit exceeded", True),
    (429, "insufficient balance in your account", False),  # quota -> pause
    (401, "invalid api key", False),
    (403, "forbidden", False),
    (404, "model not found", False),
    (500, "internal server error", True),
    (503, "service unavailable", True),
]


async def bench_classification() -> dict:
    total = len(_CLASSIFY_CASES)
    base_correct = opt_correct = 0
    base_wasted = opt_wasted = 0

    for code, body, should_retry in _CLASSIFY_CASES:
        # Baseline: every error is considered retryable (no taxonomy) — so it
        # wastes attempts on fatal/quota errors that can never succeed.
        base_retry_decision = True
        if base_retry_decision == should_retry:
            base_correct += 1
        if base_retry_decision and not should_retry:
            base_wasted += 2  # would spend the 2 extra attempts of a 3-try policy

        # Optimized: classify first, then decide.
        err = classify_status_code(code, body)
        opt_retry_decision = is_retryable(err)
        if opt_retry_decision == should_retry:
            opt_correct += 1
        if opt_retry_decision and not should_retry:
            opt_wasted += 2

    return [
        {
            "scenario": "2a. Error classification",
            "metric": "correct retry decisions",
            "baseline": round(100 * base_correct / total, 1),
            "optimized": round(100 * opt_correct / total, 1),
            "unit": "%",
            "higher_is_better": True,
        },
        {
            "scenario": "2b. Error classification",
            "metric": "wasted retry attempts on non-retryable errors",
            "baseline": base_wasted,
            "optimized": opt_wasted,
            "unit": "attempts",
            "higher_is_better": False,
        },
    ]


# ═══════════════════════════════════════════════════════════════
# Scenario 3: Stage degradation (availability-first)
# ═══════════════════════════════════════════════════════════════


async def bench_degradation(trials: int = 200) -> dict:
    async def failing_aux():
        raise RuntimeError("pdf engine unavailable")

    base_delivered = opt_delivered = 0
    for _ in range(trials):
        # Baseline: auxiliary export is awaited directly; failure aborts the run.
        try:
            await failing_aux()
            base_delivered += 1
        except Exception:
            pass
        # Optimized: non-critical stage degrades instead of aborting.
        result = await run_stage(
            "export:pdf", failing_aux, critical=False, default=None
        )
        if result.degraded:
            opt_delivered += 1

    return {
        "scenario": "3. Availability-first degradation",
        "metric": "runs delivered when PDF export fails",
        "baseline": round(100 * base_delivered / trials, 1),
        "optimized": round(100 * opt_delivered / trials, 1),
        "unit": "%",
        "higher_is_better": True,
    }


# ═══════════════════════════════════════════════════════════════
# Scenario 4: Run log (append-only JSONL vs JSON array rewrite)
# ═══════════════════════════════════════════════════════════════


def bench_run_log(n: int = 1000, n_bounded: int = 5000, max_entries: int = 300) -> list[dict]:
    def entry(i: int) -> dict:
        return {
            "ts": "2026-01-01T00:00:00",
            "time": "00:00:00",
            "message": f"entry-{i}",
            "stage": "x",
            "idx": i,
        }

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # Baseline: a JSON array that must be fully read+parsed then rewritten
        # on every append (O(n) per write, unbounded growth).
        array_path = tmp_path / "run_array.json"
        array_path.write_text("[]", encoding="utf-8")
        t0 = time.perf_counter()
        for i in range(n):
            data = json.loads(array_path.read_text(encoding="utf-8"))
            data.append(entry(i))
            array_path.write_text(
                json.dumps(data, ensure_ascii=False), encoding="utf-8"
            )
        base_t = time.perf_counter() - t0

        # Optimized: append-only JSONL with bounded compaction.
        log = RunLog(tmp_path / "run.jsonl", max_entries=max_entries)
        t0 = time.perf_counter()
        for i in range(n):
            log.append(f"entry-{i}", stage="x", idx=i)
        opt_t = time.perf_counter() - t0

        # Boundedness: after many appends the baseline array keeps everything,
        # while the JSONL log is compacted down toward ``max_entries`` (up to
        # the 4x compaction threshold).
        bounded_log = RunLog(tmp_path / "run_bounded.jsonl", max_entries=max_entries)
        for i in range(n_bounded):
            bounded_log.append(f"entry-{i}", stage="x", idx=i)
        opt_retained = len(
            (tmp_path / "run_bounded.jsonl")
            .read_text(encoding="utf-8")
            .strip()
            .splitlines()
        )
        base_retained = n_bounded  # JSON array has no cap

    return [
        {
            "scenario": "4a. Run log",
            "metric": f"append throughput ({n} appends)",
            "baseline": round(n / base_t, 1),
            "optimized": round(n / opt_t, 1),
            "unit": "appends/s",
            "higher_is_better": True,
        },
        {
            "scenario": "4b. Run log",
            "metric": f"retained entries after {n_bounded} appends",
            "baseline": base_retained,
            "optimized": opt_retained,
            "unit": "entries",
            "higher_is_better": False,
        },
    ]


# ═══════════════════════════════════════════════════════════════
# Scenario 5: ReportStore read throughput
# ═══════════════════════════════════════════════════════════════


async def bench_report_store(n_reports: int = 1000, n_reads: int = 200) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "reports.json"
        data = {
            f"id{i}": {
                "id": f"id{i}",
                "question": "q" * 200,
                "answer": "a" * 500,
            }
            for i in range(n_reports)
        }
        path.write_text(json.dumps(data), encoding="utf-8")
        ids = [f"id{i}" for i in range(n_reads)]

        # Baseline: read + parse the whole document on every get (O(n)).
        t0 = time.perf_counter()
        for rid in ids:
            whole = json.loads(path.read_text(encoding="utf-8"))
            _ = whole.get(rid)
        base_t = time.perf_counter() - t0

        # Optimized: in-memory cache, loads once (O(1) per get thereafter).
        store = ReportStore(path)
        t0 = time.perf_counter()
        for rid in ids:
            _ = await store.get_report(rid)
        opt_t = time.perf_counter() - t0

    return {
        "scenario": "5. ReportStore reads",
        "metric": f"get_report throughput ({n_reads} reads over {n_reports} reports)",
        "baseline": round(n_reads / base_t, 1),
        "optimized": round(n_reads / opt_t, 1),
        "unit": "reads/s",
        "higher_is_better": True,
    }


# ═══════════════════════════════════════════════════════════════
# Scenario 6: Context dedupe + character budget
# ═══════════════════════════════════════════════════════════════


def bench_context(
    n_unique: int = 30, n_dupes: int = 12, doc_chars: int = 3000, budget: int = 60000
) -> dict:
    unique = [
        {
            "url": f"https://source-{i}.example.com",
            "title": f"Doc {i}",
            "raw_content": f"[doc-{i}] " + "x" * doc_chars,
        }
        for i in range(n_unique)
    ]
    # Duplicates: same URL, same body (mirror pages / repeated sub-query scrapes).
    dupes = [
        {
            "url": unique[i % n_unique]["url"],
            "title": unique[i % n_unique]["title"],
            "raw_content": unique[i % n_unique]["raw_content"],
        }
        for i in range(n_dupes)
    ]
    docs = unique + dupes

    base_chars = sum(len(d["raw_content"]) for d in docs)
    base_docs = len(docs)

    optimized = budget_documents(docs, max_chars=budget)
    opt_chars = sum(len(d["raw_content"]) for d in optimized)
    opt_docs = len(optimized)

    return [
        {
            "scenario": "6a. Context dedupe + budget",
            "metric": "document characters sent to the LLM",
            "baseline": base_chars,
            "optimized": opt_chars,
            "unit": "chars",
            "higher_is_better": False,
        },
        {
            "scenario": "6b. Context dedupe + budget",
            "metric": "documents embedded / prompted",
            "baseline": base_docs,
            "optimized": opt_docs,
            "unit": "docs",
            "higher_is_better": False,
        },
        {
            "scenario": "6c. Context dedupe + budget",
            "metric": "prompt character reduction",
            "baseline": 0.0,
            "optimized": round(100 * (base_chars - opt_chars) / base_chars, 1),
            "unit": "%",
            "higher_is_better": True,
        },
    ]


# ═══════════════════════════════════════════════════════════════
# Scenario 7: Usage collection overhead
# ═══════════════════════════════════════════════════════════════


async def bench_usage_overhead(iterations: int = 50000) -> dict:
    """Measure the absolute cost of stage token accounting.

    This is a *new capability*, not a baseline-vs-optimized improvement, so it is
    reported separately: the point is that per-call accounting is microsecond-
    scale and therefore negligible next to a real LLM round-trip.
    """
    t0 = time.perf_counter()
    with collect_stage() as collector:
        for _ in range(iterations):
            report_usage({"prompt_tokens": 10, "completion_tokens": 5})
    elapsed = time.perf_counter() - t0

    return {
        "ns_per_call": round(1e9 * elapsed / iterations, 1),
        "us_per_1000_calls": round(1e6 * elapsed / (iterations / 1000), 2),
        "total_tokens_collected": collector.total_tokens,
    }


# ═══════════════════════════════════════════════════════════════
# Runner / reporting
# ═══════════════════════════════════════════════════════════════


def _format_delta(row: dict) -> str:
    base, opt = row["baseline"], row["optimized"]
    if isinstance(base, (int, float)) and isinstance(opt, (int, float)):
        if base == 0:
            return "n/a" if opt == 0 else "+inf"
        change = 100 * (opt - base) / base
        return f"{change:+.1f}%"
    return "n/a"


def _print_table(rows: list[dict]) -> None:
    headers = ["Scenario", "Metric", "Baseline", "Optimized", "Delta", "Unit"]
    table = [
        [
            r["scenario"],
            r["metric"],
            f"{r['baseline']}",
            f"{r['optimized']}",
            _format_delta(r),
            r["unit"],
        ]
        for r in rows
    ]
    widths = [
        max(len(headers[i]), *(len(row[i]) for row in table))
        for i in range(len(headers))
    ]

    def line(cells):
        return "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(cells))

    print(line(headers))
    print(line(["-" * w for w in widths]))
    for row in table:
        print(line(row))


async def main() -> None:
    rows: list[dict] = []

    rows.append(await bench_retry())
    rows.extend(await bench_classification())
    rows.append(await bench_degradation())
    rows.extend(bench_run_log())
    rows.append(await bench_report_store())
    rows.extend(bench_context())
    usage = await bench_usage_overhead()

    print()
    print("=" * 100)
    print("GPT-Researcher optimization benchmark: baseline vs optimized")
    print("=" * 100)
    _print_table(rows)
    print("=" * 100)
    print(
        "Accounting overhead (new capability, informational): "
        f"{usage['ns_per_call']} ns/call "
        f"({usage['us_per_1000_calls']} us per 1000 calls) "
        "- negligible vs a real LLM round-trip (>100 ms)."
    )

    out_path = Path(__file__).resolve().parent / "results.json"
    out_path.write_text(
        json.dumps(
            {"rows": rows, "usage_overhead": usage}, indent=2, ensure_ascii=False
        ),
        encoding="utf-8",
    )
    print(f"\nRaw results written to: {out_path}")


if __name__ == "__main__":
    asyncio.run(main())