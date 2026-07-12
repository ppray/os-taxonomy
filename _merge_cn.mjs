import fs from 'fs';
const SRC = 'F:/Documents/notey/002-Area/AI时代的教育/os-taxonomy-zh-art/data';
// 合并标准
const cs = JSON.parse(fs.readFileSync(SRC + '/cn-standards.json', 'utf8'));
const add = JSON.parse(fs.readFileSync(SRC + '/_add_cn_standards.json', 'utf8')).add;
const cur = cs.curricula.find(c => c.slug === 'cn-2022');
const have = new Set(cur.topics.map(t => t.key));
let n = 0;
for (const t of add) if (!have.has(t.key)) { cur.topics.push(t); n++; }
fs.writeFileSync(SRC + '/cn-standards.json', JSON.stringify(cs));
// 合并中国特有节点
const ct = JSON.parse(fs.readFileSync(SRC + '/cn-topics.json', 'utf8'));
const addT = JSON.parse(fs.readFileSync(SRC + '/_add_cn_topics.json', 'utf8')).add;
const haveT = new Set(ct.topics.map(t => t.id));
let m = 0;
for (const t of addT) if (!haveT.has(t.id)) { ct.topics.push(t); m++; }
fs.writeFileSync(SRC + '/cn-topics.json', JSON.stringify(ct));
console.error('✓ merged standards +' + n + ' (total cn-2022=' + cur.topics.length + '), topics +' + m + ' (total cn-topics=' + ct.topics.length + ')');
