#!/usr/bin/env node
/**
 * validate.mjs — 数据集完整性校验（无依赖）。
 *
 * 在上游 Marble 版 validate.mjs 的基础上改写：
 *   - 结构校验由 schema/*.schema.json 声明驱动（内置一个只覆盖本仓库所用关键字的 JSON Schema 子集校验器）；
 *   - 跨文件规则集中写在 CHECKS 表里，每条规则返回错误列表；
 *   - 新增：依赖图无环、中国课标 key 可解析、alignments 与 topics.json 双向一致、{{name}} 占位符、英文残留告警；
 *   - validate() 返回 { valid, errors[], warnings[] }，CLI 只负责打印与退出码。
 *
 *   node scripts/validate.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'data');
const SCHEMA = resolve(ROOT, 'schema');

// ── 声明：哪个文件用哪个 schema ──────────────────────────────────────────
const FILES = {
  topics: { path: 'topics.json', schema: 'topics.schema.json' },
  deps: { path: 'dependencies.json', schema: 'dependencies.schema.json' },
  clusters: { path: 'clusters.json', schema: 'clusters.schema.json' },
  standards: { path: 'curriculum-standards.json', schema: 'curriculum-standards.schema.json' },
  cnStandards: { path: 'cn-standards.json' },
  cnTopics: { path: 'cn-topics.json' },
  cnDeps: { path: 'cn-dependencies.json', schema: 'dependencies.schema.json', optional: true, idPattern: '^(mt|cn)_' },
  cnMath: { path: 'cn-math-2022.json', schema: 'cn-curriculum.schema.json' },
  manifest: { path: 'manifest.json', optional: true },
};
const ALIGNMENT_SCHEMA = 'cn-alignment.schema.json';
const STAGE_AGES = { S1: [6, 8], S2: [8, 10], S3: [10, 12], S4: [12, 15] };
const LATIN_WORD = /[A-Za-z]{5,}/; // 中文化后仍残留的英文单词（公式里的单字母变量不算）

// ── JSON Schema 子集校验器 ───────────────────────────────────────────────
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const typeMatches = (v, t) => t === typeOf(v) || (t === 'number' && typeof v === 'number');

function checkSchema(value, schema, at, errors) {
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push(`${at}: 期望类型 ${types.join('|')}，实际是 ${typeOf(value)}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) errors.push(`${at}: 值 ${JSON.stringify(value)} 不在允许值 ${JSON.stringify(schema.enum)} 中`);
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: "${value}" 不匹配 /${schema.pattern}/`);
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${at}: 长度应至少为 ${schema.minLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${at}: ${value} 小于最小值 ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${at}: ${value} 大于最大值 ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => checkSchema(v, schema.items, `${at}[${i}]`, errors));
  if (typeOf(value) === 'object') {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${at}: 缺少必填字段 "${k}"`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) checkSchema(v, props[k], `${at}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}: 不允许的字段 "${k}"`);
    }
  }
}

// ── 加载 ─────────────────────────────────────────────────────────────────
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function load() {
  const out = { fatal: [], errors: [] };
  for (const [name, spec] of Object.entries(FILES)) {
    const p = resolve(DATA, spec.path);
    if (!existsSync(p)) {
      if (!spec.optional) out.fatal.push(`缺少数据文件 data/${spec.path}`);
      continue;
    }
    try {
      out[name] = readJson(p);
    } catch (e) {
      out.fatal.push(`data/${spec.path} 不是合法 JSON：${e.message}`);
      continue;
    }
    if (spec.schema) {
      const schema = readJson(resolve(SCHEMA, spec.schema));
      // cn-dependencies 允许 cn_ 开头的新节点：复用 dependencies.schema，只放宽 id 规则
      if (spec.idPattern) for (const f of ['topicId', 'prerequisiteId']) schema.properties.dependencies.items.properties[f].pattern = spec.idPattern;
      checkSchema(out[name], schema, `data/${spec.path}`, out.errors);
    }
  }
  const alignDir = resolve(DATA, 'alignments');
  const alignSchema = readJson(resolve(SCHEMA, ALIGNMENT_SCHEMA));
  out.alignments = existsSync(alignDir)
    ? readdirSync(alignDir).filter((f) => f.endsWith('.json')).map((f) => {
        const doc = readJson(resolve(alignDir, f));
        checkSchema(doc, alignSchema, `data/alignments/${f}`, out.errors);
        return { file: f, doc };
      })
    : [];
  return out;
}

// ── 跨文件规则 ───────────────────────────────────────────────────────────
// 每条规则：(ctx) => { errors: string[], warnings?: string[] }
const CHECKS = {
  '声明的计数与实际一致': ({ topics, deps, standards, clusters, cnMath }) => ({
    errors: [
      topics.topicCount !== topics.topics.length && `topics.json: topicCount=${topics.topicCount}，实际 ${topics.topics.length}`,
      deps.edgeCount !== deps.dependencies.length && `dependencies.json: edgeCount=${deps.edgeCount}，实际 ${deps.dependencies.length}`,
      standards.curriculumCount !== standards.curricula.length && `curriculum-standards.json: curriculumCount 与 curricula 长度不一致`,
      clusters.clusterCount !== clusters.clusters.length && `clusters.json: clusterCount 与 clusters 长度不一致`,
      cnMath.topicCount !== cnMath.topics.length && `cn-math-2022.json: topicCount=${cnMath.topicCount}，实际 ${cnMath.topics.length}`,
    ].filter(Boolean),
  }),

  '节点 id 唯一': ({ allTopics }) => {
    const seen = new Set();
    const errors = [];
    for (const t of allTopics) {
      if (seen.has(t.id)) errors.push(`重复的节点 id：${t.id}`);
      seen.add(t.id);
    }
    return { errors };
  },

  '依赖边引用有效且无自环': ({ allDeps, topicById }) => ({
    errors: allDeps.flatMap((d) => [
      !topicById.has(d.topicId) && `依赖边引用了不存在的 topicId ${d.topicId}`,
      !topicById.has(d.prerequisiteId) && `依赖边引用了不存在的 prerequisiteId ${d.prerequisiteId}`,
      d.topicId === d.prerequisiteId && `自依赖：${d.topicId}`,
    ].filter(Boolean)),
  }),

  '依赖图无环（README 承诺是 DAG）': ({ allDeps, topicById }) => {
    const indeg = new Map([...topicById.keys()].map((id) => [id, 0]));
    const next = new Map();
    for (const d of allDeps) {
      if (!indeg.has(d.topicId) || !indeg.has(d.prerequisiteId)) continue;
      indeg.set(d.topicId, indeg.get(d.topicId) + 1);
      if (!next.has(d.prerequisiteId)) next.set(d.prerequisiteId, []);
      next.get(d.prerequisiteId).push(d.topicId);
    }
    const queue = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
    for (let i = 0; i < queue.length; i++) {
      for (const t of next.get(queue[i]) || []) {
        indeg.set(t, indeg.get(t) - 1);
        if (indeg.get(t) === 0) queue.push(t);
      }
    }
    const stuck = [...indeg].filter(([, n]) => n > 0).map(([id]) => id);
    return { errors: stuck.length ? [`依赖图有环：${stuck.length} 个节点无法拓扑排序，例如 ${stuck.slice(0, 8).join(', ')}`] : [] };
  },

  '课标 key 可解析': ({ allTopics, standardKeys }) => {
    const unknown = allTopics.flatMap((t) => (t.standards || []).filter((k) => !standardKeys.has(k)).map((k) => `${t.id} → ${k}`));
    return { errors: unknown.length ? [`${unknown.length} 个课标引用找不到对应条目，例如 ${unknown.slice(0, 5).join('；')}`] : [] };
  },

  'curriculum-standards 的 key 规范与仅代码约束': ({ standards }) => {
    const codesOnly = new Set(standards.codesOnlySources ?? []);
    const errors = [];
    for (const c of standards.curricula) {
      if (c.textIncluded === codesOnly.has(c.slug)) errors.push(`curriculum ${c.slug}: textIncluded=${c.textIncluded} 与 codesOnlySources 矛盾`);
      for (const s of c.topics) {
        if (s.key !== `${c.slug}:${s.code}`) errors.push(`standard key 应为 "${c.slug}:${s.code}"，实际 "${s.key}"`);
        if (codesOnly.has(c.slug) && 'data' in s) errors.push(`仅代码来源 ${c.slug} 在 ${s.key} 泄露了原文`);
      }
    }
    return { errors };
  },

  'cn-math-2022 条目编码一致': ({ cnMath }) => ({
    errors: cnMath.topics.flatMap((s) => [
      s.key !== `${cnMath.slug}:${s.code}` && `${s.key}: key 应为 "${cnMath.slug}:${s.code}"`,
      s.ageLo >= s.ageHi && `${s.key}: ageLo(${s.ageLo}) 应小于 ageHi(${s.ageHi})`,
    ].filter(Boolean)),
  }),

  'alignments 覆盖完整且字段自洽': ({ alignments, topicById, cnKeySet }) => {
    const errors = [];
    for (const { file, doc } of alignments) {
      const slug = doc.curriculum;
      const seen = new Set();
      for (const a of doc.alignments) {
        const where = `alignments/${file} ${a.topicId}`;
        const t = topicById.get(a.topicId);
        if (!t) { errors.push(`${where}: topicId 不存在`); continue; }
        if (t.subject !== doc.subject) errors.push(`${where}: 主题学科是 "${t.subject}"，不是 "${doc.subject}"`);
        if (seen.has(a.topicId)) errors.push(`${where}: 重复的对齐记录`);
        seen.add(a.topicId);
        const aligned = a.status === 'aligned';
        if (aligned && !a.standards.length) errors.push(`${where}: status=aligned 但 standards 为空`);
        if (aligned && !a.relation) errors.push(`${where}: status=aligned 时 relation 应为 exact 或 partial`);
        if (!aligned && a.standards.length) errors.push(`${where}: status=${a.status} 时 standards 应为空`);
        if (!aligned && a.relation !== null) errors.push(`${where}: status=${a.status} 时 relation 应为 null`);
        for (const k of a.standards) {
          if (!k.startsWith(`${slug}:`)) errors.push(`${where}: ${k} 不属于 ${slug}`);
          else if (!cnKeySet.has(k)) errors.push(`${where}: ${k} 不在课标条目中`);
        }
        const stages = [...new Set(a.standards.map((k) => k.split(':')[1].split('.')[0]))].filter((s) => s !== 'HX').sort();
        if ((stages[0] ?? null) !== a.cnStage) errors.push(`${where}: cnStage 应为 ${stages[0] ?? null}（取所对条目中最早的学段），实际 ${a.cnStage}`);
      }
      if (doc.alignmentCount !== doc.alignments.length) errors.push(`alignments/${file}: alignmentCount=${doc.alignmentCount}，实际 ${doc.alignments.length}`);
      const missing = [...topicById.values()].filter((t) => t.id.startsWith('mt_') && t.subject === doc.subject && !seen.has(t.id));
      if (missing.length) errors.push(`alignments/${file}: ${missing.length} 个 ${doc.subject} 主题没有对齐记录，例如 ${missing.slice(0, 5).map((t) => t.id).join(', ')}`);
    }
    return { errors };
  },

  'topics.json 与 alignments 双向同步': ({ alignments, topics }) => {
    const errors = [];
    for (const { file, doc } of alignments) {
      const prefix = `${doc.curriculum}:`;
      const want = new Map(doc.alignments.map((a) => [a.topicId, [...a.standards].sort().join(',')]));
      for (const t of topics.topics) {
        const have = t.standards.filter((k) => k.startsWith(prefix)).sort().join(',');
        if (have !== (want.get(t.id) ?? '')) errors.push(`${t.id}: topics.json 里的 ${doc.curriculum} key 与 alignments/${file} 不一致，请运行 node scripts/sync-cn-alignment.mjs`);
      }
    }
    return { errors };
  },

  'assessmentPrompt 保留 {{name}} 占位符': ({ allTopics }) => ({
    errors: allTopics.filter((t) => t.assessmentPrompt && !t.assessmentPrompt.includes('{{name}}')).map((t) => `${t.id}: assessmentPrompt 缺少 {{name}} 占位符`),
  }),

  '数学主题中文化后无英文残留（告警）': ({ allTopics }) => ({
    errors: [],
    warnings: allTopics
      .filter((t) => t.subject === '数学')
      .flatMap((t) => ['name', 'description', 'assessmentPrompt', ...((t.evidence || []).map((_, i) => `evidence[${i}]`))]
        .map((f) => [f, f.startsWith('evidence') ? t.evidence[+f.slice(9, -1)] : t[f]])
        .filter(([, v]) => typeof v === 'string' && LATIN_WORD.test(v.replace('{{name}}', '')))
        .map(([f, v]) => `${t.id}.${f} 含英文单词："${v.match(LATIN_WORD)[0]}"`)),
  }),

  '学段与原年龄相差过大（告警，供审校）': ({ alignments, topicById }) => ({
    errors: [],
    warnings: alignments.flatMap(({ doc }) => doc.alignments
      .filter((a) => a.cnStage)
      .map((a) => [a, topicById.get(a.topicId), STAGE_AGES[a.cnStage][0]])
      .filter(([, t, lo]) => t && Math.abs(lo - t.ageRangeStart) >= 2)
      .map(([a, t, lo]) => `${a.topicId}「${t.name}」原起始年龄 ${t.ageRangeStart} 岁，中国课标在${a.cnStage}（约 ${lo} 岁起）`)),
  }),

  'manifest 计数与校验和': ({ manifest }) => {
    if (!manifest) return { errors: [], warnings: ['data/manifest.json 不存在，运行 node scripts/build-manifest.mjs 生成'] };
    const errors = [];
    for (const [name, meta] of Object.entries(manifest.files ?? {})) {
      const p = resolve(DATA, name);
      if (!existsSync(p)) { errors.push(`manifest 列出的 data/${name} 不存在`); continue; }
      const actual = createHash('sha256').update(readFileSync(p)).digest('hex');
      if (actual !== meta.sha256) errors.push(`data/${name} 的 sha256 与 manifest 不一致，请运行 node scripts/build-manifest.mjs`);
    }
    return { errors };
  },
};

export function validate() {
  const ctx = load();
  // 文件缺失或无法解析时后续规则无从谈起；schema 错误则照常记录并继续跑跨文件规则
  if (ctx.fatal.length) return { valid: false, errors: ctx.fatal, warnings: [] };

  ctx.allTopics = [...ctx.topics.topics, ...(ctx.cnTopics?.topics ?? [])];
  ctx.allDeps = [...ctx.deps.dependencies, ...(ctx.cnDeps?.dependencies ?? [])];
  ctx.topicById = new Map(ctx.allTopics.map((t) => [t.id, t]));
  ctx.cnKeySet = new Set(ctx.cnMath.topics.map((s) => s.key));
  ctx.standardKeys = new Set([
    ...ctx.standards.curricula.flatMap((c) => c.topics.map((s) => s.key)),
    ...(ctx.cnStandards?.curricula ?? []).flatMap((c) => c.topics.map((s) => s.key)),
    ...ctx.cnKeySet,
  ]);

  const errors = [...ctx.errors];
  const warnings = [];
  for (const [name, check] of Object.entries(CHECKS)) {
    try {
      const r = check(ctx);
      errors.push(...r.errors.map((e) => `[${name}] ${e}`));
      warnings.push(...(r.warnings ?? []).map((w) => `[${name}] ${w}`));
    } catch (e) {
      errors.push(`[${name}] 规则执行失败（数据结构可能不符合 schema）：${e.message}`);
    }
  }
  return { valid: errors.length === 0, errors, warnings, counts: { topics: ctx.allTopics.length, dependencies: ctx.allDeps.length, standards: ctx.standardKeys.size } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { valid, errors, warnings, counts } = validate();
  const verbose = process.argv.includes('--verbose');
  if (warnings.length) {
    console.warn(`! ${warnings.length} 条告警${verbose ? '' : '（--verbose 查看全部）'}`);
    for (const w of verbose ? warnings : warnings.slice(0, 10)) console.warn(`  - ${w}`);
  }
  if (!valid) {
    console.error(`✗ ${errors.length} 个问题：`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ 校验通过 — ${counts.topics} 个节点，${counts.dependencies} 条依赖，${counts.standards} 个课标条目；结构、引用、无环、对齐同步与校验和均正常。`);
}
