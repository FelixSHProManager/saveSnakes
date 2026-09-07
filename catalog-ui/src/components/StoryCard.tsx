import { useDraggable } from '@dnd-kit/core';
import { useRef } from 'react';
import type { Story } from '../types';
import { storyDndId } from '../dnd';

interface StoryCardProps {
  story: Story;
  isDragging?: boolean;
  onOpenFolder?: (title: string) => void;
}

export function StoryCard({ story, isDragging, onOpenFolder }: StoryCardProps) {
  const openingRef = useRef(false);

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: storyDndId(story.title),
    data: { type: 'story', story },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (openingRef.current || !onOpenFolder) return;
    openingRef.current = true;
    Promise.resolve(onOpenFolder(story.title)).finally(() => {
      openingRef.current = false;
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={isDragging ? { visibility: 'hidden' } : style}
      {...listeners}
      {...attributes}
      title="双击打开文件夹"
      onDoubleClick={handleDoubleClick}
      className={`group cursor-grab active:cursor-grabbing rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
        isDragging ? 'opacity-40 ring-2 ring-emerald-400' : 'border-slate-200'
      }`}
    >
      <div className="overflow-hidden rounded-t-2xl bg-slate-100">
        {story.hasThumbnail ? (
          <img
            src={story.thumbnailUrl}
            alt={story.title}
            className="mx-auto h-36 w-full object-cover object-top"
            draggable={false}
            loading="lazy"
          />
        ) : (
          <div className="flex h-36 items-center justify-center text-sm text-slate-400">
            暂无封面
          </div>
        )}
      </div>
      <div className="p-3">
        <h4 className="line-clamp-1 text-sm font-semibold text-slate-900">{story.title}</h4>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
          {story.summary || '暂无简介'}
        </p>
      </div>
    </div>
  );
}
