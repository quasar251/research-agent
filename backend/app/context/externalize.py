"""上下文模块：输出外化（s13）。

大文本（如检索结果）超过阈值时写磁盘，上下文只保留「摘要 + head/tail + 路径指针」，
需要时按需读回。类比操作系统虚拟内存换页：上下文是 RAM，磁盘是 swap。
"""
from __future__ import annotations

import hashlib
import tempfile
from pathlib import Path

_DEFAULT_THRESHOLD = 8 * 1024  # 字节，超过则外部化
_HEAD = 2 * 1024  # 头部保留字符数
_TAIL = 4 * 1024  # 尾部保留字符数

_DEFAULT_DIR = Path(tempfile.gettempdir()) / "research-agent-artifacts"


def should_externalize(text: str, threshold: int = _DEFAULT_THRESHOLD) -> bool:
    """判断文本是否超过阈值，需要外部化。"""
    return len(text.encode("utf-8")) > threshold


def externalize(
    text: str,
    out_dir: str | Path = _DEFAULT_DIR,
    threshold: int = _DEFAULT_THRESHOLD,
) -> str:
    """超过阈值则把完整文本写磁盘，返回上下文指针（head + tail + 路径）；否则原样返回。

    文件名由内容 SHA-256 派生，幂等：同一内容复用同一文件，绝不覆盖旧证据。
    """
    if not should_externalize(text, threshold):
        return text
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    path = out / f"artifact_{digest}.txt"
    if not path.exists():
        path.write_text(text, encoding="utf-8")
    head = text[:_HEAD]
    tail = text[-_TAIL:]
    return (
        f"[外部化 artifact:{digest}]\n"
        f"完整内容：{path}\n"
        f"{head}\n"
        f"\n... [中间省略，完整输出见 {path}] ...\n"
        f"\n{tail}"
    )
