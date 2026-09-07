/**
 * 豆包绘本 H5 归档：读取 links.md，移动设备 Context 打开每条链接，逐页截图并写 meta.json。
 * 用法：node archive.mjs [--links links.md] [--out archive] [--headed] [--save-html] [--max-pages 250]
 *       [--advance-attempts 18] [--advance-pause 1100]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { chromium, devices } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = {
    links: 'links.md',
    out: 'archive',
    headed: false,
    maxPages: 250,
    saveHtml: false,
    /** 每次翻页最多尝试多少种手势/组合（豆包等 H5 在部分页只响应某一种） */
    advanceAttempts: 18,
    /** 每次尝试后等待动画的时间（毫秒） */
    advancePauseMs: 1100,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headed') args.headed = true;
    else if (a === '--save-html') args.saveHtml = true;
    else if (a === '--links') args.links = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--max-pages') args.maxPages = Math.max(1, parseInt(argv[++i], 10) || 250);
    else if (a === '--advance-attempts') args.advanceAttempts = Math.max(1, parseInt(argv[++i], 10) || 18);
    else if (a === '--advance-pause') args.advancePauseMs = Math.max(100, parseInt(argv[++i], 10) || 1100);
  }
  return args;
}

/** 在 cwd 与脚本所在目录查找 links 文件（避免从别的目录执行 npm run 时读错空文件） */
function resolveLinksPath(linksArg) {
  if (path.isAbsolute(linksArg)) {
    if (fs.existsSync(linksArg)) return linksArg;
    throw new Error(`Links file not found: ${linksArg}`);
  }
  const candidates = [path.resolve(process.cwd(), linksArg), path.resolve(__dirname, linksArg)];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Links file not found: ${linksArg}\n  tried: ${candidates.join('\n  ')}`,
  );
}

/** 从全文提取 http(s) URL（支持 Markdown 链接、忽略 BOM）；整行必须以 http 开头时易漏，故用正则 */
function parseLinks(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
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
  return urls;
}

function storybookIdFromUrl(url) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('storybook_id');
    if (id) return id;
  } catch {
    /* ignore */
  }
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/** Windows 非法文件名字符 */
function sanitizeDirName(name) {
  if (!name || typeof name !== 'string') return null;
  const s = name
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '')
    .slice(0, 80);
  return s || null;
}

/**
 * 输出目录：有标题时用标题；同名且不同 storybook_id 时用 标题_1、标题_2…
 * 若目录已存在且 meta 中 storybook_id 相同，则复用（便于同一本重跑）。
 */
function resolveStoryDir(outRoot, storybookId, title) {
  const safeTitle = sanitizeDirName(title);
  if (!safeTitle) return path.join(outRoot, storybookId);

  for (let suffix = 0; suffix < 10_000; suffix++) {
    const folderName = suffix === 0 ? safeTitle : `${safeTitle}_${suffix}`;
    const dir = path.join(outRoot, folderName);

    if (!fs.existsSync(dir)) return dir;

    const metaPath = path.join(dir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.storybook_id === storybookId) return dir;
      } catch {
        /* 占用该名，尝试下一后缀 */
      }
    }
  }

  throw new Error(`无法为标题「${safeTitle}」分配目录名（同名文件夹过多）`);
}

/** 仅剔除你指定的 UI 文案，避免误删正文中可能出现的词 */
const UI_PHRASES_TO_STRIP = ['点击任意位置开始播放', '去创作', '由豆包爱学AI生成'];

function filterUiNoise(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text;
  for (const phrase of UI_PHRASES_TO_STRIP) {
    s = s.split(phrase).join('');
  }
  s = s.replace(/\d+\s*\/\s*\d+/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function joinSegments(parts) {
  return parts.map((p) => filterUiNoise(String(p))).filter(Boolean).join('；');
}

/** 监听 public_detail，返回完整 story_book（含 title、description、pages[].page_text） */
function waitForStoryBookFromApi(page, timeoutMs = 35_000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (book) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.off('response', onResponse);
      resolve(book);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    const onResponse = async (response) => {
      if (!response.url().includes('story_book/public_detail')) return;
      try {
        const json = await response.json();
        if (json?.story_book) finish(json.story_book);
      } catch {
        /* ignore */
      }
    };

    page.on('response', onResponse);
  });
}

/** 方案 A：page_001 为封面（标题+简介），page_002 起为 API 各页 page_text */
function buildStoryMarkdown(storyBook, fallbackTitle) {
  const lines = [];
  const title = sanitizeDirName(storyBook?.title) || sanitizeDirName(fallbackTitle);
  const cover = joinSegments([title, storyBook?.description]);
  if (cover) lines.push(`page_001：${cover}`);

  const pages = [...(storyBook?.pages || [])].sort(
    (a, b) => (a.page_index ?? 0) - (b.page_index ?? 0),
  );
  for (let i = 0; i < pages.length; i++) {
    const body = filterUiNoise(pages[i].page_text);
    if (!body) continue;
    const key = `page_${String(i + 2).padStart(3, '0')}`;
    lines.push(`${key}：${body}`);
  }

  return lines.join('\n\n');
}

function writeStoryTextFile(dir, title, storyBook) {
  const safeTitle = sanitizeDirName(title) || sanitizeDirName(storyBook?.title) || '未命名';
  const fileName = `${safeTitle}故事文本.md`;
  const filePath = path.join(dir, fileName);
  const body = buildStoryMarkdown(storyBook, title);
  const content = body
    ? `${body}\n`
    : `${safeTitle}\n\n（未能从接口获取故事正文，请检查链接是否有效）\n`;
  fs.writeFileSync(filePath, content, 'utf8');
  return fileName;
}

/** DOM 回退：首屏标题节点（class 含 title-，如 title-u4SPHx） */
async function extractStoryTitleFromDom(page) {
  const selectors = [
    '[class*="title-" i][class*="show" i]',
    '[class*="title-" i]',
    '[class*="book-title" i]',
    'h1',
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      const text = sanitizeDirName(await loc.textContent({ timeout: 2000 }));
      if (text && !/豆包|绘本创作/.test(text)) return text;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** 对齐 Chrome「iPhone 17」：Playwright 有内置则用内置，否则回退到接近机型或手工视口 */
function resolveDevice() {
  if (devices['iPhone 17'])
    return { label: 'iPhone 17 (Playwright devices)', contextOptions: devices['iPhone 17'] };
  if (devices['iPhone 16 Pro'])
    return { label: 'iPhone 16 Pro (fallback)', contextOptions: devices['iPhone 16 Pro'] };
  if (devices['iPhone 15'])
    return { label: 'iPhone 15 (fallback)', contextOptions: devices['iPhone 15'] };
  return {
    label: 'iPhone17-like manual (402x874)',
    contextOptions: {
      viewport: { width: 402, height: 874 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
    },
  };
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function swipeMouse(page, x0r, x1r, yr, steps = 22) {
  const v = page.viewportSize();
  if (!v) return;
  const y = Math.floor(v.height * yr);
  const x0 = Math.floor(v.width * x0r);
  const x1 = Math.floor(v.width * x1r);
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x1, y, { steps });
  await page.mouse.up();
}

async function dragBody(page, x0r, x1r, yr) {
  const v = page.viewportSize();
  if (!v) return;
  const body = page.locator('body');
  const y = Math.floor(v.height * yr);
  const from = { x: Math.floor(v.width * x0r), y };
  const to = { x: Math.floor(v.width * x1r), y };
  try {
    await body.dragTo(body, { force: true, sourcePosition: from, targetPosition: to, timeout: 3000 });
  } catch {
    await swipeMouse(page, x0r, x1r, yr);
  }
}

async function clickUiNext(page) {
  const candidates = [
    page.getByRole('button', { name: /下一|下页|继续|下一步|下一页|向右|翻页/i }).first(),
    page.getByRole('link', { name: /下一|下页|继续/i }).first(),
    page.locator('text=/下一页|下一张|^Next$/i').first(),
    page.locator('[class*="next" i], [data-action*="next" i], [class*="arrow-right" i]').first(),
  ];
  for (const loc of candidates) {
    try {
      if ((await loc.count()) > 0) {
        await loc.click({ timeout: 1500 });
        return true;
      }
    } catch {
      /* continue */
    }
  }
  return false;
}

/** 第 a 次尝试：前几轮优先横向滑动/drag（绘本常见），再按键与 UI */
async function runAdvanceStrategy(page, a) {
  try {
    const v = page.viewportSize();
    if (!v) return;

    const strategies = [
      () => swipeMouse(page, 0.82, 0.12, 0.42, 30),
      () => swipeMouse(page, 0.9, 0.08, 0.42, 34),
      () => dragBody(page, 0.86, 0.1, 0.44),
      () => swipeMouse(page, 0.78, 0.15, 0.52, 28),
      () => swipeMouse(page, 0.95, 0.04, 0.35, 36),
      () => clickUiNext(page),
      () => swipeMouse(page, 0.72, 0.2, 0.58, 24),
      () => dragBody(page, 0.88, 0.12, 0.5),
      async () => {
        await page.keyboard.press('ArrowRight').catch(() => {});
        await page.keyboard.press('ArrowDown').catch(() => {});
        await page.keyboard.press('Space').catch(() => {});
      },
      () => swipeMouse(page, 0.18, 0.82, 0.45, 28),
      async () => {
        const mx = Math.floor(v.width * 0.5);
        const my = Math.floor(v.height * 0.45);
        await page.mouse.move(mx, my);
        await page.mouse.wheel(500, 0).catch(() => {});
        await page.keyboard.press('PageDown').catch(() => {});
      },
      async () => {
        const x = Math.floor(v.width * 0.9);
        const y = Math.floor(v.height * 0.48);
        await page.mouse.click(x, y);
        await delay(120);
        await page.mouse.click(x, y);
      },
      () =>
        page.locator('body').tap({ position: { x: Math.floor(v.width * 0.88), y: Math.floor(v.height * 0.46) } }),
      () =>
        page
          .locator('canvas, [class*="book" i], [class*="page" i], body')
          .first()
          .tap({
            position: { x: Math.floor(v.width * 0.85), y: Math.floor(v.height * 0.45) },
            timeout: 2000,
          }),
      async () => {
        await page.keyboard.press('Enter').catch(() => {});
        await swipeMouse(page, 0.8, 0.2, 0.35, 20);
      },
    ];

    const fn = strategies[a % strategies.length];
    await fn();
  } catch {
    /* 单次手势失败不中断整轮 */
  }
}

/** 反复尝试直到视口截图哈希与 beforeHash 不同，或用尽次数 */
async function advanceUntilChanged(page, beforeHash, opts) {
  const max = opts.advanceAttempts ?? 18;
  const pause = opts.advancePauseMs ?? 1100;
  for (let attempt = 0; attempt < max; attempt++) {
    await runAdvanceStrategy(page, attempt);
    await delay(pause);
    const h = sha256(await page.screenshot({ type: 'png', fullPage: false }));
    if (h !== beforeHash) return true;
  }
  return false;
}

async function archiveOneStory(context, url, outRoot, opts, deviceLabel) {
  const id = storybookIdFromUrl(url);

  const page = await context.newPage();
  const storyBookPromise = waitForStoryBookFromApi(page);

  const meta = {
    storybook_id: id,
    title: null,
    folder: null,
    text_file: null,
    device: deviceLabel,
    archived_at: new Date().toISOString(),
    pages: [],
  };

  let dir;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await delay(1200);
    try {
      await page.waitForLoadState('networkidle', { timeout: 35_000 });
    } catch {
      /* SPA 可能长期有连接 */
    }

    const storyBook = await storyBookPromise;
    const title =
      sanitizeDirName(storyBook?.title) || (await extractStoryTitleFromDom(page));
    meta.title = title;
    dir = resolveStoryDir(outRoot, id, title);
    meta.folder = path.basename(dir);
    fs.mkdirSync(dir, { recursive: true });

    let i = 0;
    while (i < opts.maxPages) {
      i += 1;
      await delay(450);
      const png = await page.screenshot({ type: 'png', fullPage: false });
      const h = sha256(png);
      const base = `page_${String(i).padStart(3, '0')}`;
      fs.writeFileSync(path.join(dir, `${base}.png`), png);

      if (opts.saveHtml) {
        const html = await page.content();
        fs.writeFileSync(path.join(dir, `${base}.html`), html, 'utf8');
      }

      meta.pages.push({ index: i, image: `${base}.png`, sha256: h });

      if (i >= opts.maxPages) break;

      const moved = await advanceUntilChanged(page, h, opts);
      if (!moved) break;
    }

    meta.text_file = writeStoryTextFile(dir, title, storyBook);
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    return meta.folder;
  } finally {
    await page.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const { label, contextOptions } = resolveDevice();

  const linksPath = resolveLinksPath(opts.links);
  const urls = parseLinks(linksPath);
  if (!urls.length) {
    console.error('No URLs found in', linksPath);
    process.exit(1);
  }

  const outDir = path.isAbsolute(opts.out) ? opts.out : path.resolve(process.cwd(), opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext(contextOptions);

  const failed = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const id = storybookIdFromUrl(url);
    process.stdout.write(`[${i + 1}/${urls.length}] ${id} ... `);
    try {
      const folderName = await archiveOneStory(context, url, outDir, opts, label);
      console.log(folderName ? `ok → ${folderName}` : 'ok');
    } catch (e) {
      console.log('FAIL', e?.message || e);
      failed.push({ url, id, error: String(e?.message || e) });
    }
  }

  await context.close();
  await browser.close();

  if (failed.length) {
    fs.writeFileSync(path.join(process.cwd(), 'failed.json'), JSON.stringify(failed, null, 2), 'utf8');
    console.error('Wrote failed.json', failed.length);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
