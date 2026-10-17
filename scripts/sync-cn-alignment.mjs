#!/usr/bin/env node
// sync-cn-alignment.mjs — 把 data/alignments/<slug>.json 的对齐结果同步进 data/topics.json 的 standards 字段。
//
// alignments 文件是唯一的事实来源：每次运行先删掉 topics 里该 slug 的全部 key，再按 alignments 重新追加，
// 因此可以反复运行；原有的 CCSS / 英国课程 key 不受影响。
//
//   node scripts/sync-cn-alignment.mjs          # 同步并写回
//   node scripts/sync-cn-alignment.mjs --check  # 只检查是否已同步（CI 用），不一致时退出码 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const checkOnly = process.argv.includes('--check');

const topicsPath = path.join(DATA, 'topics.json');
const topicsRaw = fs.readFileSync(topicsPath, 'utf8');
const topics = JSON.parse(topicsRaw);
const byId = new Map(topics.topics.map((t) => [t.id, t]));

const alignDir = path.join(DATA, 'alignments');
const files = fs.existsSync(alignDir) ? fs.readdirSync(alignDir).filter((f) => f.endsWith('.json')) : [];

const problems = [];
for (const file of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(alignDir, file), 'utf8'));
  const prefix = `${doc.curriculum}:`;
  for (const t of topics.topics) t.standards = (t.standards || []).filter((k) => !k.startsWith(prefix));
  for (const a of doc.alignments || []) {
    const t = byId.get(a?.topicId);
    if (!t) { problems.push(`${file}: topicId ${a?.topicId} 不在 topics.json 中`); continue; }
    for (const k of a.standards || []) if (!t.standards.includes(k)) t.standards.push(k);
  }
}
if (problems.length) {
  console.error(`✗ ${problems.length} 个问题：\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

// 与 bewho 版 topics.json 的格式保持一致：两空格缩进、文件末尾无换行
const next = JSON.stringify(topics, null, 2);
if (checkOnly) {
  if (next !== topicsRaw) { console.error('✗ topics.json 与 alignments 不同步，请运行 node scripts/sync-cn-alignment.mjs'); process.exit(1); }
  console.log('✓ topics.json 已与 alignments 同步');
} else {
  fs.writeFileSync(topicsPath, next);
  console.log(`✓ 已同步 ${files.length} 个对齐文件到 topics.json`);
}
