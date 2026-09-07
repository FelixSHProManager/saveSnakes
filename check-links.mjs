import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const linksPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'links.md');
const raw = fs.readFileSync(linksPath, 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/);

const seen = new Set();
const urls = [];
const re = /https?:\/\/\S+/gi;
let m;
while ((m = re.exec(raw)) !== null) {
  let u = m[0].replace(/[`'".,;:!?)\]]+$/g, '');
  try {
    new URL(u);
  } catch {
    continue;
  }
  if (!seen.has(u)) {
    seen.add(u);
    urls.push(u);
  }
}

const badLines = [];
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (!t || t.startsWith('#')) continue;
  if (/^https?:\/\//i.test(t)) continue;
  if (/^[a-z]+:\/\//i.test(t)) badLines.push({ line: i + 1, text: t });
}

const urlToLines = new Map();
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (!/^https?:\/\//i.test(t)) continue;
  const lr = /https?:\/\/\S+/gi;
  let mm;
  while ((mm = lr.exec(t)) !== null) {
    let u = mm[0].replace(/[`'".,;:!?)\]]+$/g, '');
    if (!urlToLines.has(u)) urlToLines.set(u, []);
    urlToLines.get(u).push(i + 1);
  }
}

const exactDupes = [...urlToLines.entries()].filter(([, ls]) => ls.length > 1);
const idMap = new Map();
for (const url of urls) {
  const id = new URL(url).searchParams.get('storybook_id');
  if (!idMap.has(id)) idMap.set(id, []);
  idMap.get(id).push(urlToLines.get(url));
}

const REQ = ['storybook_id', 'share_user_id', 'unique_key', 'share_token'];
const formatBad = [];
for (const url of urls) {
  const u = new URL(url);
  const p = [];
  if (u.hostname !== 'hd.dbaxyunying.com') p.push('域名不对');
  if (!u.pathname.includes('storybook/page.html')) p.push('路径不对');
  for (const k of REQ) if (!u.searchParams.get(k)) p.push(`缺少 ${k}`);
  if (p.length) formatBad.push({ id: u.searchParams.get('storybook_id'), p });
}

const nonStory = [];
const reAll = /https?:\/\/\S+/gi;
let mm;
while ((mm = reAll.exec(raw)) !== null) {
  if (!mm[0].includes('hd.dbaxyunying.com/edu/turing/storybook')) nonStory.push(mm[0]);
}

console.log('=== links.md 校验报告 ===\n');
console.log(`文件行数: ${lines.length}`);
console.log(`唯一 URL（程序将处理）: ${urls.length}`);
console.log(`唯一 storybook_id: ${idMap.size}\n`);

if (badLines.length) {
  console.log(`【问题行】${badLines.length} 处（不会进入归档，建议删除）:`);
  for (const x of badLines) console.log(`  行 ${x.line}: ${x.text}`);
  console.log('');
}

if (exactDupes.length) {
  console.log(`【完全重复 URL】${exactDupes.length} 组（去重后只跑 1 次）:`);
  for (const [url, ls] of exactDupes) {
    console.log(`  id=${new URL(url).searchParams.get('storybook_id')}  行 ${ls.join(', ')}`);
  }
  console.log('');
}

if (formatBad.length) {
  console.log(`【格式错误】${formatBad.length} 条`);
  for (const x of formatBad) console.log(`  id=${x.id}: ${x.p.join(', ')}`);
  console.log('');
} else {
  console.log('【格式】全部绘本链接含 storybook_id / share_user_id / unique_key / share_token，域名与路径正确。\n');
}

if (nonStory.length) {
  console.log(`【非绘本 https 被正则匹配到】${nonStory.length} 处（不会进入 urls 列表）:`);
  for (const x of nonStory) console.log(`  ${x}`);
  console.log('');
}

console.log(`结论: 正式跑任务将处理 ${urls.length} 本；${badLines.length ? '请先处理问题行' : '无阻塞性格式问题'}。`);
