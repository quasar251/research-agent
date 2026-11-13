import re
from collections import defaultdict

path = r"d:\AgentProjects\00-2611\raw_proj\research-agent\frontend\style.css"
text = open(path, encoding="utf-8").read()

# 1) 去掉注释
no_comment = re.sub(r"/\*.*?\*/", "", text, flags=re.S)

# 2) 去掉 @media ... { ... }、@keyframes ... { ... }、@-webkit-keyframes ... { ... }
#    用平衡括号删除整个 at-rule 块
def strip_at_rules(s):
    out = []
    i = 0
    n = len(s)
    while i < n:
        # 找到 @ 开头的 at-rule
        at = s.find("@", i)
        if at == -1:
            out.append(s[i:])
            break
        out.append(s[i:at])
        # 找到选择器/名字结束（到 { ）
        brace = s.find("{", at)
        if brace == -1:
            out.append(s[at:])
            break
        # 平衡括号
        depth = 0
        j = brace
        while j < n:
            if s[j] == "{":
                depth += 1
            elif s[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        i = j + 1  # 跳过整个 at-rule 块
    return "".join(out)

top = strip_at_rules(no_comment)

# 3) 解析顶层规则
rule_re = re.compile(r"([^{}]+)\{([^{}]*)\}")
rules = []
for m in rule_re.finditer(top):
    sel = m.group(1).strip()
    body = m.group(2).strip()
    if not sel or not body:
        continue
    decls = [d.strip() for d in body.split(";") if d.strip()]
    norm = ";".join(sorted(decls))
    rules.append((sel, norm, body))

lines = []
lines.append(f"顶层规则总数: {len(rules)}")
lines.append("="*70)
lines.append("【A】同一选择器在顶层被定义多次（最后生效，前面那次通常可删）")
lines.append("="*70)
by_sel = defaultdict(list)
for idx, (sel, norm, body) in enumerate(rules):
    by_sel[sel].append((norm, body, idx))
for sel, occ in by_sel.items():
    if len(occ) > 1:
        lines.append(f"\n[{len(occ)}x] {sel}")
        for k, (n, b, idx) in enumerate(occ):
            lines.append(f"  #{k+1}: {n}")

lines.append("\n" + "="*70)
lines.append("【B】不同选择器却使用了完全相同的属性块（可合并选择器或抽公共类）")
lines.append("="*70)
by_body = defaultdict(list)
for sel, norm, body in rules:
    by_body[norm].append(sel)
for norm, sels in by_body.items():
    if len(sels) > 1 and len(norm) > 15:
        lines.append(f"\n[{len(sels)}x] 声明块: {norm}")
        for s in sels:
            lines.append(f"    {s}")

out = "\n".join(lines)
open(r"d:\AgentProjects\00-2611\raw_proj\research-agent\frontend\_css_report.txt", "w", encoding="utf-8").write(out)
print(out)
