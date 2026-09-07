import type { Story } from '../types';
import { StoryCard } from './StoryCard';

interface StoryPanelProps {
  sub: string;
  parent: string;
  stories: Story[];
  activeStoryTitle: string | null;
  onOpenFolder?: (title: string) => void;
}

export function StoryPanel({
  sub,
  parent,
  stories,
  activeStoryTitle,
  onOpenFolder,
}: StoryPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 bg-white/80 px-6 py-4 backdrop-blur">
        <p className="text-xs font-medium text-emerald-600">{parent}</p>
        <h2 className="mt-0.5 text-xl font-bold text-slate-900">{sub}</h2>
        <p className="mt-1 text-sm text-slate-500">
          共 {stories.length} 篇故事 · 双击卡片可在资源管理器中打开故事文件夹
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {stories.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
            该系列暂无故事，可从其他系列拖拽故事到左侧目录
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {stories.map((story) => (
              <StoryCard
                key={story.title}
                story={story}
                isDragging={activeStoryTitle === story.title}
                onOpenFolder={onOpenFolder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
