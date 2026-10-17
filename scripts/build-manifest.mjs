#!/usr/bin/env node
// build-manifest.mjs — 重新生成 data/manifest.json：计数 + 各数据文件 sha256。
// 改完 data/ 下任何文件后运行一次，validate.mjs 会核对校验和。
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (f) => JSON.parse(readFileSync(resolve(DATA, f), 'utf8'));
const countBy = (xs, f) => Object.fromEntries([...xs.reduce((m, x) => m.set(f(x), (m.get(f(x)) || 0) + 1), new Map())].sort());

const FILES = [
  'topics.json', 'dependencies.json', 'curriculum-standards.json', 'clusters.json',
  'cn-standards.json', 'cn-topics.json', 'cn-dependencies.json', 'cn-math-2022.json',
  ...(existsSync(resolve(DATA, 'alignments')) ? readdirSync(resolve(DATA, 'alignments')).filter((f) => f.endsWith('.json')).map((f) => `alignments/${f}`) : []),
].filter((f) => existsSync(resolve(DATA, f)));

const topics = read('topics.json').topics;
const cnTopics = existsSync(resolve(DATA, 'cn-topics.json')) ? read('cn-topics.json').topics : [];
const cnDeps = existsSync(resolve(DATA, 'cn-dependencies.json')) ? read('cn-dependencies.json').dependencies : [];
const alignments = FILES.filter((f) => f.startsWith('alignments/')).map((f) => read(f));

const manifest = {
  dataset: 'Marble Skill Taxonomy · 中文版（对齐中国课标）',
  taxonomyVersion: 'v1',
  upstream: ['https://github.com/withmarbleapp/os-taxonomy', 'https://github.com/bewho/os-taxonomy'],
  counts: {
    topics: topics.length,
    topicsBySubject: countBy(topics, (t) => t.subject),
    cnTopics: cnTopics.length,
    dependencies: read('dependencies.json').dependencies.length,
    cnDependencies: cnDeps.length,
    curricula: read('curriculum-standards.json').curricula.length,
    cnMath2022Standards: read('cn-math-2022.json').topics.length,
    clusters: read('clusters.json').clusters.length,
    alignments: Object.fromEntries(alignments.map((a) => [a.curriculum, countBy(a.alignments, (x) => x.status)])),
  },
  files: Object.fromEntries(FILES.map((f) => {
    const buf = readFileSync(resolve(DATA, f));
    return [f, { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }];
  })),
};
writeFileSync(resolve(DATA, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ manifest.json：${FILES.length} 个文件`);
