/**
 * 344 篇故事 → 系列归类中间表 + 故事目录.md
 */
import fs from 'fs';
import {
  loadSeriesMap,
  buildClassificationResults,
  generateCatalogMarkdown,
  listArchiveTitles,
  OUT_JSON,
  OUT_MD,
} from './shared/catalog-core.mjs';

function main() {
  const seriesMap = loadSeriesMap();
  const titles = listArchiveTitles();
  const results = buildClassificationResults(seriesMap);

  if (results.length !== titles.length) {
    throw new Error(`Expected ${titles.length}, got ${results.length}`);
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, generateCatalogMarkdown(seriesMap), 'utf8');
  console.log('OK:', results.length, 'stories →', OUT_MD);
}

main();
