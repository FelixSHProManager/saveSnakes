/**
 * 扫描 archive/，将尚未归类的新故事默认归入「待定」，并重新生成故事目录.md
 */
import { syncPendingStories, PENDING_SUB } from './shared/catalog-core.mjs';

const { added, storyCount } = syncPendingStories();

if (added.length === 0) {
  console.log(`无新故事，当前共 ${storyCount} 篇。`);
} else {
  console.log(`已归入「${PENDING_SUB}」: ${added.join('、')}`);
  console.log(`OK: ${storyCount} 篇 → 故事目录.md`);
}
