"""Tool 实现：网页搜索（tool.md）。

搜索提供商可替换：默认 DuckDuckGo HTML 接口（无需 API key），
网络失败时降级返回空列表（诚实降级，不编造来源）。测试注入 mock SearchProvider。
"""
from __future__ import annotations

import re
import urllib.parse
from dataclasses import dataclass
from typing import Protocol

import httpx

# 搜索工具的权限名，由 PermissionGate 判定（security.md §4）
SEARCH_PERMISSION = "search"


@dataclass
class SearchResult:
    """一条搜索结果：标题 + 链接 + 摘要。"""

    title: str
    url: str
    snippet: str = ""


class SearchProvider(Protocol):
    """搜索接口，测试时注入 mock。"""

    def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
        """按查询返回相关结果，无结果或失败返回空列表。"""
        ...


_DDGS_ENDPOINT = "https://html.duckduckgo.com/html/"
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _decode_url(href: str) -> str:
    """把 DuckDuckGo 的跳转链接还原为真实 URL（解析 uddg 参数）。"""
    parsed = urllib.parse.urlparse(href)
    qs = urllib.parse.parse_qs(parsed.query)
    if qs.get("uddg"):
        return urllib.parse.unquote(qs["uddg"][0])
    return href


def _strip_tags(text: str) -> str:
    """去除 HTML 标签，压缩空白。"""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text)).strip()


class DuckDuckGoSearch:
    """DuckDuckGo HTML 接口搜索。失败降级返回空列表，不抛异常。"""

    def search(self, query: str, max_results: int = 5) -> list[SearchResult]:
        try:
            resp = httpx.get(
                _DDGS_ENDPOINT,
                params={"q": query},
                headers={"User-Agent": _UA},
                timeout=10.0,
                follow_redirects=True,
            )
            resp.raise_for_status()
            html = resp.text
        except Exception:  # noqa: BLE001 - 网络/解析失败一律降级为空结果
            return []

        results: list[SearchResult] = []
        # 按结果块切分：每个 class="result ... results_links" 是一整条结果
        blocks = re.split(r'class="result[^"]*results_links', html)[1:]
        for block in blocks:
            m_link = re.search(
                r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                block,
                re.DOTALL,
            )
            if not m_link:
                continue
            url = _decode_url(m_link.group(1))
            title = _strip_tags(m_link.group(2))
            if not url or not title:
                continue
            snippet = ""
            m_snip = re.search(
                r'class="result__snippet"[^>]*>(.*?)</a>', block, re.DOTALL
            )
            if m_snip:
                snippet = _strip_tags(m_snip.group(1))
            results.append(SearchResult(title=title, url=url, snippet=snippet))
            if len(results) >= max_results:
                break
        return results
