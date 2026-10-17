#!/usr/bin/env node
// cn-alignment-report.mjs — 由 data/ 生成 docs/cn-math-2022-report.md（审校用清单）。
// 报告完全由数据推出；改了 alignments 或课标条目后重跑即可。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const cur = read('cn-math-2022.json');
const align = read('alignments/cn-math-2022.json').alignments;
const topics = new Map([...read('topics.json').topics, ...read('cn-topics.json').topics].map((t) => [t.id, t]));
const cnNodes = read('cn-topics.json').topics.filter((t) => t.id.startsWith('cn_math_'));
const item = new Map(cur.topics.map((s) => [s.key, s]));
const STAGE_LO = Object.fromEntries(Object.entries(cur.stages).map(([k, v]) => [k, v.ageLo]));
const stageName = (s) => (s ? `${cur.stages[s].name}（${cur.stages[s].grades}）` : '—');
const code = (k) => k.split(':')[1];
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const table = (head, rows) => rows.length
  ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
  : '（无）';
const count = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});

const byStatus = count(align, (a) => a.status);
const byRel = count(align.filter((a) => a.status === 'aligned'), (a) => a.relation);
const byStage = count(align.filter((a) => a.cnStage), (a) => a.cnStage);
const linked = new Map(cur.topics.map((s) => [s.key, []]));
for (const a of align) for (const k of a.standards) linked.get(k).push(a.topicId);
for (const n of cnNodes) for (const k of n.standards) linked.get(k)?.push(n.id);

const gaps = align
  .filter((a) => a.cnStage)
  .map((a) => ({ a, t: topics.get(a.topicId), d: STAGE_LO[a.cnStage] - topics.get(a.topicId).ageRangeStart }))
  .filter((g) => Math.abs(g.d) >= 2)
  .sort((x, y) => x.d - y.d);

const out = [];
out.push('# 数学微主题 × 2022 课标：对齐审校报告', '');
out.push('> 本文件由 `node scripts/cn-alignment-report.mjs` 根据 `data/` 生成，请勿手改。', '');
out.push('所有对齐目前都是 **LLM 草稿**（`review: llm-draft`），由 Claude 依据课标扫描件逐条起草，尚未经过教师审校。下面几张清单按审校优先级排列。', '');
out.push('## 总览', '');
out.push(table(['项目', '数量'], [
  ['数学微主题（mt_*）', align.length],
  ['已对齐 aligned', `${byStatus.aligned ?? 0}（exact ${byRel.exact ?? 0} / partial ${byRel.partial ?? 0}）`],
  ['属初中及以后 beyond-primary', byStatus['beyond-primary'] ?? 0],
  ['中国课标没有 cn-out-of-scope', byStatus['cn-out-of-scope'] ?? 0],
  ['按最早学段：第一 / 第二 / 第三学段', `${byStage.S1 ?? 0} / ${byStage.S2 ?? 0} / ${byStage.S3 ?? 0}`],
  ['课标条目（含核心素养 11 项）', cur.topics.length],
  ['新增中国特有节点（cn_math_*）', cnNodes.length],
]), '');

out.push('## 1. 学段与原年龄相差两年以上', '');
out.push('"差值" = 中国课标学段起始年龄 − 原数据起始年龄。负数表示**中国教得更早**，正数表示**中国教得更晚**（常见原因是英美把它放在学前班，或 2022 版把内容挪到了更高学段）。这是对齐最有价值、也最需要老师确认的部分。', '');
out.push('注意：一个主题对到多个学段时按**最早**的学段计（即中国从哪个学段开始接触），因此"中国更早"的差值可能被放大，请结合"对齐条目"一列判断。', '');
out.push(table(['差值', '主题', '原年龄', '中国学段', '对齐条目', '理由'], gaps.map(({ a, t, d }) =>
  [d > 0 ? `+${d}` : d, `${t.name}（${a.topicId}）`, `${t.ageRangeStart}–${t.ageRangeEnd} 岁`, stageName(a.cnStage), a.standards.map(code).join(', '), a.rationale])), '');

out.push('## 2. 低置信度对齐（confidence < 0.6）', '');
const low = align.filter((a) => a.status === 'aligned' && a.confidence < 0.6).sort((x, y) => x.confidence - y.confidence);
out.push(table(['置信度', '主题', '对齐条目', '理由'], low.map((a) => [a.confidence, `${a.topicName}（${a.topicId}）`, a.standards.map(code).join(', '), a.rationale])), '');

out.push('## 3. 属初中及以后（beyond-primary）', '');
const later = align.filter((a) => a.status === 'beyond-primary');
out.push(table(['主题', '原年龄', '理由'], later.map((a) => [`${a.topicName}（${a.topicId}）`, `${topics.get(a.topicId).ageRangeStart}–${topics.get(a.topicId).ageRangeEnd} 岁`, a.rationale])), '');

out.push('## 4. 中国课标没有（cn-out-of-scope）', '');
const oos = align.filter((a) => a.status === 'cn-out-of-scope');
out.push(table(['主题', '理由'], oos.map((a) => [`${a.topicName}（${a.topicId}）`, a.rationale])), '');

out.push('## 5. 课标条目覆盖情况', '');
out.push('没有任何主题对上的条目。`generic` 表示该条只是素养概括句；主题活动和项目学习本来就是综合性活动，不对应单个知识点。其余条目已据此新增了 `cn_math_*` 节点。', '');
const unlinked = cur.topics.filter((s) => !linked.get(s.key).length);
out.push(table(['条目', '标题', '类型', '页码'], unlinked.map((s) => [s.code, s.data.title, s.data.generic ? '素养概括（generic）' : s.data.kind, s.data.page])), '');

out.push('## 6. 新增的中国特有节点', '');
out.push(table(['节点', '名称', '对应条目', '年龄'], cnNodes.map((n) => [n.id, n.name, n.standards.map(code).join(', '), `${n.ageRangeStart}–${n.ageRangeEnd} 岁`])), '');

out.push('## 7. 各条目被引用次数', '');
out.push(table(['条目', '标题', '学段', '引用数'], cur.topics.filter((s) => !s.data.generic).map((s) => [s.code, s.data.title, s.data.stage, linked.get(s.key).length])), '');

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'cn-math-2022-report.md'), out.join('\n') + '\n');
console.log(`✓ docs/cn-math-2022-report.md：学段差 ${gaps.length}，低置信 ${low.length}，初中 ${later.length}，课标外 ${oos.length}，未覆盖条目 ${unlinked.length}`);
