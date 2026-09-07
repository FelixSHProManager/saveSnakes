/**
 * 故事目录管理 API 服务
 * 用法: node catalog-server.mjs [--dev] [--port 3456]
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  loadCatalog,
  loadSeriesMap,
  createPreviewToken,
  saveCatalog,
  getThumbnailPath,
  getStoryFolderPath,
  ROOT,
} from './shared/catalog-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const isDev = args.includes('--dev');
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? parseInt(args[portArg + 1], 10) : 3456;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/catalog', (_req, res) => {
  try {
    res.json(loadCatalog());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/archive/:folder/page_001.png', (req, res) => {
  const filePath = getThumbnailPath(req.params.folder);
  if (!filePath) return res.status(404).end();
  res.sendFile(filePath);
});

function openFolderInExplorer(folderPath) {
  return new Promise((resolve, reject) => {
    let cmd;
    let args;
    if (process.platform === 'win32') {
      cmd = 'explorer';
      args = [folderPath];
    } else if (process.platform === 'darwin') {
      cmd = 'open';
      args = [folderPath];
    } else {
      cmd = 'xdg-open';
      args = [folderPath];
    }
    const child = spawn(cmd, args, { shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || process.platform === 'win32') resolve(undefined);
      else reject(new Error(`打开文件夹失败，退出码 ${code}`));
    });
  });
}

app.post('/api/archive/:folder/open', async (req, res) => {
  try {
    const folderPath = getStoryFolderPath(req.params.folder);
    if (!folderPath) {
      return res.status(404).json({ error: '故事文件夹不存在' });
    }
    await openFolderInExplorer(folderPath);
    res.json({ ok: true, path: folderPath });
  } catch (e) {
    res.status(500).json({ error: e.message || '打开文件夹失败' });
  }
});

app.post('/api/catalog/preview', (req, res) => {
  try {
    const newMap = req.body?.map;
    if (!newMap || typeof newMap !== 'object') {
      return res.status(400).json({ error: '缺少 map 字段' });
    }
    const oldMap = loadSeriesMap();
    const { token, diff, changeCount } = createPreviewToken(oldMap, newMap);
    res.json({ token, diff, changeCount });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/catalog/save', (req, res) => {
  try {
    const { map: newMap, confirmToken } = req.body ?? {};
    if (!newMap || !confirmToken) {
      return res.status(400).json({ error: '缺少 map 或 confirmToken' });
    }
    const oldMap = loadSeriesMap();
    const result = saveCatalog(newMap, { confirmToken, originalMap: oldMap });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

if (!isDev) {
  const dist = path.join(__dirname, 'catalog-ui', 'dist');
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

let viteProcess = null;

function startVite() {
  const uiDir = path.join(__dirname, 'catalog-ui');
  viteProcess = spawn('npm', ['run', 'dev'], {
    cwd: uiDir,
    shell: true,
    stdio: 'inherit',
  });
}

app.listen(PORT, () => {
  console.log(`Catalog API → http://localhost:${PORT}`);
  if (isDev) {
    console.log('Dev mode: starting Vite frontend...');
    startVite();
  } else {
    console.log('Production mode: serving catalog-ui/dist');
  }
});

process.on('SIGINT', () => {
  if (viteProcess) viteProcess.kill();
  process.exit(0);
});
