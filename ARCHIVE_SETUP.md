# 绘本归档脚本（手动落盘说明）

当前 Cursor **Plan 模式**下无法自动创建 `package.json` / `archive.mjs`。请 **关闭 Plan 模式或切换到 Agent 模式** 后让助手生成文件；或按下面步骤自行创建。

## 1. 安装

在 `saveSnake` 目录执行：

```bash
npm install
npx playwright install chromium
```

## 2. `package.json`

见下方「文件：package.json」代码块。

## 3. `archive.mjs`

见下方「文件：archive.mjs」代码块。

## 4. `.gitignore`

```
node_modules/
archive/
links.md
failed.json
```

## 5. 运行

```bash
npm run archive
# 调试时可看浏览器：
npm run archive:headed
```

可选参数：`--links links.md`（默认） `--out archive` `--max-pages 200` `--headed` `--save-html`

---

## 文件：package.json

```json
{
  "name": "savesnake",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "archive": "node archive.mjs",
    "archive:headed": "node archive.mjs --headed"
  },
  "dependencies": {
    "playwright": "^1.52.0"
  }
}
```

## 文件：archive.mjs

将下列内容保存为项目根目录的 `archive.mjs`（与 `package.json`、`links.md` 同级）。

```javascript
/**
 * 豆包绘本 H5 归档：读取 links.md，移动设备 Context 打开每条链接，逐页截图并写 meta.json。
 * 用法：node archive.mjs [--links links.md] [--out archive] [--headed] [--save-html] [--max-pages 250] [--stable 2]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { chromium, devices } from 'playwright';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = {
    links: 'links.md',
    out: 'archive',
    headed: false,
    maxPages: 250,
    saveHtml: false,
    stableRounds: 2,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headed') args.headed = true;
    else if (a === '--save-html') args.saveHtml = true;
    else if (a === '--links') args.links = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--max-pages') args.maxPages = Math.max(1, parseInt(argv[++i], 10) || 250);
    else if (a === '--stable') args.stableRounds = Math.max(1, parseInt(argv[++i], 10) || 2);
  }
  return args;
}

function parseLinks(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Links file not found: ${filePath}`);
  const text = fs.readFileSync(filePath, 'utf8');
  const urls = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (/^https?:\/\//i.test(t)) urls.push(t);
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

async function tryGoNext(page) {
  const v = page.viewportSize();
  if (!v) return;

  await page.keyboard.press('ArrowRight').catch(() => {});

  const candidates = [
    page.getByRole('button', { name: /下一|下页|继续|下一步|下一页/i }).first(),
    page.locator('text=/下一页|下一张|^Next$/i').first(),
    page.locator('[class*="next" i], [data-action*="next" i]').first(),
  ];
  for (const loc of candidates) {
    try {
      if ((await loc.count()) > 0) {
        await loc.click({ timeout: 1200 });
        return;
      }
    } catch {
      /* try next */
    }
  }

  const x1 = Math.floor(v.width * 0.78);
  const x2 = Math.floor(v.width * 0.22);
  const y = Math.floor(v.height * 0.45);
  await page.mouse.move(x1, y);
  await page.mouse.down();
  await page.mouse.move(x2, y, { steps: 18 });
  await page.mouse.up();

  await page.mouse.click(Math.floor(v.width * 0.9), Math.floor(v.height * 0.48));
}

async function archiveOneStory(context, url, outRoot, opts, deviceLabel) {
  const id = storybookIdFromUrl(url);
  const dir = path.join(outRoot, id);
  fs.mkdirSync(dir, { recursive: true });

  const page = await context.newPage();
  const meta = {
    storybook_id: id,
    device: deviceLabel,
    archived_at: new Date().toISOString(),
    pages: [],
  };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await delay(1200);
    try {
      await page.waitForLoadState('networkidle', { timeout: 35_000 });
    } catch {
      /* SPA 可能长期有连接 */
    }

    let prevHash = null;
    let stable = 0;

    for (let i = 1; i <= opts.maxPages; i++) {
      await delay(500);
      const png = await page.screenshot({ type: 'png', fullPage: false });
      const h = sha256(png);
      const base = `page_${String(i).padStart(3, '0')}`;
      fs.writeFileSync(path.join(dir, `${base}.png`), png);

      if (opts.saveHtml) {
        const html = await page.content();
        fs.writeFileSync(path.join(dir, `${base}.html`), html, 'utf8');
      }

      meta.pages.push({ index: i, image: `${base}.png`, sha256: h });

      if (prevHash !== null && h === prevHash) {
        stable++;
        if (stable >= opts.stableRounds) break;
      } else {
        stable = 0;
      }
      prevHash = h;

      if (i === opts.maxPages) break;
      await tryGoNext(page);
      await delay(900);
    }

    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  } finally {
    await page.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const { label, contextOptions } = resolveDevice();

  const urls = parseLinks(opts.links);
  if (!urls.length) {
    console.error('No URLs in', opts.links);
    process.exit(1);
  }

  fs.mkdirSync(opts.out, { recursive: true });

  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext(contextOptions);

  const failed = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const id = storybookIdFromUrl(url);
    process.stdout.write(`[${i + 1}/${urls.length}] ${id} ... `);
    try {
      await archiveOneStory(context, url, opts.out, opts, label);
      console.log('ok');
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
```
