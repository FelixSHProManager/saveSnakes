/** 避免故事标题与子系列名冲突（如「恐龙岛大冒险」） */
export const storyDndId = (title: string) => `story:${title}`;
export const seriesDndId = (sub: string) => `series:${sub}`;

/** 与 SeriesSidebar w-72 保持一致，用于侧栏内碰撞吸附 */
export const SIDEBAR_WIDTH = 288;

export function parseStoryDndId(id: string | number) {
  const s = String(id);
  return s.startsWith('story:') ? s.slice(6) : null;
}

export function parseSeriesDndId(id: string | number) {
  const s = String(id);
  return s.startsWith('series:') ? s.slice(7) : null;
}
