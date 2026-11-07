(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))n(i);new MutationObserver(i=>{for(const o of i)if(o.type==="childList")for(const a of o.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function s(i){const o={};return i.integrity&&(o.integrity=i.integrity),i.referrerPolicy&&(o.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?o.credentials="include":i.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function n(i){if(i.ep)return;i.ep=!0;const o=s(i);fetch(i.href,o)}})();const G={solid:"实锤",inferred:"推断",consensus:"共识",divided:"分歧"},y={"ai-agent":{id:"ai-agent",topic:"AI 智能体（AI Agent）行业",domain:"AI 智能体",updatedAt:"2026-11-06",tags:["AI Agent","大模型","SaaS"],headline:{label:"2025 全球市场规模",value:"52 亿美元"},cagr:"72%",summary:"全球 AI Agent 市场处于爆发前夜，2025 年规模约 52 亿美元，预计 2028 年突破 300 亿美元，三年 CAGR 约 72%。价值捕获正从「模型能力」上移至「任务成功率 + 生态集成」。",takeaways:[{text:"2025 年全球 AI Agent 市场规模约 52 亿美元，预计 2028 年达 300 亿美元，三年 CAGR ≈ 72%。",strength:"solid",refs:[0,1]},{text:"中游「Agent 框架 / 编排平台」成为价值捕获关键环节，工程门槛集中于工具调用与多步推理的稳定性。",strength:"inferred",refs:[2]},{text:"竞争从「模型参数」转向「任务成功率 + 生态集成」，垂直行业 Agent 率先规模化落地。",strength:"consensus",refs:[2,3]},{text:"头部厂商以「平台化 + 插件市场」锁定分发入口，长尾厂商转向细分场景深耕。",strength:"inferred",refs:[3]}],followUpHints:["Agent 与 Copilot 的核心区别？","哪类场景付费意愿最强？","头部厂商的护城河是什么？"],citations:[{title:"Gartner：AI 技术成熟度曲线",source:"Gartner（演示来源）",date:"2026-10",strength:"solid"},{title:"全球 AI Agent 与智能自动化支出指南",source:"IDC（演示来源）",date:"2026-09",strength:"solid"},{title:"中国 AI Agent 行业白皮书",source:"36氪研究院（演示来源）",date:"2026-08",strength:"consensus"},{title:"AI Agent 产业链深度报告",source:"券商研究所（演示来源）",date:"2026-07",strength:"inferred"}],sections:[{heading:"行业概览",kind:"prose",paragraphs:["AI 智能体（Agent）指能够感知环境、自主规划并调用工具完成多步任务的软件实体，被视为大模型从「对话」走向「行动」的关键形态。2025 年起，随着工具调用（Function Calling）、多步推理与记忆能力的成熟，Agent 从演示性 Demo 进入企业级落地阶段。","当前行业的确定性来自两端：底层大模型持续降价让 Agent 的调用成本快速收敛，而企业侧对「提效而非对话」的诉求催生出可量化的 ROI 场景，客服、营销、代码开发与内部运营成为第一批规模化付费场景。"],deepDive:["Agent 与 Copilot 的核心差异在于「自主权边界」：Copilot 以人主导、AI 辅助为主，Agent 则把规划 → 执行 → 校验整条链路交给模型。","从付费意愿看，客服与代码开发场景的 ROI 最可量化，单位人效提升通常落在 20–40% 区间，是首批规模化付费的切入点。"]},{heading:"市场规模",kind:"chart",series:[{year:"2024",value:18},{year:"2025",value:52},{year:"2026",value:98},{year:"2027",value:176},{year:"2028",value:305}],unit:"亿美元"},{heading:"产业链图谱",kind:"bullets",depth:"deep",bullets:["上游 · 算力与模型：GPU 集群、基础大模型能力供给，决定 Agent 的「智力上限」与单次调用成本。","中游 · 框架与平台：工具调用、编排、记忆、评测与部署平台，是当前融资与竞争最密集的环节。","下游 · 垂直应用：客服、营销、代码、金融、政务等场景，以「行业知识 + 工作流」构建护城河。","配套 · 数据与安全：企业知识治理、权限隔离、可观测性与合规审计，成为企业采购的关键否决项。"]},{heading:"竞争格局",kind:"bars",depth:"deep",bars:[{name:"OpenAI（Operator / Agents）",pct:24},{name:"微软（Copilot Studio）",pct:19},{name:"Google（Gemini / Mariner）",pct:15},{name:"Anthropic（Claude / Computer Use）",pct:11},{name:"字节跳动（扣子 / 豆包）",pct:9},{name:"阿里（百炼 / 魔搭）",pct:7},{name:"其他",pct:15}],deepDive:["头部厂商的护城河已从模型参数转向「插件生态 + 企业级编排」：谁拥有更完整的工具生态与更低的接入成本，谁就掌握分发入口。","长尾厂商的突围路径集中在垂直行业知识库与合规能力，单一行业深度高于通用平台的广度。"]},{heading:"趋势研判",kind:"bullets",depth:"deep",bullets:["从「单点工具」到「端到端工作流」：Agent 的价值衡量指标从对话轮次转向任务完成率与端到端时间。","多 Agent 协作成为主流架构：规划者 + 执行者分工，通过共享记忆与仲裁机制提升复杂任务的稳定率。","成本结构再平衡：推理成本下降后，数据治理、评测与运维成本占比持续上升，工程能力重新成为壁垒。"]},{heading:"风险提示",kind:"bullets",depth:"deep",bullets:["幻觉与不可控行为仍制约高价值、低容错场景的大规模采用。","开源模型快速追赶可能压缩闭源平台的分发溢价。","数据安全与合规要求抬高企业私有化交付的边际成本。"]},{heading:"SWOT 分析",kind:"swot",depth:"deep",swot:{strengths:["大模型调用成本快速下降，Agent 落地门槛持续降低","工具调用与多步推理能力成熟，任务成功率显著提升"],weaknesses:["幻觉与不可控行为仍制约高价值场景","端到端稳定性与可观测性工程门槛较高"],opportunities:["企业「提效」诉求带来可量化的 ROI 场景","垂直行业 Agent 率先规模化付费"],threats:["开源模型快速追赶压缩闭源平台溢价","数据安全与合规抬高私有化交付成本"]}}]},humanoid:{id:"humanoid",topic:"人形机器人产业链",domain:"人形机器人",updatedAt:"2026-11-05",tags:["人形机器人","具身智能","制造"],headline:{label:"2025 中国出货量",value:"2.3 万台"},cagr:"124%",summary:"中国人形机器人出货量 2025 年约 2.3 万台，2030 年有望突破 130 万台，CAGR 约 124%。成本下探是放量的核心变量，单机 BOM 正从 60 万元向 15–20 万元收敛。",takeaways:[{text:"2025 年中国人形机器人出货量约 2.3 万台，预计 2030 年突破 130 万台，CAGR ≈ 124%。",strength:"solid",refs:[0]},{text:"成本下探是放量核心变量：单机 BOM 从 60 万向 15–20 万元收敛，谐波减速器与灵巧手降本空间最大。",strength:"inferred",refs:[1]},{text:"场景落地遵循「制造业牵引 → 商用服务渗透 → 家庭陪伴长尾」路径，汽车工厂成为首批规模化场景。",strength:"consensus",refs:[0,2]},{text:"投资重心从「整机」上移至「零部件（丝杠 / 传感器）+ 具身大脑」。",strength:"inferred",refs:[1,2]}],followUpHints:["降本的关键零部件是什么？","汽车工厂落地进展如何？","灵巧手的价值量有多大？"],citations:[{title:"人形机器人产业年度报告",source:"高工机器人（演示来源）",date:"2026-10",strength:"solid"},{title:"具身智能与灵巧手专题",source:"中信建投（演示来源）",date:"2026-09",strength:"inferred"},{title:"人形机器人供应链图谱",source:"东吴证券（演示来源）",date:"2026-06",strength:"consensus"}],sections:[{heading:"行业概览",kind:"prose",paragraphs:["人形机器人被视为具身智能的终极载体，2025 年行业正式从「样机展示」迈入「小批量交付」。以汽车工厂、3C 装配为代表的制造业场景率先给出可量化的节拍与良率需求，成为第一批规模化的真实订单来源。","产业化的核心矛盾是「性能 - 成本 - 场景」三角：只有当单机成本进入客户可接受区间，且任务成功率满足产线节拍，人形机器人才能在更多垂直场景复制推广。"],deepDive:["降本的关键在「传动与执行」：谐波减速器与滚柱丝杠占单机 BOM 比例最高，国产化替代后成本可下探 30–50%。","汽车工厂是目前落地确定性最高的场景，主打「搬运 + 上下料 + 简单装配」，对重复定位精度与节拍的验收标准相对清晰。"]},{heading:"出货量预测",kind:"chart",series:[{year:"2024",value:.6},{year:"2025",value:2.3},{year:"2026",value:9},{year:"2027",value:27},{year:"2028",value:65}],unit:"万台"},{heading:"产业链图谱",kind:"bullets",depth:"deep",bullets:["上游 · 核心零部件：谐波减速器、行星滚柱丝杠、力/触觉传感器、空心杯电机，构成主要 BOM 与毛利率来源。","中游 · 本体与整机：运动控制、整机集成与量产能力，龙头公司开始自研核心关节以摊薄成本。","下游 · 场景与应用：汽车工厂、物流分拣、商用服务与家庭陪伴，付费意愿与场景成熟度差异巨大。","配套 · 具身大脑：视觉语言模型 + 操作数据集，决定机器人「泛化能力」的天花板。"]},{heading:"整机厂商格局",kind:"bars",depth:"deep",bars:[{name:"优必选",pct:16},{name:"宇树科技",pct:14},{name:"特斯拉（Optimus）",pct:13},{name:"智元机器人",pct:10},{name:"傅利叶智能",pct:8},{name:"Figure AI",pct:7},{name:"其他",pct:32}],deepDive:["头部厂商的差异已从「能否动起来」转向「能否在真实产线上以可接受的良率连续运行」，量产工程能力成为分水岭。","自研核心关节成为龙头的共同选择：既能摊薄 BOM，也能在供应链上获得更高的议价与交付确定性。"]},{heading:"趋势研判",kind:"bullets",depth:"deep",bullets:["降本主线清晰：从「丝杠、减速器国产化」到「零部件复用平台化」，单机成本年降 20–30%。","具身智能数据集成为新壁垒：高质量操作数据的采集与合成，是拉开算法差距的核心变量。","制造场景先行、服务场景跟进，家庭场景商业化仍需跨越安全与价格两道门槛。"]},{heading:"风险提示",kind:"bullets",depth:"deep",bullets:["量产爬坡不及预期导致零部件价格战提前到来。","具身智能模型泛化能力不足，任务成功率未达产线节拍要求。","海外供应链与出口管制政策的不确定性。"]},{heading:"风险矩阵",kind:"risk",depth:"deep",risks:[{name:"量产爬坡不及预期",likelihood:4,impact:5},{name:"具身智能模型泛化不足",likelihood:4,impact:4},{name:"零部件价格战提前到来",likelihood:3,impact:4},{name:"海外供应链与出口管制",likelihood:3,impact:3},{name:"家庭场景安全与价格门槛",likelihood:2,impact:3}]}]},perovskite:{id:"perovskite",topic:"钙钛矿光伏电池",domain:"钙钛矿光伏",updatedAt:"2026-11-04",tags:["光伏","钙钛矿","新能源"],headline:{label:"2025 新增产能",value:"8 GW"},cagr:"约 65%",summary:"钙钛矿单结组件量产效率已达 18–20%，叠层电池实验室效率突破 34%。2025 年新增产能约 8 GW，预计 2028 年达 60 GW，GW 级产线进入跑通验证期。",takeaways:[{text:"单结钙钛矿组件量产效率已达 18–20%，叠层电池实验室效率突破 34%，成本较晶硅更低。",strength:"solid",refs:[0,1]},{text:"2025 年钙钛矿（含叠层）新增产能约 8 GW，预计 2028 年达 60 GW，GW 级产线进入跑通验证期。",strength:"consensus",refs:[0]},{text:"稳定性与大面积效率损失仍是量产最大瓶颈，组件寿命正从 1 万小时向 3 万小时（IEC 标准）攻关。",strength:"divided",refs:[0,2]},{text:"竞争由「效率军备竞赛」转向「工艺良率 + 设备国产化」，蒸镀 / 涂布设备厂商率先受益。",strength:"inferred",refs:[2]}],followUpHints:["叠层电池的商业化节奏？","设备国产化到什么程度？","稳定性的核心技术路线？"],citations:[{title:"钙钛矿光伏产业化进展",source:"CPIA（演示来源）",date:"2026-10",strength:"solid"},{title:"钙钛矿电池能量转换效率纪录表",source:"NREL（演示来源）",date:"2026-09",strength:"solid"},{title:"钙钛矿设备与工艺专题",source:"华西证券（演示来源）",date:"2026-07",strength:"inferred"}],sections:[{heading:"行业概览",kind:"prose",paragraphs:["钙钛矿光伏凭借其低温溶液法制备、短流程与可叠层等特性，被视为打破晶硅成本天花板的下一代光伏技术。2025 年单结组件效率与稳定性双双突破，多家企业的 GW 级产线进入中试与量产验证。","与传统晶硅的竞争并非「替代」而是「并存 + 叠层」：晶硅/钙钛矿叠层可将组件效率进一步提升，是对既有制程的增强而非颠覆。"],deepDive:["叠层电池是效率的商业化主线：晶硅 / 钙钛矿叠层可在现有 PERC/TOPCon 产线上做增量升级，与存量产能协同而非冲突。","设备国产化进展快于预期：蒸镀与涂布设备已有多条自制产线跑通，核心工艺参数逐步收敛，是降本的关键支点。"]},{heading:"新增产能预测",kind:"chart",series:[{year:"2024",value:1.2},{year:"2025",value:8},{year:"2026",value:18},{year:"2027",value:36},{year:"2028",value:60}],unit:"GW"},{heading:"产业链图谱",kind:"bullets",depth:"deep",bullets:["上游 · 材料与设备：前驱体材料、靶材、蒸镀机、涂布机与激光划线设备，国产化率快速提升。","中游 · 电池与组件：单结 / 叠层电池工艺、大面积成膜与封装，良率是量产竞争的分水岭。","下游 · 电站与应用：BIPV、汽车集成与柔性场景，差异化溢价高于传统地面电站。","配套 · 检测与标准：稳定性测试标准与户外实证数据，影响下游规模化采购信心。"]},{heading:"厂商布局",kind:"bars",depth:"deep",bars:[{name:"协鑫光电",pct:22},{name:"仁烁光能",pct:16},{name:"极电光能",pct:14},{name:"纤纳光电",pct:12},{name:"曜能科技",pct:9},{name:"其他",pct:27}],deepDive:["竞争焦点从「单点效率纪录」转向「GW 级产线的平均良率与出货一致性」，实验室效率与量产效率的差值正在收窄。","头部厂商开始绑定设备与材料供应商共建生态，以锁定工艺经验与扩产节奏，形成先发壁垒。"]},{heading:"趋势研判",kind:"bullets",depth:"deep",bullets:["叠层化是效率主线：晶硅 / 钙钛矿叠层组件效率持续上探，打开地面电站的应用空间。","稳定性质变即将发生：封装工艺与材料体系成熟后，组件寿命与可靠性将不再是致命短板。","设备国产化成为降本关键：蒸镀与涂布设备的工艺成熟度，直接决定 GW 级产线的良率与成本。"]},{heading:"风险提示",kind:"bullets",depth:"deep",bullets:["稳定性和大面积效率损失尚未彻底解决，量产良率可能低于预期。","光伏行业整体产能过剩可能压制钙钛矿的溢价空间。","材料含铅问题面临环保与回收的政策压力。"]}]}},be=["AI Agent 行业","人形机器人产业链","钙钛矿光伏"];function ee(e,t){const s=e.sections.find(r=>r.kind==="bars"),n=((s==null?void 0:s.bars)??[]).slice(0,4).map(r=>r.name.split("（")[0].split("(")[0]),i=n.length>=3?n:[`${e.domain}头部A`,`${e.domain}头部B`,`${e.domain}新锐C`],o=e.sections.filter(r=>["prose","chart","bullets","bars"].includes(r.kind)).slice(1,5).map(r=>r.heading),a=[];i.forEach((r,h)=>{o.forEach((E,g)=>{let f="covered";g===o.length-1&&(h===0||h===i.length-1)&&(f="gap"),t==="deep"&&h===i.length-1&&g===0&&(f="unresolved");const C=f==="covered"?`${r} · ${E} 已覆盖`:f==="gap"?"缺口 · 待补充":"口径待确认";a.push({company:r,dim:E,status:f,summary:C})})});const c=a.filter(r=>r.status==="covered").length,p=a.length?Math.round(c/a.length*100)/100:0,m=e.citations.map((r,h)=>({id:`ev-${h+1}`,title:r.title,source:r.source,credibility:r.strength==="solid"?.9:r.strength==="consensus"?.72:.55,level:r.strength==="solid"?1:2})),d=e.takeaways.map((r,h)=>({id:`cl-${h+1}`,text:r.text,strength:r.strength,evidenceIds:r.refs.map(E=>`ev-${E+1}`),role:h%2===0?"collector":"verifier"}));return{intent:`调研 ${e.domain}`,companies:i,dims:o,cells:a,coverage:p,evidences:m,claims:d}}const ke=document.querySelector("#app"),we=["ai-agent","humanoid","perovskite"];let A="deep",te=!1,P="dark",B="pro";const se={pro:"研衡 Pro",turbo:"研衡 Turbo",claude:"Claude",gpt:"GPT-4o"},xe=["汽车出口","美妆零售","AI 智能体","人形机器人","钙钛矿光伏","跨境电商","新能源汽车","半导体","生物医药","低空经济","储能","具身智能","消费电子","SaaS 出海","工业软件","氢能","智能驾驶","医疗器械","宠物经济","出海品牌","数字营销","算力租赁","光伏组件","创新药","连锁餐饮","预制菜","咖啡连锁","银发经济","合成生物","卫星互联网"],ne="yanheng.theme";function Ee(e){P=e,document.documentElement.dataset.theme=e,localStorage.setItem(ne,e);const t=document.getElementById("themeBtn");t&&(t.textContent=e==="dark"?"☾":"☀")}function Le(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}const l=Le;function F(e){const t=String(e.getHours()).padStart(2,"0"),s=String(e.getMinutes()).padStart(2,"0");return`${t}:${s}`}const W={inT:600,outT:1400,cost:.05};function R(e){const t=e==="deep"?4200:1800,s=e==="deep"?11800:3200,n=Math.round((t*1e-5+s*3e-5)*100)/100;return{inT:t,outT:s,cost:n}}function V(e){const t=e.inT+e.outT;return`<span class="msg-cost">token ${t>=1e3?`${parseFloat((t/1e3).toFixed(1))}k`:`${t}`}</span><span class="msg-cost">¥${e.cost.toFixed(2)}</span>`}function ae(e){document.querySelectorAll(".depth-opt").forEach(t=>{t.classList.toggle("active",t.dataset.depth===e)})}function _(e){var s;te=e,document.querySelectorAll(".depth-opt").forEach(n=>{n.disabled=e}),(s=document.getElementById("depthToggle"))==null||s.classList.toggle("locked",e);const t=document.querySelector(".depth-label");t&&(t.textContent=e?"报告深度 · 已锁定":"报告深度")}let $=[],M=[],w=0,z=0,N=0,I=null,v=null;const ie="yanheng.conversations",oe="yanheng.todaySpend";function b(){localStorage.setItem(ie,JSON.stringify($)),localStorage.setItem(oe,String(w))}function Ie(){const e=localStorage.getItem(ie);if(e===null)return!1;try{const t=JSON.parse(e);if(Array.isArray(t))return $=t.map(s=>({...s,messages:s.messages??[]})),z=$.reduce((s,n)=>Math.max(s,Number(n.id.replace("c",""))||0),0),w=Number(localStorage.getItem(oe))||0,!0}catch{}return!1}function Se(){$=[{reportId:"ai-agent",time:"今天 14:20",depth:"deep"},{reportId:"humanoid",time:"昨天 09:41",depth:"deep"},{reportId:"perovskite",time:"11-04 16:05",depth:"simple"}].map(t=>{const s=y[t.reportId],n=R(t.depth);return{id:`c${++z}`,reportId:t.reportId,title:s.topic,domain:s.domain,time:t.time,depth:t.depth,cost:n.cost,messages:[]}}),w=$.reduce((t,s)=>t+s.cost,0),b()}function Ae(){M=[{id:`t${++N}`,reportId:"ai-agent",depth:"deep",freq:"每周",time:"09:00"},{id:`t${++N}`,reportId:"perovskite",depth:"simple",freq:"每月",time:"08:30"}]}function Ce(e,t){const s=R(t),n=`c${++z}`,i={id:n,reportId:e.id,title:e.topic,domain:e.domain,time:F(new Date),depth:t,cost:s.cost,messages:[]};return $.unshift(i),w+=s.cost,I=n,v=i,b(),x(),i}function Te(e){Y(),v=e,I=e.id,A=e.depth,ae(e.depth),_(!0),(!e.messages||e.messages.length===0)&&(e.messages=[{type:"user",text:y[e.reportId].topic},{type:"report",reportId:e.reportId,depth:e.depth}],b()),Me(e.messages),x()}function Be(e,t,s){const n=`sup-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,i=t.map((a,c)=>ce(a,c)).join(""),o=`<ul class="bullets">${s.map(a=>`<li>${l(a)}</li>`).join("")}</ul>`;return`
    <div class="msg agent" data-role="follow-agent" data-label="${l(e)}">
      <div class="msg-head">
        <div class="avatar">研</div>
        <div class="agent-meta">
          <div class="agent-name">研衡 Agent</div>
          <div class="agent-domain">${l(e)}</div>
        </div>
      </div>
      <div class="trace" id="trace-${n}">${i}</div>
      <div class="follow-body" id="body-${n}">${o}</div>
      <div class="msg-foot">
        <span class="agent-time">${F(new Date)}</span>
        ${V(W)}
        ${H(!1)}
      </div>
    </div>`}function Me(e){const t=document.getElementById("chat");t.innerHTML="";let s=0;for(const n of e)if(n.type==="user"||n.type==="follow-user")t.insertAdjacentHTML("beforeend",J(n.text,n.type));else if(n.type==="report"){const i=y[n.reportId],o=`${i.id}-${Date.now()}-${s++}`,a=ee(i,n.depth),c=R(n.depth);t.insertAdjacentHTML("beforeend",re(o,i,a,c,B,n.depth));const p=document.getElementById(`report-${o}`);pe(p,i,n.depth),ue(`follow-${o}`,i)}else n.type==="follow-agent"&&t.insertAdjacentHTML("beforeend",Be(n.label,n.steps,n.bullets));t.querySelectorAll(".pipe-node, .stage, .worker").forEach(n=>{n.classList.add("done")}),t.querySelectorAll(".task-timer").forEach(n=>{n.textContent="完成"}),t.querySelectorAll(".step").forEach(n=>{n.classList.remove("pending","running"),n.classList.add("done")}),L("已完成","ok"),O()}function He(e){const t=$.find(s=>s.id===e);$=$.filter(s=>s.id!==e),t&&(w=Math.max(0,w-t.cost)),I===e&&(I=null,v=null),b(),x()}function qe(){$=[],w=0,I=null,v=null,b(),x()}function je(e){const t=e.depth==="deep"?"深度":"简版";return`
    <div class="history-item${e.id===I?" active":""}" data-conv="${e.id}">
      <button class="hi-body" data-conv="${e.id}" title="点击回放此对话">
        <div class="hi-top">
          <div class="hi-title">${l(e.title)}</div>
          <div class="hi-cost">¥${e.cost.toFixed(2)}</div>
        </div>
        <div class="hi-meta">
          <span class="hi-domain">${l(e.domain)} · ${t}</span>
          <span class="hi-time">${l(e.time)}</span>
        </div>
      </button>
      <button class="hi-del" data-del="${e.id}" title="删除此对话">✕</button>
    </div>`}function De(e){return`
    <div class="task-item" data-task="${e.id}">
      <div class="task-head">
        <div class="task-title">${l(y[e.reportId].domain)}</div>
        <button class="task-del" data-del="${e.id}" title="删除">✕</button>
      </div>
      <div class="task-meta">
        <span>${e.freq} · ${l(e.time)}</span>
        <span class="task-depth">${e.depth==="deep"?"深度":"简版"}</span>
      </div>
    </div>`}function x(){const e=document.getElementById("convList"),t=document.getElementById("taskList"),s=document.getElementById("convCount"),n=document.getElementById("totalSpend");e.innerHTML=$.map(je).join(""),t.innerHTML=M.map(De).join(""),s.textContent=String($.length),n.textContent=`今日 ¥${w.toFixed(2)}`}function Pe(){return`
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">研</div>
          <div class="brand-text">
            <div class="brand-name">研衡</div>
            <div class="brand-sub">YANHENG · 行业调研助手</div>
          </div>
        </div>
        <div class="demo-badge">DEMO · 虚拟数据</div>
        <button class="new-btn" id="newBtn"><span class="plus">＋</span> 新建调研</button>

        <div class="side-scroll">
          <div class="history">
            <div class="history-label">历史对话 <span class="count" id="convCount"></span>
              <button class="clear-convs" id="clearConvs" title="清空历史">清空</button>
            </div>
            <div class="history-list" id="convList"></div>
          </div>
          <div class="history tasks">
            <div class="history-label">定时任务 <button class="add-task" id="addTask" title="新建定时任务">＋</button></div>
            <div class="task-list" id="taskList"></div>
          </div>
        </div>

        <div class="sidebar-foot">
          <span class="dot"></span><span class="foot-text">Agent 在线</span>
          <span class="spend" id="totalSpend">今日 ¥0.00</span>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div class="crumb">调研台 / 新建任务</div>
          <div class="topbar-right">
            <button class="compare-btn" id="compareBtn">⇄ 双行业对比</button>
            <button class="theme-btn" id="themeBtn" title="切换深浅色主题">☾</button>
            <div class="status" id="agentStatus" data-state="idle">
              <span class="status-dot"></span>
              <span id="statusText">待命中</span>
            </div>
          </div>
        </header>

        <section class="chat" id="chat"></section>

        <footer class="composer" id="composer">
          <div class="search-box">
            <div class="search-left-group">
              <div class="depth-toggle" id="depthToggle">
                <button class="depth-opt" data-depth="simple">简单</button>
                <button class="depth-opt active" data-depth="deep">深度</button>
              </div>
              <span class="divider"></span>
              <div class="model-select-wrapper">
                <select class="model-select" id="modelSelect" title="选择模型">
                  <option value="pro">研衡 Pro</option>
                  <option value="turbo">研衡 Turbo</option>
                  <option value="claude">Claude</option>
                  <option value="gpt">GPT-4o</option>
                </select>
                <svg class="model-select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <textarea id="input" class="search-input" rows="1" placeholder="输入你想调研的行业或主题…"></textarea>
            <button id="send" class="send-btn" aria-label="发送">发送</button>
          </div>
          <div class="hint"><span class="model-hint" id="modelHint"></span>Enter 发送 · Shift+Enter 换行 · 深度/追问/定时任务 · 本 Demo 全部为虚拟数据</div>
        </footer>
      </main>
    </div>`}function le(){return`
    <div class="welcome" id="welcome">
      <div class="welcome-kicker">INDUSTRY INTELLIGENCE</div>
      <h1 class="welcome-title">想了解哪个行业？把问题交给<em>研衡</em>。</h1>
      <p class="welcome-sub">选「简单 / 深度」，输入主题即可生成报告，报告内支持继续追问。</p>
      <div class="welcome-actions">${be.map(Fe).join("")}</div>
    </div>`}function Oe(){return`<div class="word-wall" id="wordWall" aria-hidden="true">${[0,1,2,3,4].map(t=>{const n=xe.slice(t*6,t*6+6).map(i=>`<span class="ww-word">${l(i)}</span>`).join("");return`<div class="ww-row">${n}${n}</div>`}).join("")}</div>`}function Fe(e){return`<button class="chip" data-query="${l(e)}">${l(e)}<svg class="chip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg></button>`}function Y(){var n;const e=document.querySelector(".main"),t=document.getElementById("chat"),s=document.getElementById("composer");s.parentElement!==e&&e.appendChild(s),s.classList.remove("in-welcome"),s.classList.add("hidden"),t.classList.remove("welcome-mode"),(n=document.getElementById("wordWall"))==null||n.remove()}function de(){const e=document.getElementById("chat"),t=document.getElementById("composer");t.classList.remove("hidden"),t.classList.add("in-welcome"),e.appendChild(t),e.classList.add("welcome-mode"),document.getElementById("wordWall")||e.insertAdjacentHTML("afterbegin",Oe());const s=document.getElementById("input");s.placeholder="输入你想调研的行业或主题…",s.style.height="auto"}function Re(){const e=document.getElementById("chat");Y(),e.innerHTML=le(),de(),v=null,I=null,_(!1),x(),L("待命中","idle")}function ce(e,t){return`
    <div class="step pending">
      <div class="step-index">${t+1}</div>
      <div class="step-body">
        <div class="step-label">${l(e.label)}</div>
        <div class="step-detail">${l(e.detail)}</div>
      </div>
      <div class="step-check">✓</div>
    </div>`}function Ge(e){return{lead:"Lead · 规划者",collector:"Collector · 搜集",verifier:"Verifier · 核查",synthesizer:"Synthesizer · 合成"}[e]}function We(e){const t=`<div class="matrix-row matrix-head"><span class="matrix-company">公司 \\ 维度</span>${e.dims.map(n=>`<span class="matrix-dim">${l(n)}</span>`).join("")}</div>`,s=e.companies.map(n=>{const i=e.dims.map(o=>{const a=e.cells.find(p=>p.company===n&&p.dim===o);return`<span class="matrix-cell cell-${(a==null?void 0:a.status)??"gap"}" title="${l(n)} × ${l(o)}：${l((a==null?void 0:a.summary)??"")}"></span>`}).join("");return`<div class="matrix-row"><span class="matrix-company">${l(n)}</span>${i}</div>`}).join("");return`
    <div class="matrix">
      <div class="coverage">
        <div class="coverage-label">覆盖度 ${Math.round(e.coverage*100)}%</div>
        <div class="coverage-bar"><span class="coverage-fill" style="width:${Math.round(e.coverage*100)}%"></span></div>
      </div>
      <div class="matrix-grid">${t}${s}</div>
      <div class="matrix-legend">
        <span><i class="dot cell-covered"></i>已覆盖</span>
        <span><i class="dot cell-gap"></i>缺口</span>
        <span><i class="dot cell-unresolved"></i>待确认</span>
      </div>
    </div>`}function Ne(e){const t=e.map(s=>`
    <div class="ledger-row">
      <span class="ledger-id">${l(s.id)}</span>
      <span class="ledger-title">${l(s.title)}</span>
      <span class="level-tag level-${s.level}">L${s.level}</span>
      <span class="cred">${Math.round(s.credibility*100)}%</span>
    </div>`).join("");return`
    <div class="ledger">
      <div class="ledger-head">证据台账 · ${e.length} 条</div>
      ${t}
    </div>`}function Ue(e){const t=e.map(s=>`
    <div class="ledger-row claim-row">
      <span class="ledger-id">${l(s.id)}</span>
      <span class="ledger-title">${l(s.text)}</span>
      <span class="strength strength-${s.strength}">${G[s.strength]}</span>
      <span class="role-tag role-${s.role}">${Ge(s.role)}</span>
    </div>`).join("");return`
    <div class="ledger">
      <div class="ledger-head">结论台账 · ${e.length} 条</div>
      ${t}
    </div>`}function K(e){const t=e.querySelector(".task-timer");if(!t)return()=>{};const s=Date.now(),n=window.setInterval(()=>{t.textContent=`${((Date.now()-s)/1e3).toFixed(1)}s`},100);return()=>{window.clearInterval(n),t.textContent=`${((Date.now()-s)/1e3).toFixed(1)}s`}}function Ve(e){const s=[{key:"align",name:"Align"},{key:"collect",name:"Collect"},{key:"verify",name:"Verify"},{key:"synthesize",name:"Synthesize"}].map(n=>`
    <div class="pipe-node" data-stage="${n.key}">
      <span class="pipe-dot"></span>
      <span class="pipe-name">${n.name}</span>
    </div>`).join('<span class="pipe-edge"></span>');return`<div class="pipeline" id="pipeline-${e}">${s}</div>`}function q(e,t,s,n,i){return`
    <div class="stage" data-stage="${e}">
      <div class="stage-head">
        <span class="spinner"></span>
        <span class="role-badge role-${s}">${s.toUpperCase()}</span>
        <span class="stage-title">${t}</span>
        <span class="task-timer">--</span>
      </div>
      <div class="stage-body">
        ${i?`<div class="agent-line">${i}</div>`:""}
        ${n}
      </div>
    </div>`}function re(e,t,s,n,i,o){const a=s.dims.map((c,p)=>`
    <div class="worker">
      <div class="worker-head">
        <span class="spinner"></span>
        <span class="worker-name">Collector ${p+1}</span>
        <span class="worker-role">${l(c)}</span>
        <span class="task-timer">--</span>
      </div>
      <div class="worker-task">采集「${l(c)}」相关来源并抽取结构化结论</div>
    </div>`).join("");return`
    <div class="msg agent" data-role="report" data-reportid="${t.id}" data-depth="${o}">
      <div class="msg-head">
        <div class="avatar">研</div>
        <div class="agent-meta">
          <div class="agent-name">研衡 Agent</div>
          <div class="agent-domain">研究主题 · ${l(t.domain)} · ${l(se[i]??i)}</div>
        </div>
      </div>
      ${Ve(e)}
      <div class="stages" id="stages-${e}">
        ${q("align","Align · 前置对齐","lead",We(s),`Lead 生成研究矩阵：${s.companies.length} 家公司 × ${s.dims.length} 个维度`)}
        ${q("collect","Collect · 并行搜集","collector",`<div class="workers">${a}</div>${Ne(s.evidences)}`,"并行 fan-out 派发 Collector，更新证据台账")}
        ${q("verify","Verify · 交叉核查","verifier",Ue(s.claims),"缺口补充 + 证据可信度分级 + 结论标注证据强度")}
        ${q("synthesize","Synthesize · 合成报告","synthesizer","","聚合结论去重 + 一致性校验 → 生成报告")}
      </div>
      <div class="report" id="report-${e}"></div>
      <div class="msg-foot">
        <span class="agent-time">${F(new Date)}</span>
        ${V(n)}
        ${H(!1)}
      </div>
      ${et(t,e)}
    </div>`}const _e='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',ze='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',Ye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';function H(e){return`
    <div class="msg-actions">
      <button class="ma-btn" data-act="copy" title="复制">${_e}</button>
      ${e?`<button class="ma-btn" data-act="edit" title="修改">${ze}</button>`:""}
      <button class="ma-btn" data-act="del" title="删除">${Ye}</button>
    </div>`}function J(e,t="user"){return`
    <div class="msg user" data-role="${t}">
      <div class="user-bubble">${l(e)}</div>
      ${H(!0)}
    </div>`}function Je(e,t){const d=Math.max(...e.map(u=>u.value))*1.18,r=e.length,h=u=>50+(r===1?0:u*532/(r-1)),E=u=>22+182*(1-u/d),g=e.map((u,T)=>({...u,px:h(T),py:E(u.value)})),f=g.map(u=>`${u.px.toFixed(1)},${u.py.toFixed(1)}`).join(" "),C=`${f} ${h(r-1).toFixed(1)},${204 .toFixed(1)} ${h(0).toFixed(1)},${204 .toFixed(1)}`;let k="";for(let u=0;u<=4;u++){const T=22+182*u/4,ye=Math.round(d-d*u/4);k+=`<line x1="50" y1="${T.toFixed(1)}" x2="582" y2="${T.toFixed(1)}" class="grid" />`,k+=`<text x="42" y="${(T+4).toFixed(1)}" class="axis" text-anchor="end">${ye}</text>`}const S=g.map(u=>`<text x="${u.px.toFixed(1)}" y="224" class="axis tick" text-anchor="middle">${u.year}</text>`).join(""),fe=g.map(u=>`<circle cx="${u.px.toFixed(1)}" cy="${u.py.toFixed(1)}" r="3.5" class="dot" />`).join(""),$e=g.map(u=>`<text x="${u.px.toFixed(1)}" y="${(u.py-11).toFixed(1)}" class="vlabel" text-anchor="middle">${u.value}</text>`).join("");return`
    <svg viewBox="0 0 600 240" class="chart-svg" role="img" aria-label="${t} 趋势图">
      ${k}
      <path d="M${C}Z" class="area" />
      <polyline points="${f}" class="line" />
      ${fe}${$e}${S}
    </svg>
    <div class="chart-caption">单位：${l(t)} · 虚拟数据</div>`}function Ke(e){return`<div class="bars">${e.map(t=>`
    <div class="bar-row">
      <div class="bar-name">${l(t.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${t.pct}%"></div></div>
      <div class="bar-val">${t.pct}%</div>
    </div>`).join("")}</div>`}function Ze(e){const t=(s,n,i)=>`
    <div class="swot-cell ${i}">
      <div class="swot-cell-title">${s}</div>
      <ul>${n.map(o=>`<li>${l(o)}</li>`).join("")}</ul>
    </div>`;return`
    <div class="swot-grid">
      ${t("S · 优势",e.strengths,"swot-s")}
      ${t("W · 劣势",e.weaknesses,"swot-w")}
      ${t("O · 机会",e.opportunities,"swot-o")}
      ${t("T · 威胁",e.threats,"swot-t")}
    </div>`}function Qe(e){const t=n=>n>=4?"high":n===3?"mid":"low";return`<div class="risk-matrix">${e.map(n=>`
    <div class="risk-row">
      <span class="risk-name">${l(n.name)}</span>
      <span class="risk-metric">
        <span class="risk-tag risk-l-${t(n.likelihood)}">概率 ${n.likelihood}/5</span>
        <span class="risk-tag risk-i-${t(n.impact)}">影响 ${n.impact}/5</span>
      </span>
    </div>`).join("")}</div>`}function Xe(e,t){let s="";return t.kind==="prose"?s=`<div class="prose">${(t.paragraphs??[]).map(n=>`<p>${l(n)}</p>`).join("")}</div>`:t.kind==="bullets"?s=`<ul class="bullets">${(t.bullets??[]).map(n=>`<li>${l(n)}</li>`).join("")}</ul>`:t.kind==="chart"?s=`<div class="chart-wrap">${Je(t.series??[],t.unit??"")}</div>`:t.kind==="bars"?s=Ke(t.bars??[]):t.kind==="swot"?s=Ze(t.swot):t.kind==="risk"&&(s=Qe(t.risks??[])),`
    <section class="section">
      <div class="sec-head">
        <span class="sec-index">${String(e).padStart(2,"0")}</span>
        <h3 class="sec-title">${l(t.heading)}</h3>
        <button class="deepdive-btn" data-dive="${e-1}">深入 ↳</button>
      </div>
      ${s}
    </section>`}function pe(e,t,s){const n=s==="deep"?t.sections:t.sections.filter(d=>d.depth!=="deep"),i=t.tags.map(d=>`<span class="tag">${l(d)}</span>`).join(""),o=s==="deep"?"深度报告":"简版报告",a=(s==="deep"?t.takeaways:t.takeaways.slice(0,3)).map(d=>`
    <li>
      ${l(d.text)}
      <span class="strength strength-${d.strength}">${G[d.strength]}</span>
      <span class="trefs">${d.refs.map(r=>`[${r+1}]`).join("")}</span>
    </li>`).join(""),c=n.map((d,r)=>Xe(r+1,d)).join(""),p=t.citations.map((d,r)=>`<li><span class="src">[${r+1}]</span> ${l(d.title)} <span class="strength strength-${d.strength}">${G[d.strength]}</span> <span class="src-meta">· ${l(d.source)} · ${l(d.date)}</span></li>`).join("");e.innerHTML=`
    <div class="report-head">
      <div class="report-kicker">RESEARCH BRIEF · ${l(t.domain)}</div>
      <h2 class="report-title">${l(t.topic)}</h2>
      <div class="report-meta">${i}<span class="tag depth-tag">${o}</span><span class="updated">更新于 ${l(t.updatedAt)}</span></div>
      <p class="report-summary">${l(t.summary)}</p>
    </div>
    <div class="takeaways">
      <div class="takeaways-title">核心结论</div>
      <ol>${a}</ol>
    </div>
    ${c}
    <div class="citations">
      <div class="citations-title">参考来源</div>
      <ol>${p}</ol>
    </div>
    <p class="footnote">注：本报告全部数据与图表均为演示用虚拟数据，不构成任何投资建议。</p>`,e.querySelectorAll(".report-head, .takeaways, .section, .citations, .footnote").forEach((d,r)=>{d.classList.add("reveal"),d.style.animationDelay=`${r*90}ms`}),e.querySelectorAll(".deepdive-btn").forEach(d=>{d.addEventListener("click",()=>lt(t,n[Number(d.dataset.dive)]))})}function et(e,t){const s=e.followUpHints.map(n=>`<button class="follow-chip" data-q="${l(n)}">${l(n)}</button>`).join("");return`
    <div class="follow-up" id="follow-${t}">
      <div class="follow-title">继续追问</div>
      <div class="follow-chips">${s}</div>
      <div class="follow-row">
        <input class="follow-input" placeholder="针对本报告继续提问…" />
        <button class="follow-send">追问</button>
      </div>
    </div>`}function ue(e,t){const s=document.getElementById(e);if(!s)return;const n=s.querySelector(".follow-input"),i=s.querySelector(".follow-send");if(!n||!i)return;const o=a=>{const c=a.trim();c&&(n.value="",dt(t,c))};i.addEventListener("click",()=>o(n.value)),n.addEventListener("keydown",a=>{a.key==="Enter"&&(a.preventDefault(),o(n.value))}),s.querySelectorAll(".follow-chip").forEach(a=>{a.addEventListener("click",()=>o(a.dataset.q??""))})}function L(e,t){const s=document.getElementById("agentStatus"),n=document.getElementById("statusText");s&&(s.dataset.state=t),n&&(n.textContent=e)}function O(){const e=document.getElementById("chat");e&&(e.scrollTop=e.scrollHeight)}function tt(e,t,s){const n=Array.from(e.querySelectorAll(".step")),i=700,o=540;n.forEach((a,c)=>{setTimeout(()=>{a.classList.remove("pending"),a.classList.add("running")},c*i),setTimeout(()=>{a.classList.remove("running"),a.classList.add("done")},c*i+o)}),setTimeout(s,(n.length-1)*i+o+300)}function me(e,t){const s=document.getElementById("chat"),n=`${e.id}-${Date.now()}`,i=ee(e,t),o=R(t);s.insertAdjacentHTML("beforeend",re(n,e,i,o,B,t));const a=document.getElementById(`pipeline-${n}`),c=document.getElementById(`stages-${n}`),p=document.getElementById(`report-${n}`),m=Array.from(a.querySelectorAll(".pipe-node")),d=Array.from(c.querySelectorAll(".stage")),r=g=>(m[g].classList.add("running"),d[g].classList.add("running"),K(d[g])),h=(g,f)=>{m[g].classList.remove("running"),m[g].classList.add("done"),d[g].classList.remove("running"),d[g].classList.add("done"),f()};L("Lead Agent 规划中…","busy");const E=r(0);setTimeout(()=>{h(0,E),L("Collector 并行搜集…","busy");const g=r(1),f=Array.from(c.querySelectorAll('[data-stage="collect"] .worker')),C=f.map(k=>(k.classList.add("running"),K(k)));f.forEach((k,S)=>{setTimeout(()=>{k.classList.remove("running"),k.classList.add("done"),C[S]()},900+S*220)}),setTimeout(()=>{h(1,g),L("Verifier 核查中…","busy");const k=r(2);setTimeout(()=>{h(2,k),L("Synthesizer 合成中…","busy");const S=r(3);setTimeout(()=>{h(3,S),L("已完成","ok"),pe(p,e,t),ue(`follow-${n}`,e),O(),v&&(v.messages.push({type:"report",reportId:e.id,depth:t}),b())},900)},1300)},f.length*220+900+400)},900),O()}function ve(e){const t=e.toLowerCase();return t.includes("机器人")||t.includes("具身")||t.includes("humanoid")?y.humanoid:t.includes("钙钛矿")||t.includes("光伏")||t.includes("perovskite")?y.perovskite:y["ai-agent"]}function Z(e){const t=document.getElementById("chat");Y();const s=document.getElementById("welcome");s&&s.remove(),t.insertAdjacentHTML("beforeend",J(e));const n=ve(e);Ce(n,A).messages.push({type:"user",text:e}),b(),_(!0),me(n,A)}let Q;function ge(e){let t=document.getElementById("toast");t||(t=document.createElement("div"),t.id="toast",document.body.appendChild(t)),t.textContent=e,t.classList.add("show"),window.clearTimeout(Q),Q=window.setTimeout(()=>t.classList.remove("show"),1600)}function X(e,t){const s=document.createElement("textarea");s.value=e,document.body.appendChild(s),s.select(),document.execCommand("copy"),s.remove(),t()}function st(e){var n,i,o;let t;if(e.classList.contains("user"))t=((n=e.querySelector(".user-bubble"))==null?void 0:n.textContent)??"";else{const a=e.querySelector(".report"),c=e.querySelector(".follow-body");t=(a==null?void 0:a.textContent)??(c==null?void 0:c.textContent)??((i=e.querySelector(".agent-domain"))==null?void 0:i.textContent)??""}const s=()=>ge("已复制到剪贴板");(o=navigator.clipboard)!=null&&o.writeText?navigator.clipboard.writeText(t.trim()).then(s).catch(()=>X(t.trim(),s)):X(t.trim(),s)}function nt(e){var c,p,m;if(!v)return;const t=e.dataset.role,s=((c=e.querySelector(".user-bubble"))==null?void 0:c.textContent)??"",n=e.dataset.label,i=e.dataset.reportid,o=v.messages;let a=-1;t==="user"?(a=o.findIndex(d=>d.type==="user"&&d.text===s),a>=0&&(o.splice(a,1),((p=o[a])==null?void 0:p.type)==="report"&&o.splice(a,1))):t==="follow-user"?(a=o.findIndex(d=>d.type==="follow-user"&&d.text===s),a>=0&&(o.splice(a,1),((m=o[a])==null?void 0:m.type)==="follow-agent"&&o.splice(a,1))):t==="report"?(a=o.findIndex(d=>d.type==="report"&&d.reportId===i),a>=0&&o.splice(a,1)):t==="follow-agent"&&(a=o.findIndex(d=>d.type==="follow-agent"&&d.label===n),a>=0&&o.splice(a,1)),a>=0&&b()}function at(e){nt(e),e.remove(),ge("已删除")}function it(e){var i;const t=e.querySelector(".user-bubble");if(!t)return;const s=t.textContent??"";(i=e.querySelector(".msg-actions"))==null||i.remove(),t.outerHTML=`
    <div class="edit-row">
      <textarea class="edit-input" rows="1">${l(s)}</textarea>
      <div class="edit-btns">
        <button class="edit-save">保存</button>
        <button class="edit-cancel">取消</button>
      </div>
    </div>`;const n=e.querySelector(".edit-input");n.focus(),e.querySelector(".edit-cancel").addEventListener("click",()=>{e.innerHTML=`<div class="user-bubble">${l(s)}</div>${H(!0)}`}),e.querySelector(".edit-save").addEventListener("click",()=>{var p;const o=n.value.trim();if(!o)return;if(e.innerHTML=`<div class="user-bubble">${l(o)}</div>${H(!0)}`,v){const m=v.messages.findIndex(d=>d.type==="user"&&d.text===s);m>=0&&(v.messages[m]={type:"user",text:o},((p=v.messages[m+1])==null?void 0:p.type)==="report"&&v.messages.splice(m+1,1),b())}let a=e.nextElementSibling;for(;a&&!a.classList.contains("user");){const m=a;a=a.nextElementSibling,m.remove()}const c=ve(o);me(c,A)})}function ot(e,t){return[`围绕「${e.heading}」这一维度，我们进一步交叉了 ${t.domain} 相关的多个来源，发现的主要分歧点是统计口径与采样边界。`,"下一步建议：对可比口径做对齐、拆解头部样本，并补充时间序列的同比校验（更多细节需接入实时数据源）。"]}function he(e,t,s){const n=document.getElementById("chat"),i=`sup-${Date.now()}`,o=t.map((p,m)=>ce(p,m)).join("");n.insertAdjacentHTML("beforeend",`
    <div class="msg agent" data-role="follow-agent" data-label="${l(e)}">
      <div class="msg-head">
        <div class="avatar">研</div>
        <div class="agent-meta">
          <div class="agent-name">研衡 Agent</div>
          <div class="agent-domain">${l(e)}</div>
        </div>
      </div>
      <div class="trace" id="trace-${i}">${o}</div>
      <div class="follow-body" id="body-${i}"></div>
      <div class="msg-foot">
        <span class="agent-time">${F(new Date)}</span>
        ${V(W)}
      </div>
    </div>`),w+=W.cost,b(),x();const a=document.getElementById(`trace-${i}`),c=document.getElementById(`body-${i}`);tt(a,void 0,()=>{s(c),c.classList.add("reveal")}),O()}function lt(e,t){if(!t)return;const s=[{label:"检索补充来源",detail:`针对「${t.heading}」补充检索 ${e.domain} 相关来源`},{label:"输出深挖结论",detail:"交叉核对后生成补充分析"}],n=t.deepDive??ot(t,e),i=`深挖 · ${t.heading}`;v&&(v.messages.push({type:"follow-agent",label:i,steps:s,bullets:n}),b()),he(i,s,o=>{o.innerHTML=`<ul class="bullets">${n.map(a=>`<li>${l(a)}</li>`).join("")}</ul>`})}function dt(e,t){document.getElementById("chat").insertAdjacentHTML("beforeend",J(t,"follow-user"));const n=[{label:"检索补充信息",detail:`围绕追问「${t}」补充检索`},{label:"输出结论",detail:`结合 ${e.domain} 最新数据作答`}],i=[`关于「${t}」，结合 ${e.domain} 的最新公开数据，我们初步判断该议题仍处于快速演进阶段，短期存在口径分歧。`,"建议下一步：拉取近 12 个月的相关来源，并对头部厂商的公开口径做交叉核对（完整回复需接入实时数据源）。"],o=`追问 · ${e.domain}`;v&&(v.messages.push({type:"follow-user",text:t}),v.messages.push({type:"follow-agent",label:o,steps:n,bullets:i}),b()),he(o,n,a=>{a.innerHTML=`<ul class="bullets">${i.map(c=>`<li>${l(c)}</li>`).join("")}</ul>`})}function U(e){return we.map(t=>`<option value="${t}" ${t===e?"selected":""}>${l(y[t].topic)}</option>`).join("")}function j(e){const t=e.takeaways.slice(0,3).map(s=>`<li>${l(s.text)}</li>`).join("");return`
    <div class="compare-col">
      <div class="cmp-kicker">${l(e.domain)}</div>
      <h3 class="cmp-title">${l(e.topic)}</h3>
      <div class="cmp-metric"><span>${l(e.headline.label)}</span><b>${l(e.headline.value)}</b></div>
      <div class="cmp-cagr">CAGR <b>${l(e.cagr)}</b></div>
      <div class="cmp-tags">${e.tags.map(s=>`<span class="tag">${l(s)}</span>`).join("")}</div>
      <ol class="cmp-takeaways">${t}</ol>
    </div>`}function ct(){let e=y["ai-agent"],t=y.humanoid;const s=document.createElement("div");s.className="compare-overlay",s.innerHTML=`
    <div class="compare">
      <div class="compare-head">
        <div class="compare-title">双行业对比 <span class="compare-sub">RESEARCH COMPARISON · 虚拟数据</span></div>
        <button class="close-btn" id="closeCompare">✕ 关闭</button>
      </div>
      <div class="compare-controls">
        <select id="cmpA">${U(e.id)}</select>
        <span class="vs">VS</span>
        <select id="cmpB">${U(t.id)}</select>
      </div>
      <div class="compare-grid" id="cmpGrid">${j(e)}${j(t)}</div>
    </div>`,document.body.appendChild(s);const n=s.querySelector("#cmpA"),i=s.querySelector("#cmpB"),o=s.querySelector("#cmpGrid"),a=()=>{e=y[n.value],t=y[i.value],o.innerHTML=`${j(e)}${j(t)}`};n.addEventListener("change",a),i.addEventListener("change",a),s.querySelector("#closeCompare").addEventListener("click",()=>s.remove()),s.addEventListener("click",c=>{c.target===s&&s.remove()})}function D(){var e;(e=document.getElementById("taskModal"))==null||e.remove()}function rt(){D();const e=document.createElement("div");e.className="modal-overlay",e.id="taskModal",e.innerHTML=`
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">创建定时任务 <span class="modal-sub">SCHEDULED RESEARCH · 虚拟数据</span></div>
        <button class="close-btn" id="closeTask">✕ 关闭</button>
      </div>
      <form id="taskForm" class="task-form">
        <label class="field"><span>调研行业</span>
          <select id="tReport">${U("ai-agent")}</select>
        </label>
        <label class="field"><span>报告深度</span>
          <select id="tDepth"><option value="deep">深度</option><option value="simple">简单</option></select>
        </label>
        <label class="field"><span>执行频率</span>
          <select id="tFreq"><option>每天</option><option>每周</option><option>每月</option></select>
        </label>
        <label class="field"><span>执行时间</span>
          <input type="time" id="tTime" value="09:00" />
        </label>
        <button class="modal-submit" type="submit">创建任务</button>
      </form>
    </div>`,document.body.appendChild(e),e.querySelector("#closeTask").addEventListener("click",D),e.addEventListener("click",t=>{t.target===e&&D()}),e.querySelector("#taskForm").addEventListener("submit",t=>{t.preventDefault();const s=e.querySelector("#tReport").value,n=e.querySelector("#tDepth").value,i=e.querySelector("#tFreq").value,o=e.querySelector("#tTime").value||"09:00";M.push({id:`t${++N}`,reportId:s,depth:n,freq:i,time:o}),x(),D()})}function pt(){const e=document.getElementById("input"),t=document.getElementById("send"),s=()=>{const a=e.value.trim();a&&(e.value="",e.style.height="auto",Z(a))};t.addEventListener("click",s),e.addEventListener("keydown",a=>{a.key==="Enter"&&!a.shiftKey&&(a.preventDefault(),s())}),e.addEventListener("input",()=>{e.style.height="auto",e.style.height=`${Math.min(e.scrollHeight,160)}px`}),document.getElementById("depthToggle").addEventListener("click",a=>{if(te)return;const c=a.target.closest(".depth-opt");c&&(A=c.dataset.depth,ae(A))});const n=document.getElementById("modelSelect"),i=()=>{const a=document.getElementById("modelHint");a&&(a.textContent=`模型 · ${se[B]??B} · `)};n.addEventListener("change",()=>{B=n.value,i()}),i(),document.getElementById("compareBtn").addEventListener("click",ct),document.getElementById("addTask").addEventListener("click",rt);const o=document.getElementById("themeBtn");o.textContent=P==="dark"?"☾":"☀",o.addEventListener("click",()=>{Ee(P==="dark"?"light":"dark")}),document.getElementById("newBtn").addEventListener("click",Re),document.getElementById("convList").addEventListener("click",a=>{const c=a.target,p=c.closest(".hi-del");if(p){He(p.dataset.del??"");return}const m=c.closest(".hi-body");if(!m)return;const d=$.find(r=>r.id===m.dataset.conv);d&&Te(d)}),document.getElementById("clearConvs").addEventListener("click",()=>{$.length!==0&&confirm("确定清空全部历史对话？此操作不可恢复。")&&qe()}),document.getElementById("taskList").addEventListener("click",a=>{const c=a.target.closest(".task-del");c&&(M=M.filter(p=>p.id!==c.dataset.del),x())}),document.getElementById("chat").addEventListener("click",a=>{const c=a.target,p=c.closest(".ma-btn");if(p){const d=p.closest(".msg"),r=p.dataset.act;r==="copy"?st(d):r==="edit"?it(d):r==="del"&&at(d);return}const m=c.closest(".chip");m&&Z(m.dataset.query??"")})}const ut=localStorage.getItem(ne);ut==="light"&&(P="light",document.documentElement.dataset.theme="light");ke.innerHTML=Pe();const mt=document.getElementById("chat");mt.innerHTML=le();de();Ie()||Se();Ae();pt();x();L("待命中","idle");
