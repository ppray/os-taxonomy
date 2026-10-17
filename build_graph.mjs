// build_graph.mjs — 烘焙「孩子所学的一切」交互知识图谱数据
// 读取已中文化的 topics / dependencies / clusters / curriculum-standards，
// 输出 site/data/{graph,standards,domains}.json
//   graph.json    : 节点(力导向烘焙坐标 + 字段) + 边 + 邻接表 + 学科配色
//   standards.json : 仅被引用到的课标条目精简映射（避免搬运 1.5MB 全文）
//   domains.json   : 学科→领域 索引（用于「学科百科」导航）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 默认读写仓库内的 data/ 与 site/data/；可用环境变量覆盖（如把输出写到临时目录做试跑）
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.TAXONOMY_DATA || path.join(ROOT, 'data');
const OUT = process.env.SITE_DATA_OUT || path.join(ROOT, 'site', 'data');

const topics = JSON.parse(fs.readFileSync(path.join(SRC, 'topics.json'), 'utf8')).topics;
const deps   = JSON.parse(fs.readFileSync(path.join(SRC, 'dependencies.json'), 'utf8')).dependencies;
const clusters = JSON.parse(fs.readFileSync(path.join(SRC, 'clusters.json'), 'utf8')).clusters;
// bewho 版站点用的是一份中文译本的 curriculum-standards.json（不在仓库内）；没有时退回仓库里的英文原版
const standardsRaw = JSON.parse(fs.readFileSync(process.env.STANDARDS_JSON || path.join(SRC, 'curriculum-standards.json'), 'utf8'));
const cnStdRaw = JSON.parse(fs.readFileSync(path.join(SRC, 'cn-standards.json'), 'utf8'));
// 细粒度课标（data/cn-math-2022.json）：补上站点需要的 subject / keyStage 字段；条目没有 matchSubject，不参与启发式挂载
const cnMath = JSON.parse(fs.readFileSync(path.join(SRC, 'cn-math-2022.json'), 'utf8'));
for (const t of cnMath.topics) t.data = { ...t.data, subject: '数学', keyStage: `${t.data.stage}(${t.data.grades})` };
// cn_* 节点的显式依赖边（data/cn-dependencies.json）；出现在这里的节点不再做关键词自动连线
const cnDeps = fs.existsSync(path.join(SRC, 'cn-dependencies.json'))
  ? JSON.parse(fs.readFileSync(path.join(SRC, 'cn-dependencies.json'), 'utf8')).dependencies : [];
const explicitIds = new Set(cnDeps.flatMap(d => [d.topicId, d.prerequisiteId]).filter(id => id.startsWith('cn_')));

// ── 学科顺序与精选配色（暗色底上发光、浅色底上可读）──────────────
const SUBJECTS = ["科学","数学","语文（读写素养）","英语","信息科技","历史","生活与劳动","道德与法治·综合实践","学会学习（跨学科素养）"];
const SUBJECT_COLORS = {
  "科学":"#34D399",
  "数学":"#5B9DFF",
  "语文（读写素养）":"#F5568B",
  "英语":"#E5484D",
  "信息科技":"#8B7CF6",
  "历史":"#F2B33D",
  "生活与劳动":"#FB8C5A",
  "道德与法治·综合实践":"#C067E0",
  "学会学习（跨学科素养）":"#2FD3C4"
};
const TYPE_LABELS = {
  CONCEPTUAL:"概念性", PROCEDURAL:"程序性", REPRESENTATIONAL:"表征性",
  LANGUAGE:"语言", META:"元认知"
};

// 归一化（用于跨节点 / 跨库名称匹配）
const norm = (s) => (s || '').toLowerCase().replace(/[\s·，。、：:；;（）()\-\/]/g, '');

// ── 节点 ──────────────────────────────────────────────
const idIndex = new Map();
const nodes = topics.map((t, i) => {
  idIndex.set(t.id, i);
  const aS = t.ageRangeStart, aE = t.ageRangeEnd;
  return {
    i, id:t.id, name:t.name, subject:t.subject, domain:t.domain,
    type:t.type, typeLabel:TYPE_LABELS[t.type] || t.type,
    ageStart:aS, ageEnd:aE, ageMid:(aS+aE)/2,
    centrality:t.centrality ?? 0,
    description:t.description || '', assessmentPrompt:t.assessmentPrompt || '',
    evidence:t.evidence || [], standards:t.standards || [],
    x:0, y:0, vx:0, vy:0, deg:0, prereqs:[], deps:[]
  };
});

// ── 边（prereq -> topic）并填充邻接表 ──────────────────
const links = [];
for (const d of deps) {
  const s = idIndex.get(d.prerequisiteId);
  const t = idIndex.get(d.topicId);
  if (s === undefined || t === undefined) continue;
  links.push({ s, t, strength: d.strength });
  nodes[s].deg++; nodes[t].deg++;
  nodes[t].prereqs.push(s);
  nodes[s].deps.push(t);
}

// ── 中国课标(2022) 集成 ───────────────────────────────
const cnCurricula = [...(cnStdRaw.curricula || []), cnMath];
// 1) 启发式对应：把中国课标条目挂到现有节点（同主题 + 年龄重叠 + 领域/名称关键词）
for (const cur of cnCurricula) for (const t of cur.topics || []) {
  if (t.selfOnly || t.supersededBy || !t.matchSubject) continue; // 已被细粒度课标取代的条目不再启发式挂载
  const subj = t.matchSubject, kws = t.matchDomains || [], lo = t.ageLo ?? 0, hi = t.ageHi ?? 99;
  for (const n of nodes) {
    if (n.subject !== subj) continue;
    if (n.standards.some(k => k.startsWith('cn-math-2022:'))) continue; // 已逐条对齐的节点不再叠加粗粒度标签
    if (n.ageStart > hi || n.ageEnd < lo) continue;
    if (kws.length && !kws.some(k => (n.domain || '').includes(k) || (n.name || '').includes(k))) continue;
    if (!n.standards.includes(t.key)) n.standards.push(t.key);
  }
}
// 2) 新增中国特有节点（拼音/笔顺/数感/法治观念…），并自动连线入图
const cnTopics = JSON.parse(fs.readFileSync(path.join(SRC, 'cn-topics.json'), 'utf8')).topics || [];
for (const t of cnTopics) {
  const i = nodes.length;
  idIndex.set(t.id, i);
  nodes.push({
    i, id: t.id, name: t.name, subject: t.subject, domain: t.domain,
    type: t.type, typeLabel: TYPE_LABELS[t.type] || t.type,
    ageStart: t.ageRangeStart, ageEnd: t.ageRangeEnd, ageMid: (t.ageRangeStart + t.ageRangeEnd) / 2,
    centrality: t.centrality ?? 0.01,
    description: t.description || '', assessmentPrompt: t.assessmentPrompt || '',
    evidence: t.evidence || [], standards: t.standards || [],
    x: 0, y: 0, vx: 0, vy: 0, deg: 0, prereqs: [], deps: []
  });
}
for (const d of cnDeps) {
  const s = idIndex.get(d.prerequisiteId);
  const t = idIndex.get(d.topicId);
  if (s === undefined || t === undefined) continue;
  links.push({ s, t, strength: d.strength });
  nodes[s].deg++; nodes[t].deg++;
  nodes[t].prereqs.push(s);
  nodes[s].deps.push(t);
}
for (const t of cnTopics) {
  if (explicitIds.has(t.id)) continue;
  const ni = idIndex.get(t.id); if (ni === undefined) continue;
  const cand = nodes.filter(n => n.i !== ni && n.subject === (t.linkSubject || t.subject)
    && (!t.linkKeyword || (n.domain || '').includes(t.linkKeyword) || (n.name || '').includes(t.linkKeyword)));
  cand.sort((a, b) => Math.abs(a.ageMid - nodes[ni].ageMid) - Math.abs(b.ageMid - nodes[ni].ageMid));
  for (const c of cand.slice(0, 3)) {
    if (c.ageMid <= nodes[ni].ageMid) { links.push({ s: c.i, t: ni, strength: 'soft' }); nodes[c.i].deg++; nodes[ni].deg++; nodes[ni].prereqs.push(c.i); nodes[c.i].deps.push(ni); }
    else { links.push({ s: ni, t: c.i, strength: 'soft' }); nodes[ni].deg++; nodes[c.i].deg++; nodes[ni].deps.push(c.i); nodes[c.i].prereqs.push(ni); }
  }
  // 跨学科锚点：把新学科的首节点挂入主图（如英语启蒙 → 语文阅读）
  if (t.anchor) {
    const ac = nodes.filter(x => x.i !== ni && x.subject === (t.anchor.subject || t.subject)
      && (!t.anchor.keyword || (x.domain || '').includes(t.anchor.keyword) || (x.name || '').includes(t.anchor.keyword)));
    ac.sort((a, b) => Math.abs(a.ageMid - nodes[ni].ageMid) - Math.abs(b.ageMid - nodes[ni].ageMid));
    const tg = ac[0];
    if (tg) {
      if (tg.ageMid <= nodes[ni].ageMid) { links.push({ s: tg.i, t: ni, strength: 'soft' }); nodes[tg.i].deg++; nodes[ni].deg++; nodes[ni].prereqs.push(tg.i); nodes[tg.i].deps.push(ni); }
      else { links.push({ s: ni, t: tg.i, strength: 'soft' }); nodes[ni].deg++; nodes[tg.i].deg++; nodes[ni].deps.push(tg.i); nodes[tg.i].prereqs.push(ni); }
    }
  }
}

// ── Part 4：集成「中国 K12 教材关键词库」（来自 3DforTeacher）──
// 匹配到现有节点 → 打 k12 标签（增加教材关键词上下文）；
// 未匹配 → 新建节点（归入对应学科、软连入主图）；
// 同时产出 k12.json 供「教材关键词库」浏览层使用。
const _k12sb = {};
try {
  const _k12src = fs.readFileSync(path.join(SRC, '_k12_raw.js'), 'utf8');
  new Function('sandbox', _k12src.replace('window.CURRICULUM_KEYWORDS', 'sandbox.K12'))(_k12sb);
} catch (e) { console.error('K12 读取失败（跳过）：', e.message); }
const K12 = _k12sb.K12 || {};
const K12_SUBJ = { math: '数学', science: '科学', biology: '科学', geography: '科学', information: '信息科技', physics: '科学', chemistry: '科学' };
function gradeAge(id) { const m = String(id).match(/g(\d+)/); if (m) return Math.max(4, Math.min(13, 5.5 + (+m[1]) * 1.0)); return 13; }
function kslug(s) { return (s || '').replace(/[^\w一-龥]/g, '').slice(0, 16) || 'k'; }
const subjNodesMap = {}; SUBJECTS.forEach(s => subjNodesMap[s] = nodes.filter(n => n.subject === s));
const k12Out = { version: K12.version || '', sources: K12.sources || [], stages: [] };
let k12NewCount = 0, k12MatchCount = 0;
for (const st of K12.stages || []) {
  const stO = { id: st.id, name: st.name, grades: [] };
  for (const g of st.grades || []) {
    const gO = { id: g.id, name: g.name, subjects: [] };
    const ageMid = gradeAge(g.id);
    for (const sub of g.subjects || []) {
      const mySubj = K12_SUBJ[sub.id] || sub.name;
      const pool = subjNodesMap[mySubj] || [];
      const subO = { id: sub.id, name: sub.name, keywords: [] };
      for (const kw of sub.keywords || []) {
        const nm = kw.name, ds = kw.desc || '';
        const nrm = norm(nm);
        const hit = pool.find(n => norm(n.name).includes(nrm) || nrm.includes(norm(n.name)));
        let nodeId;
        if (hit) {
          if (!Array.isArray(hit.k12)) hit.k12 = [];
          hit.k12.push({ grade: g.id, subject: sub.id, desc: ds });
          k12MatchCount++; nodeId = hit.id;
        } else {
          const i = nodes.length;
          const near = pool.slice().sort((a, b) => Math.abs(a.ageMid - ageMid) - Math.abs(b.ageMid - ageMid))[0];
          const nid = 'k12_' + kslug(nm) + '_' + g.id;
          nodes.push({
            i, id: nid, name: nm, subject: mySubj, domain: sub.name, type: 'CONCEPTUAL', typeLabel: '概念性',
            ageStart: Math.max(3, ageMid - 1), ageEnd: Math.min(14, ageMid + 1), ageMid, centrality: 0.008,
            description: ds, assessmentPrompt: '', evidence: [], standards: [],
            x: 0, y: 0, vx: 0, vy: 0, deg: 0, prereqs: [], deps: [], k12: true, k12New: true
          });
          idIndex.set(nid, i); subjNodesMap[mySubj].push(nodes[i]); k12NewCount++;
          if (near) {
            if (near.ageMid <= ageMid) { links.push({ s: near.i, t: i, strength: 'soft' }); nodes[near.i].deg++; nodes[i].deg++; nodes[i].prereqs.push(near.i); nodes[near.i].deps.push(i); }
            else { links.push({ s: i, t: near.i, strength: 'soft' }); nodes[near.i].deg++; nodes[i].deg++; nodes[i].deps.push(near.i); nodes[near.i].prereqs.push(i); }
          }
          nodeId = nid;
        }
        subO.keywords.push({ name: nm, desc: ds, nodeId });
      }
      if (subO.keywords.length) gO.subjects.push(subO);
    }
    if (gO.subjects.length) stO.grades.push(gO);
  }
  if (stO.grades.length) k12Out.stages.push(stO);
}
fs.writeFileSync(path.join(OUT, 'k12.json'), JSON.stringify(k12Out));

// ── 力导向布局（学科环锚点 + 年龄纵向偏置 + 链接弹簧 + 斥力）──
const R = 1500;
const anchors = {};
SUBJECTS.forEach((subj, k) => {
  const a = (k / SUBJECTS.length) * Math.PI * 2 - Math.PI / 2;
  anchors[subj] = { x: Math.cos(a) * R, y: Math.sin(a) * R, a };
});
// 初始化：学科环 + 抖动 + 按年龄微抬升
for (const n of nodes) {
  const an = anchors[n.subject];
  n.x = an.x + (Math.random() - 0.5) * 520;
  n.y = an.y + (Math.random() - 0.5) * 520 + (n.ageMid - 8.5) * 26;
}

const K = 52, k2 = K * K, ITER = 320;
const cutoff = 820 * 820;
const ageSpread = 13 - 4;
for (let it = 0; it < ITER; it++) {
  for (const n of nodes) { n.vx = 0; n.vy = 0; }
  // 斥力（带截断）
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1e-4) { d2 = 1e-4; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
      if (d2 > cutoff) continue;
      const d = Math.sqrt(d2);
      const f = k2 / d2;
      const fx = dx / d * f, fy = dy / d * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
  }
  // 链接弹簧
  for (const l of links) {
    const a = nodes[l.s], b = nodes[l.t];
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
    const f = (d * d) / K * (l.strength === 'hard' ? 1.0 : 0.55);
    const fx = dx / d * f, fy = dy / d * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  // 锚点吸引 + 年龄纵向偏置 + 中心重力
  for (const n of nodes) {
    const an = anchors[n.subject];
    n.vx += (an.x - n.x) * 0.014;
    n.vy += (an.y - n.y) * 0.014;
    n.vy += ((n.ageMid - 8.5) * 14 - (n.y - an.y)) * 0.012; // 年长者在学科簇内偏上
    n.vx += -n.x * 0.0016;
    n.vy += -n.y * 0.0016;
  }
  const temp = K * Math.pow(1 - it / ITER, 1.45);
  for (const n of nodes) {
    const d = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
    if (d > 1e-9) {
      const move = Math.min(d, temp);
      n.x += (n.vx / d) * move;
      n.y += (n.vy / d) * move;
    }
  }
  if (it % 40 === 0) console.error(`iter ${it}`);
}

// 半径按连接度（对数），重要节点更大
const maxDeg = Math.max(...nodes.map(n => n.deg));
for (const n of nodes) {
  n.r = Math.max(2.4, Math.min(15, 2.4 + Math.sqrt(n.deg) * 1.9));
}

// 边界
let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
for (const n of nodes) {
  if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
  if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
}

// ── Part 1：跨学科锚定（把「九张并列地图」织成「互相借力的网」）──
// 作为纯渲染关系（cross:true），不进入 prereqs/deps，避免污染依赖链视图。
const CROSS = [
  ['语文（读写素养）', ['数量', '量词', '数', '统计', '分类'], '数学', ['数感', '数与运算', '计数', '测量', '数据', '统计', '分类']],
  ['语文（读写素养）', ['阅读', '朗读', '听说', '表达', '词汇'], '英语', ['阅读', '听说', '口语', '词汇', '表达']],
  ['语文（读写素养）', ['观察', '记录', '探究', '实验', '写话', '习作', '说明'], '科学', ['观察', '记录', '探究', '实验', '说明', '分类']],
  ['数学', ['图形', '几何', '测量', '对称', '空间', '位置'], '科学', ['图形', '几何', '测量', '空间', '对称']],
  ['数学', ['推理', '逻辑', '规律', '变量'], '科学', ['推理', '假设', '逻辑', '变量']],
  ['数学', ['数据', '统计', '图表', '分类'], '科学', ['数据', '统计', '图表', '分类']],
  ['语文（读写素养）', ['逻辑', '条理', '说明', '议论'], '数学', ['说理', '表达', '逻辑']],
  ['英语', ['字母', '拼读', '语音', '词汇'], '语文（读写素养）', ['拼音', '识字', '词汇', '拼读']],
  ['科学', ['分类', '比较', '变量', '观察'], '数学', ['分类', '比较', '变量']],
  ['英语', ['文化', '节日'], '语文（读写素养）', ['文化', '传统']],
  ['语文（读写素养）', ['数量', '图表', '数据'], '科学', ['数据', '图表']],
];
const crossMade = new Set();
let crossCount = 0;
for (const [sa, ta, sb, tb] of CROSS) {
  const A = nodes.filter(n => n.subject === sa), B = nodes.filter(n => n.subject === sb);
  for (const a of A) {
    const na = norm(a.name) + norm(a.domain);
    if (!ta.some(t => na.includes(norm(t)))) continue;
    let best = null, bestScore = -1e9;
    for (const b of B) {
      const nb = norm(b.name) + norm(b.domain);
      if (!tb.some(t => nb.includes(norm(t)))) continue;
      const ad = Math.abs(a.ageMid - b.ageMid);
      if (ad > 2.6) continue;
      const score = b.centrality * 12 - ad * 2.2;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best) {
      const key = a.i < best.i ? a.i + '-' + best.i : best.i + '-' + a.i;
      if (crossMade.has(key)) continue; crossMade.add(key);
      links.push({ s: a.i, t: best.i, strength: 'cross', cross: true });
      crossCount++;
    }
  }
}

// ── 精简课标映射（仅被引用条目）─────────────────────────
// 外国课标条目的中文显示名（抽取自 bewho 版站点），叠加在英文原版之上
const overlayPath = path.join(SRC, 'i18n', 'zh-CN', 'standards-overlay.json');
const zhOverlay = fs.existsSync(overlayPath) ? JSON.parse(fs.readFileSync(overlayPath, 'utf8')).entries : {};
const stdMap = new Map();
for (const cur of [...(standardsRaw.curricula || []), ...cnCurricula]) {
  for (const t of cur.topics || []) {
    if (!t.key) continue;
    const dd = t.data || {};
    stdMap.set(t.key, {
      code: t.code || '',
      title: dd.title || '',
      domain: dd.domain || '',
      subject: dd.subject || '',
      keyStage: dd.keyStage || '',
      curriculum: cur.slug || '',
      ...zhOverlay[t.key]
    });
  }
}
const usedStandards = {};
for (const n of nodes) {
  for (const key of n.standards) {
    if (stdMap.has(key) && !usedStandards[key]) usedStandards[key] = stdMap.get(key);
  }
}

// ── 领域索引（学科→领域）──────────────────────────────
const domainAgg = {};
for (const c of clusters) {
  const s = c.subject, d = c.domain;
  if (!domainAgg[s]) domainAgg[s] = {};
  if (!domainAgg[s][d]) domainAgg[s][d] = { ageStart: c.ageRangeStart, summary: c.summary, count: 0 };
  domainAgg[s][d].count++;
  if (c.ageRangeStart < domainAgg[s][d].ageStart) domainAgg[s][d].ageStart = c.ageRangeStart;
}
// 用 topics 实际计数校正（更准）
const domainCount = {};
for (const n of nodes) {
  const s = n.subject, d = n.domain;
  domainCount[s] = domainCount[s] || {};
  domainCount[s][d] = (domainCount[s][d] || 0) + 1;
}
const domains = {};
for (const s of SUBJECTS) {
  domains[s] = [];
  const dm = domainAgg[s] || {};
  const dc = domainCount[s] || {};
  const names = new Set([...Object.keys(dm), ...Object.keys(dc)]);
  for (const d of names) {
    domains[s].push({
      name: d,
      ageStart: dm[d] ? dm[d].ageStart : null,
      summary: dm[d] ? dm[d].summary : '',
      count: dc[d] || 0
    });
  }
  domains[s].sort((a, b) => (a.ageStart ?? 99) - (b.ageStart ?? 99) || b.count - a.count);
}

// ── 写出 ──────────────────────────────────────────────
const graphOut = {
  generated: new Date().toISOString(),
  title: '孩子所学的一切',
  version: 'v1.0',
  bounds: { minX, minY, maxX, maxY },
  subjects: SUBJECTS,
  subjectColors: SUBJECT_COLORS,
  typeLabels: TYPE_LABELS,
  nodeCount: nodes.length,
  linkCount: links.length,
  maxDeg,
  bySubject: SUBJECTS.map(s => nodes.filter(n => n.subject === s).length),
  nodes: nodes.map(n => ({
    i: n.i, id: n.id, name: n.name, subject: n.subject, domain: n.domain,
    type: n.type, typeLabel: n.typeLabel,
    ageStart: n.ageStart, ageEnd: n.ageEnd, ageMid: n.ageMid,
    centrality: n.centrality, description: n.description,
    assessmentPrompt: n.assessmentPrompt, evidence: n.evidence,
    standards: n.standards, deg: n.deg, r: n.r,
    k12: n.k12 || null, k12New: !!n.k12New,
    prereqs: n.prereqs, deps: n.deps,
    x: Math.round(n.x * 100) / 100, y: Math.round(n.y * 100) / 100
  })),
  links: links.map(l => ({ s: l.s, t: l.t, strength: l.strength, cross: l.cross || false }))
};
fs.writeFileSync(path.join(OUT, 'graph.json'), JSON.stringify(graphOut));
fs.writeFileSync(path.join(OUT, 'standards.json'), JSON.stringify(usedStandards));
fs.writeFileSync(path.join(OUT, 'domains.json'), JSON.stringify({ subjects: SUBJECTS, domains }));
fs.writeFileSync(path.join(OUT, 'k12.json'), JSON.stringify(k12Out));

console.error('✓ graph.json  :', nodes.length, 'nodes /', links.length, 'links');
console.error('✓ standards   :', Object.keys(usedStandards).length, 'referenced');
console.error('✓ domains     :', SUBJECTS.length, 'subjects');
console.error('✓ 跨学科锚定  :', crossCount, '条交叉关系');
console.error('✓ K12 教材库  : 匹配', k12MatchCount, ' / 新增', k12NewCount, '节点 → k12.json');
console.error('bounds', minX.toFixed(0), minY.toFixed(0), maxX.toFixed(0), maxY.toFixed(0));
