"""Context budgeting: dedupe and cap the documents fed to the LLM.

Two cheap wins before any context reaches a prompt:

1. **Deduplication** — the same URL is frequently scraped for several
   sub-queries, and mirror pages repeat identical bodies. Sending them twice
   wastes prompt tokens and embedding calls for zero new information.
2. **Character budget** — a hard ceiling on concatenated document characters
   keeps a single greedy retrieval from ballooning the prompt (and the bill).

Both operate on either raw scraper dicts (``url``/``raw_content``) or LangChain
``Document`` objects (``metadata['source']``/``page_content``), so the helper can
sit in front of the existing compression pipeline without changing its types.
"""

from __future__ import annotations

import hashlib
from typing import Any, Iterable, Sequence

__all__ = [
    "DEFAULT_CONTEXT_CHAR_BUDGET",
    "dedupe_documents",
    "enforce_char_budget",
    "budget_documents",
]

#: Default ceiling (characters) for concatenated document content. Roughly
#: ~15k tokens at ~4 chars/token — generous enough to preserve recall while
#: still bounding pathological prompts.
DEFAULT_CONTEXT_CHAR_BUDGET = 60000


def _source_of(doc: Any) -> str:
    if isinstance(doc, dict):
        return str(doc.get("source") or doc.get("url") or "")
    metadata = getattr(doc, "metadata", None) or {}
    return str(metadata.get("source") or metadata.get("url") or "")


def _content_of(doc: Any) -> str:
    if isinstance(doc, dict):
        return str(doc.get("raw_content") or doc.get("content") or "")
    return str(getattr(doc, "page_content", "") or "")


def _with_content(doc: Any, content: str) -> Any:
    """Return a copy of ``doc`` carrying truncated ``content``."""
    if isinstance(doc, dict):
        new = dict(doc)
        if "raw_content" in new or "content" not in new:
            new["raw_content"] = content
        else:
            new["content"] = content
        return new
    # LangChain Document (or compatible): shallow copy with new page_content.
    try:
        new = doc.model_copy(deep=False)
    except AttributeError:
        import copy

        new = copy.copy(doc)
    try:
        new.page_content = content
    except AttributeError:  # pragma: no cover - defensive
        pass
    return new


def dedupe_documents(documents: Iterable[Any]) -> list[Any]:
    """Drop documents with a duplicate source URL or identical content.

    Preserves input order and keeps the first occurrence of each document.
    """
    seen_sources: set[str] = set()
    seen_digests: set[str] = set()
    result: list[Any] = []
    for doc in documents:
        source = _source_of(doc).strip()
        content = _content_of(doc).strip()
        digest = ""
        if content:
            digest = hashlib.blake2b(
                content.encode("utf-8", "ignore"), digest_size=16
            ).hexdigest()
        if source and source in seen_sources:
            continue
        if digest and digest in seen_digests:
            continue
        if source:
            seen_sources.add(source)
        if digest:
            seen_digests.add(digest)
        result.append(doc)
    return result


def enforce_char_budget(
    documents: Sequence[Any], max_chars: int | None = DEFAULT_CONTEXT_CHAR_BUDGET
) -> list[Any]:
    """Keep whole documents until ``max_chars``, truncating the boundary one.

    ``None`` or a non-positive budget disables the cap.
    """
    if max_chars is None or max_chars <= 0:
        return list(documents)

    kept: list[Any] = []
    used = 0
    for doc in documents:
        remaining = max_chars - used
        if remaining <= 0:
            break
        content = _content_of(doc)
        if len(content) <= remaining:
            kept.append(doc)
            used += len(content)
        else:
            kept.append(_with_content(doc, content[:remaining]))
            used += remaining
            break
    return kept


def budget_documents(
    documents: Iterable[Any], max_chars: int | None = DEFAULT_CONTEXT_CHAR_BUDGET
) -> list[Any]:
    """Deduplicate then cap the given documents to ``max_chars`` total content."""
    return enforce_char_budget(dedupe_documents(documents), max_chars)