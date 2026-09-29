<div align="center">

# 🔎 Research Agent

**面向 Web 与本地资料的自主深度研究智能体**

基于 [GPT Researcher](https://github.com/assafelovic/gpt-researcher) v0.16.0 深度定制的部署版本，
输出带引用的结构化研究报告，支持 Web / 本地文档 / 多智能体 / MCP 等多种研究模式。

</div>

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [系统架构](#系统架构)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [后端接口](#后端接口)
- [本项目定制点](#本项目定制点)
- [配置项](#配置项)
- [Docker 部署](#docker-部署)
- [测试与评估](#测试与评估)
- [许可证与致谢](#许可证与致谢)

---

## 项目简介

Research Agent 会针对任意给定任务，自动完成**规划 → 检索 → 抓取 → 过滤 → 撰写**的全流程，
产出**详尽、有事实依据、带引用**的研究报告。

其设计思路参考 [Plan-and-Solve](https://arxiv.org/abs/2305.04091) 与
[RAG](https://arxiv.org/abs/2005.11401)，通过并行化的智能体工作流，
缓解大模型的幻觉、上下文长度限制与信息源偏差问题。

> 说明：Python 包名仍保留为 `gpt_researcher`（以兼容全部内部 import），
> 而**分发包名 / 项目名 / 前端包名**已统一为 `research-agent`。

---

## 核心特性

| 能力 | 说明 |
| --- | --- |
| **多类型报告** | `research_report`（快速报告）、`detailed_report`（详细报告）、`deep_research`（深度研究）、`outline_report`、`resource_report` |
| **Web + 本地检索** | Web 检索与本地文档（PDF / TXT / DOCX / CSV 等）混合研究 |
| **多种检索器** | 内置 20+ 检索器：`tavily`、`google`、`bing`、`duckduckgo`、`brave`、`serper`、`serpapi`、`searchapi`、`searx`、`exa`、`arxiv`、`pubmed_central`、`semantic_scholar`、`openalex`、`bocha`、`crw`、`groundroute`、`xquik`、`getxapi`、`mcp` 等 |
| **多 LLM 提供商** | Fast / Smart / Strategic 三级模型可分别配置，支持 OpenAI、Anthropic、Azure、Ollama、Gemini、Bedrock 等 |
| **上下文过滤** | 支持 TypeSafe Jev、关键词排序、向量压缩等多种上下文筛选策略 |
| **多智能体** | `multi_agents/` 提供基于 LangGraph 与 AG2 的多智能体协作研究 |
| **MCP 支持** | 既可作为 MCP 客户端接入外部工具，也提供 MCP Server 供 Claude 等客户端调用 |
| **实时进度推送** | 通过 WebSocket 实时推送研究路径、子问题、来源与日志 |
| **历史记录持久化** | 报告 JSON 落盘保存，支持列表、查询、编辑、删除与追问 |
| **多格式导出** | 报告可导出为 PDF / DOCX / Markdown / JSON |
| **移动端适配** | 移动端复用与桌面端一致的研究链路（推理链条 / 来源 / 报告） |

---

## 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                    前端 Frontend (Next.js)                    │
│  App Router · React 18 · Tailwind · WebSocket 实时渲染        │
│  ├─ app/page.tsx                 首页 / 研究入口              │
│  ├─ app/research/[id]/page.tsx   历史研究回放页               │
│  └─ components/mobile/*          移动端布局与内容             │
└───────────────┬──────────────────────────────────────────────┘
                │  HTTP / WebSocket
                ▼
┌──────────────────────────────────────────────────────────────┐
│                  后端 Backend (FastAPI)                       │
│  backend/server/app.py                                        │
│  ├─ /ws                WebSocket，研究任务主通道              │
│  ├─ /report/           发起研究                               │
│  ├─ /api/reports*      历史记录 CRUD / 追问                   │
│  ├─ /api/download/*    报告附件下载                           │
│  └─ /outputs /site /static  静态文件挂载                      │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│               核心库 gpt_researcher（研究引擎）               │
│  agent.py → skills/* → retrievers/* → scraper/*               │
│  context/* 上下文过滤 · harness/* 阶段与重试 · llm_provider/* │
└──────────────────────────────────────────────────────────────┘
```

### 一次研究的完整数据流

1. 前端通过 `useWebSocket` 连接 `ws://<host>/ws`，`onopen` 时下发
   `{ task, report_type, report_source, tone, query_domains, mcp_enabled, mcp_strategy, mcp_configs }`。
2. 后端 `GPTResearcher` 触发研究：拆分**子查询** → 并行检索 → **抓取**页面 → **上下文过滤/压缩**。
3. 研究过程中的每一步（推理路径、子问题、来源、日志）通过 WebSocket 增量推送，
   前端实时渲染推理链条与来源列表。
4. 撰写阶段生成最终报告（Markdown），并导出 DOCX / PDF / JSON 到 `outputs/`。
5. 报告元数据写入 `ReportStore`（`data/reports.json`），前端可在历史页按 `research_id` 回放。
6. 用户在报告页追问时，走 `/api/reports/{id}/chat`（或 `/api/chat`）继续对话。

---

## 目录结构

```
research-agent/
├── main.py                    # 后端启动入口（FastAPI + uvicorn）
├── backend/                   # 后端应用层
│   ├── server/
│   │   ├── app.py             # FastAPI 应用与全部路由
│   │   ├── report_store.py    # 报告持久化（JSON 落盘）
│   │   ├── server_utils.py    # 研究执行、格式导出等工具
│   │   ├── multi_agent_runner.py
│   │   └── websocket_manager.py
│   ├── report_type/           # basic_report / detailed_report / deep_research
│   ├── chat/                  # 报告追问对话
│   ├── memory/                # 研究草稿与上下文记忆
│   ├── utils.py               # PDF/DOCX 导出等
│   └── run_server.py          # 备选启动入口
├── gpt_researcher/            # 核心研究引擎（Python 包）
│   ├── agent.py               # GPTResearcher 主类
│   ├── skills/                # researcher / writer / curator / deep_research 等
│   ├── retrievers/            # 各检索器实现
│   ├── scraper/               # 网页 / PDF / 浏览器抓取
│   ├── context/               # 上下文过滤与压缩
│   ├── llm_provider/          # 各 LLM 提供商适配
│   ├── mcp/                   # MCP 客户端与服务端
│   ├── harness/               # 阶段编排、重试、运行日志
│   ├── config/                # 配置与默认变量
│   └── vector_store/          # 向量存储适配
├── frontend/
│   ├── nextjs/                # Next.js 前端（主用）
│   └── index.html             # 原生 JS 静态版前端
├── multi_agents/              # LangGraph / AG2 多智能体
├── deep_agents/               # DeepResearch Benchmarks 与基准
├── evals/                     # 质量 / 幻觉 / 上下文过滤评估
├── docs/                      # Docusaurus 文档站
├── outputs/                   # 生成的研究报告（运行时产物）
├── data/                      # 报告与运行日志（reports.json / run_log.jsonl）
├── tests/                     # 测试
├── docker-compose.yml
├── Dockerfile                 # 后端镜像
├── Dockerfile.fullstack       # 前后端一体镜像
└── pyproject.toml             # poetry 依赖与项目元数据
```

---

## 快速开始

### 环境要求

- **Python** ≥ 3.12
- **Node.js** ≥ 18（运行 Next.js 前端）
- 依赖管理：**poetry**（项目自带 `.venv`）

### 1. 安装后端依赖

```bash
poetry install
```

或使用 `uv`：

```bash
uv sync
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，至少填写一个大模型 Key 与一个检索器 Key：

```ini
OPENAI_API_KEY=sk-xxxxxxxx
TAVILY_API_KEY=tvly-xxxxxxxx
```

> 本项目默认检索器为 `tavily`。若改用其他检索器，请同步设置对应的 `*_API_KEY`。

### 3. 启动后端

**务必在项目根目录下启动**（`app.mount("/outputs", StaticFiles(directory="outputs"))`
使用的是相对路径，换目录会导致静态文件 404）：

```bash
python main.py
```

默认监听 `http://0.0.0.0:8000`。也可使用备选入口：

```bash
python backend/run_server.py     # 自动 chdir 到 backend/ 并以 reload 模式启动
```

### 4. 启动前端

```bash
cd frontend/nextjs
npm install --legacy-peer-deps
npm run dev
```

默认监听 `http://localhost:3000`。

若前后端端口与默认值不同，在 `frontend/nextjs/.env.local` 中指定后端地址：

```ini
NEXT_PUBLIC_GPTR_API_URL=http://localhost:8010
```

前端解析后端地址的优先级为：
`localStorage.GPTR_API_URL` → URL 参数 `GPTR_API_URL` → `NEXT_PUBLIC_GPTR_API_URL` → `REACT_APP_GPTR_API_URL` → 默认 `http://localhost:8000`。

> **端口冲突提示**：若 `8000` / `3000` 被其他服务占用，
> 可将后端改为其他端口（例如 8010）启动，并同步修改 `.env.local` 中的 `NEXT_PUBLIC_GPTR_API_URL`。

---

## 后端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/` | 首页（`/site` 静态页面） |
| `GET` | `/.well-known/agent-discovery.json` | 智能体发现信息 |
| `GET` | `/report/{research_id}` | 按 ID 获取报告页面 |
| `GET` | `/api/download/{file_path:path}` | **附件下载**（`Content-Disposition: attachment`） |
| `GET` | `/api/reports` | 历史报告列表 |
| `POST` | `/api/reports` | 保存报告 |
| `GET` / `PUT` / `DELETE` | `/api/reports/{research_id}` | 查询 / 更新 / 删除报告 |
| `GET` / `POST` | `/api/reports/{research_id}/chat` | 报告追问对话 |
| `POST` | `/report/` | 发起研究（HTTP） |
| `GET` | `/files/` | 列出已上传文档 |
| `DELETE` | `/files/{filename}` | 删除已上传文档 |
| `POST` | `/api/multi_agents` | 多智能体研究 |
| `POST` | `/upload/` | 上传本地研究文档 |
| `WS` | `/ws` | **研究任务主通道（WebSocket）** |
| `POST` | `/api/chat` | 通用对话接口 |

静态挂载：`/outputs`（研究报告产物）、`/site`（前端静态资源）、`/static`（前端静态目录）。

### WebSocket 消息约定

- **客户端 → 服务端（连接建立时）**：
  `task`、`report_type`、`report_source`、`tone`、`query_domains`、`mcp_enabled`、`mcp_strategy`、`mcp_configs`
- **服务端 → 客户端**：`type` 为 `question` / `report` / `report_complete` / `path` / `logs`，
  其中 `content` 为 `subqueries`（子问题）或 `added_source_url`（新增来源）
- 客户端每 30s 发送一次 `ping` 心跳保活

---

## 本项目定制点

相较上游 GPT Researcher，本部署版本做了以下改造：

1. **PDF 引擎替换为 xhtml2pdf**
   Windows 环境缺少 GTK / pango，WeasyPrint 会静默失败（生成空 PDF 路径）。
   已改用纯 Python 的 **xhtml2pdf**（依赖 `reportlab`），并内嵌 CJK 字体、
   通过 `ResourceAccessPolicy` 放开本地资源访问。
   `pyproject.toml` 中仍保留非 Windows 平台的 `weasyprint` 依赖。

2. **新增报告附件下载接口 `/api/download/{file_path:path}`**
   直接访问 `/outputs/xxx.md` 会被浏览器**内联渲染**（Markdown / PDF / JSON 不会下载），
   且跨域场景下 HTML 的 `download` 属性会被忽略。
   新接口统一返回 `Content-Disposition: attachment`，并对路径做**目录穿越防护**
   （解析后的文件必须位于 `outputs/` 内）。

3. **报告下载按钮改走附件接口**
   前端 `AccessReport` 的 **PDF / DOCX / Markdown / JSON** 四个按钮全部指向
   `/api/download/...`，并移除 `target="_blank"`，
   确保点击即下载而非新标签页预览。

4. **移动端复用完整研究链路**
   移动端不再走简化的 `/api/chat` 分支，而是与桌面端共用同一套研究流程，
   渲染**推理链条、来源列表与报告**。

5. **Windows 路径归一化**
   后端写入报告路径时统一将 `\` 归一化为 `/`，
   避免 `outputs\report.md` 这类反斜杠路径产生失效的下载链接。

6. **持久化层精简**
   移除 MongoDB 相关服务，报告统一由 `ReportStore` 落盘为 JSON（`data/reports.json`）。

---

## 配置项

常用环境变量（完整列表见 `.env.example`）：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 大模型 API Key | — |
| `TAVILY_API_KEY` | Tavily 检索 Key | — |
| `RETRIEVER` | 默认检索器 | `tavily` |
| `FAST_LLM` | 快速模型 | `openai:gpt-5.4-mini` |
| `SMART_LLM` | 智能模型 | `openai:gpt-5.4` |
| `STRATEGIC_LLM` | 战略模型 | `openai:gpt-5.4` |
| `MAX_SEARCH_RESULTS_PER_QUERY` | 单次查询最大结果数 | `5` |
| `DOC_PATH` | 本地文档目录 | `./my-docs` |
| `TYPESAFE_API_KEY` | 启用 Jev 上下文过滤 | — |
| `CONTEXT_FILTER` | 上下文过滤策略 | `auto` |
| `MAX_SCRAPER_WORKERS` | 最大并抓取 worker 数 | `15` |
| `SCRAPER_RATE_LIMIT_DELAY` | 抓取最小间隔（秒） | `0.0` |
| `COMPRESSION_THRESHOLD` | 跳过压缩的字符阈值 | `8000` |
| `ALLOW_PRIVATE_URLS` | 放行内网 / 本地地址（SSRF 防护开关） | 关闭 |
| `FIRECRAWL_CONCURRENCY` | FireCrawl 并发浏览器数 | `2` |
| `NEXT_PUBLIC_GPTR_API_URL` | 前端访问的后端地址 | `http://localhost:8000` |

> 默认 Fast / Smart / Strategic 模型均为 OpenAI `gpt-5.4` 系列。
> 若使用长输出模型（Claude 4.x / GPT-5），建议按模型能力调高
> `FAST_TOKEN_LIMIT` / `SMART_TOKEN_LIMIT` / `STRATEGIC_TOKEN_LIMIT`，避免报告被截断。

---

## Docker 部署

```bash
# 后端镜像
docker build -t research-agent -f Dockerfile .

# 前后端一体镜像
docker build -t research-agent-fullstack -f Dockerfile.fullstack .

# 使用 docker-compose 启动
docker compose up
```

生产环境也可通过 Procfile 方式启动（如 Heroku / Railway）：

```
uvicorn backend.server.app:app --host=0.0.0.0 --port=${PORT}
```

---

## 测试与评估

```bash
# 单元测试
pytest

# 研究质量评估
python evals/quality_eval/run_eval.py

# 幻觉评估
python evals/hallucination_eval/run_eval.py

# DeepResearch Benchmarks
python deep_agents/benchmark.py
```

---

## 许可证与致谢

本项目基于 [assafelovic/gpt-researcher](https://github.com/assafelovic/gpt-researcher)
（v0.16.0）二次开发，遵循 **MIT License**，详见 [LICENSE](LICENSE)。

感谢 GPT Researcher 及其贡献者提供的研究引擎与基础设施。