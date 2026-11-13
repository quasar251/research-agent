"""评估模块：基准记录与对比（eval.md §6.2）。

记录各模型 / 配置在评估集上的基线分数；任何模型或 prompt 变更前先跑基准对比。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def baseline_path(path: str | Path | None = None) -> Path:
    if path is not None:
        return Path(path)
    return Path(__file__).resolve().parent / "baselines.json"


def load_baseline(model: str, path: str | Path | None = None) -> dict | None:
    """读取某模型的基线分数，无记录返回 None。"""
    f = baseline_path(path)
    if not f.exists():
        return None
    data = json.loads(f.read_text(encoding="utf-8"))
    return data.get(model)


def save_baseline(model: str, scores: dict[str, float], path: str | Path | None = None) -> None:
    """记录（或更新）某模型的基线分数，带时间戳。"""
    f = baseline_path(path)
    data: dict[str, Any] = {}
    if f.exists():
        data = json.loads(f.read_text(encoding="utf-8"))
    data[model] = {
        "scores": scores,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def compare(current: dict[str, float], baseline: dict[str, float]) -> dict[str, float]:
    """逐指标对比相对变化率（正数表示相对基线提升）。"""
    result: dict[str, float] = {}
    for k, base in baseline.items():
        cur = current.get(k)
        if cur is None or base == 0:
            result[k] = 0.0
        else:
            result[k] = round((cur - base) / base, 4)
    return result
