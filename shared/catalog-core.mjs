/**
 * 故事目录核心：系列结构、加载/保存、Markdown 生成、diff
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const ROOT = process.cwd();
export const ARCHIVE = path.join(ROOT, 'archive');
export const MAP_FILE = path.join(ROOT, '_series_map.json');
export const OUT_MD = path.join(ROOT, '故事目录.md');
export const OUT_JSON = path.join(ROOT, '_story_classification.json');
export const BACKUP_DIR = path.join(ROOT, '.catalog-backups');
export const SERIES_MD = path.join(ROOT, '系列归类.md');

/** 从 系列归类.md 读取最新系列结构（避免服务重启后才能看到新子系列） */
export function getSeriesStructure() {
  const content = fs.readFileSync(SERIES_MD, 'utf8');
  const structure = {};
  let currentParent = null;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      currentParent = trimmed.slice(2).trim();
      structure[currentParent] = [];
    } else if (trimmed.startsWith('## ') && currentParent) {
      structure[currentParent].push(trimmed.slice(3).trim());
    }
  }
  return structure;
}

export function getSubToParent() {
  const structure = getSeriesStructure();
  const map = {};
  for (const [parent, subs] of Object.entries(structure)) {
    for (const sub of subs) map[sub] = parent;
  }
  return map;
}

export function getAllSubSeries() {
  return new Set(Object.keys(getSubToParent()));
}

/** @deprecated 请使用 getSeriesStructure()，保留仅为兼容 */
export const SERIES_STRUCTURE = getSeriesStructure();

const FOREST_DAILY = new Set([
  '森林日报第一期',
  '森林日报第二期',
  '森林日报第三期',
]);

export function readStoryMeta(title) {
  const dir = path.join(ARCHIVE, title);
  if (!fs.existsSync(dir)) {
    return { title, summary: '', path: '', hasThumbnail: false };
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('故事文本.md'));
  const storyPath = files.length
    ? `archive/${title}/${files[0]}`
    : `archive/${title}/${title}故事文本.md`;
  let summary = '';
  if (files.length) {
    const text = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    const m = text.match(/page_001[：:](.+)/);
    summary = m ? m[1].trim() : '';
    // 去掉标题前缀（分号前）
    const parts = summary.split(/[；;]/);
    if (parts.length > 1) summary = parts.slice(1).join('；').trim();
  }
  const hasThumbnail = fs.existsSync(path.join(dir, 'page_001.png'));
  return { title, summary, path: storyPath, hasThumbnail };
}

export function listArchiveTitles() {
  return fs
    .readdirSync(ARCHIVE, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function loadSeriesMap() {
  return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
}

export function validateSeriesMap(map) {
  const titles = listArchiveTitles();
  const allSubSeries = getAllSubSeries();
  const errors = [];

  for (const title of titles) {
    if (!map[title]) errors.push(`缺少归类: ${title}`);
    else if (!allSubSeries.has(map[title])) {
      errors.push(`未知子系列 "${map[title]}" (${title})`);
    }
  }

  for (const key of Object.keys(map)) {
    if (!titles.includes(key)) errors.push(`多余条目: ${key}`);
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return true;
}

export function buildClassificationResults(map) {
  const titles = listArchiveTitles();
  const subToParent = getSubToParent();
  return titles.map((title) => {
    const sub = map[title];
    const { summary } = readStoryMeta(title);
    return {
      title,
      summary,
      parent: subToParent[sub],
      sub,
      confidence: FOREST_DAILY.has(sub) ? 'confirmed' : 'high',
      reason: 'series map',
      path: `archive/${title}/${title}故事文本.md`,
    };
  });
}

export function generateCatalogMarkdown(map) {
  const results = buildClassificationResults(map);
  const seriesStructure = getSeriesStructure();
  const bySub = {};
  for (const r of results) {
    if (!bySub[r.sub]) bySub[r.sub] = [];
    bySub[r.sub].push(r);
  }

  const total = results.length;
  const lines = [
    '# 故事目录',
    '',
    `> 共 **${total}** 篇故事，按 [系列归类.md](系列归类.md) 结构整理。`,
    '',
  ];

  for (const [parent, subs] of Object.entries(seriesStructure)) {
    lines.push(`# ${parent}`, '');
    for (const sub of subs) {
      lines.push(`## ${sub}`, '');
      const items = (bySub[sub] || []).sort((a, b) =>
        a.title.localeCompare(b.title, 'zh-CN'),
      );
      for (const item of items) {
        lines.push(`- [${item.title}](${item.path})`);
      }
      lines.push('');
    }
  }

  lines.push('---', '', '## 统计', '', '| 子系列 | 篇数 |', '| --- | ---: |');
  let sum = 0;
  for (const subs of Object.values(seriesStructure)) {
    for (const sub of subs) {
      const n = (bySub[sub] || []).length;
      sum += n;
      lines.push(`| ${sub} | ${n} |`);
    }
  }
  lines.push(`| **合计** | **${sum}** |`, '');

  lines.push(
    '## 归类说明',
    '',
    '### 森林日报（按主题推断写入，供核对）',
    '',
    '| 期别 | 故事 | 依据 |',
    '| --- | --- | --- |',
    '| 第一期 | 森林厨艺大赛、森林捉迷藏大赛、森林表演日 | 森林社区赛事/活动 |',
    '| 第二期 | 森林小卫士、森林里的阿机 | 森林记录/日记/科技探险 |',
    '| 第三期 | 魔法喵的新年晚会、橘子的舞台 | 大型节庆/采访报道 |',
    '',
    '每篇故事仅归入一个子系列；`_1`、`_2` 等同名变体保留为独立条目。',
    '',
  );

  return lines.join('\n');
}

export function computeDiff(oldMap, newMap) {
  const changes = [];
  const allKeys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
  for (const title of allKeys) {
    const from = oldMap[title];
    const to = newMap[title];
    if (from !== to) {
      changes.push({ title, from: from ?? null, to: to ?? null });
    }
  }
  return changes.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

export function createPreviewToken(oldMap, newMap) {
  const diff = computeDiff(oldMap, newMap);
  const payload = JSON.stringify(diff);
  const token = crypto.createHash('sha256').update(payload).digest('hex');
  return { token, diff, changeCount: diff.length };
}

export function verifyPreviewToken(oldMap, newMap, token) {
  const { token: expected } = createPreviewToken(oldMap, newMap);
  return token === expected;
}

function backupFiles() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(BACKUP_DIR, ts);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(MAP_FILE, path.join(dir, '_series_map.json'));
  if (fs.existsSync(OUT_MD)) {
    fs.copyFileSync(OUT_MD, path.join(dir, '故事目录.md'));
  }
  return dir;
}

export function saveCatalog(newMap, { confirmToken, originalMap } = {}) {
  validateSeriesMap(newMap);

  if (confirmToken !== undefined && originalMap !== undefined) {
    if (!verifyPreviewToken(originalMap, newMap, confirmToken)) {
      throw new Error('确认令牌无效，请重新预览后再提交');
    }
  }

  const backupPath = backupFiles();

  const sortedMap = {};
  for (const title of listArchiveTitles()) {
    sortedMap[title] = newMap[title];
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(sortedMap, null, 2) + '\n', 'utf8');

  const results = buildClassificationResults(sortedMap);
  fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, generateCatalogMarkdown(sortedMap), 'utf8');

  return {
    backupPath,
    storyCount: results.length,
    changeCount: originalMap ? computeDiff(originalMap, sortedMap).length : 0,
  };
}

/** API 用：组装完整目录树 */
export function loadCatalog() {
  const map = loadSeriesMap();
  const titles = listArchiveTitles();
  validateSeriesMap(map);

  const seriesStructure = getSeriesStructure();
  const subToParent = getSubToParent();
  const allSubSeries = getAllSubSeries();

  const storiesBySub = {};
  for (const sub of allSubSeries) storiesBySub[sub] = [];

  const stories = titles.map((title) => {
    const sub = map[title];
    const meta = readStoryMeta(title);
    const story = {
      title,
      sub,
      parent: subToParent[sub],
      summary: meta.summary,
      path: meta.path,
      thumbnailUrl: `/api/archive/${encodeURIComponent(title)}/page_001.png`,
      hasThumbnail: meta.hasThumbnail,
    };
    storiesBySub[sub].push(story);
    return story;
  });

  for (const sub of Object.keys(storiesBySub)) {
    storiesBySub[sub].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  }

  const tree = Object.entries(seriesStructure).map(([parent, subs]) => ({
    parent,
    subSeries: subs.map((sub) => ({
      sub,
      stories: storiesBySub[sub] || [],
      count: (storiesBySub[sub] || []).length,
    })),
  }));

  return {
    structure: seriesStructure,
    tree,
    map,
    storyCount: stories.length,
  };
}

export function getThumbnailPath(folder) {
  const decoded = decodeURIComponent(folder);
  const filePath = path.join(ARCHIVE, decoded, 'page_001.png');
  if (!filePath.startsWith(ARCHIVE)) return null;
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

export function getStoryFolderPath(folder) {
  const decoded = decodeURIComponent(folder);
  const folderPath = path.resolve(ARCHIVE, decoded);
  const archiveRoot = path.resolve(ARCHIVE);
  if (!folderPath.startsWith(archiveRoot + path.sep) && folderPath !== archiveRoot) {
    return null;
  }
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    return null;
  }
  return folderPath;
}
