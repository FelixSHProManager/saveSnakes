import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  computeLocalDiff,
  fetchCatalog,
  openStoryFolder,
  previewChanges,
  saveChanges,
} from './api';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SeriesSidebar } from './components/SeriesSidebar';
import { StoryCard } from './components/StoryCard';
import { StoryPanel } from './components/StoryPanel';
import { SIDEBAR_WIDTH, parseSeriesDndId, parseStoryDndId } from './dnd';
import type { CatalogData, CatalogDiff, Story } from './types';

/** 三级碰撞：指针精确命中 → 侧栏内吸附最近行 → 卡片矩形重叠 */
const seriesFirstCollision: CollisionDetection = (args) => {
  const seriesContainers = args.droppableContainers.filter(
    (c) => c.data.current?.type === 'series',
  );
  const seriesArgs = { ...args, droppableContainers: seriesContainers };

  const pointerHits = pointerWithin(seriesArgs);
  if (pointerHits.length > 0) return pointerHits;

  const pointerX = args.pointerCoordinates?.x ?? 0;
  if (pointerX <= SIDEBAR_WIDTH) {
    const closestHits = closestCenter(seriesArgs);
    if (closestHits.length > 0) return closestHits;
  }

  const rectHits = rectIntersection(seriesArgs);
  if (rectHits.length > 0) return rectHits;

  return [];
};

function buildStoriesBySub(map: Record<string, string>, catalog: CatalogData) {
  const storyMeta = new Map<string, Story>();
  const parentBySub = new Map<string, string>();

  for (const group of catalog.tree) {
    for (const sub of group.subSeries) {
      parentBySub.set(sub.sub, group.parent);
      for (const story of sub.stories) {
        storyMeta.set(story.title, story);
      }
    }
  }

  const result: Record<string, Story[]> = {};
  for (const group of catalog.tree) {
    for (const sub of group.subSeries) {
      result[sub.sub] = [];
    }
  }

  for (const [title, sub] of Object.entries(map)) {
    const meta = storyMeta.get(title);
    if (!meta || !result[sub]) continue;
    result[sub].push({
      ...meta,
      sub,
      parent: parentBySub.get(sub) ?? meta.parent,
    });
  }

  for (const sub of Object.keys(result)) {
    result[sub].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  }
  return result;
}

function getDefaultSub(catalog: CatalogData) {
  return catalog.tree[0]?.subSeries[0]?.sub ?? '';
}

function getParentForSub(catalog: CatalogData, sub: string) {
  for (const group of catalog.tree) {
    if (group.subSeries.some((s) => s.sub === sub)) return group.parent;
  }
  return '';
}

export default function App() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [originalMap, setOriginalMap] = useState<Record<string, string>>({});
  const [currentMap, setCurrentMap] = useState<Record<string, string>>({});
  const [selectedSub, setSelectedSub] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [overSub, setOverSub] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [previewDiff, setPreviewDiff] = useState<CatalogDiff[]>([]);
  const [confirmToken, setConfirmToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCatalog();
      setCatalog(data);
      setOriginalMap({ ...data.map });
      setCurrentMap({ ...data.map });
      setSelectedSub((prev) => prev || getDefaultSub(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeCount = useMemo(
    () => computeLocalDiff(originalMap, currentMap).length,
    [originalMap, currentMap],
  );

  const storiesBySub = useMemo(() => {
    if (!catalog) return {};
    return buildStoriesBySub(currentMap, catalog);
  }, [catalog, currentMap]);

  const selectedStories = storiesBySub[selectedSub] ?? [];
  const selectedParent = catalog ? getParentForSub(catalog, selectedSub) : '';

  const handleDragStart = (event: DragStartEvent) => {
    const story = event.active.data.current?.story as Story | undefined;
    if (story) setActiveStory(story);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveStory(null);
    setOverSub(null);
    const { active, over } = event;
    if (!over) return;

    const title = parseStoryDndId(active.id);
    const targetSub = parseSeriesDndId(over.id);
    if (!title || !targetSub) return;
    if (currentMap[title] === targetSub) return;

    setCurrentMap((prev) => ({ ...prev, [title]: targetSub }));
    setSelectedSub(targetSub);
    setSuccessMsg('');
  };

  const handleDragOver = (event: DragOverEvent) => {
    const sub = event.over ? parseSeriesDndId(event.over.id) : null;
    setOverSub(sub);
  };

  const handleOpenFolder = useCallback(async (title: string) => {
    setError('');
    try {
      await openStoryFolder(title);
    } catch (e) {
      setError(`打开文件夹失败：${e instanceof Error ? e.message : '未知错误'}`);
    }
  }, []);

  const handleSubmit = async () => {
    if (changeCount === 0) return;
    try {
      const preview = await previewChanges(currentMap);
      setPreviewDiff(preview.diff);
      setConfirmToken(preview.token);
      setConfirmStep(1);
      setConfirmOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '预览失败');
    }
  };

  const handleConfirmStep = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }

    setSaving(true);
    try {
      const result = await saveChanges(currentMap, confirmToken);
      setConfirmOpen(false);
      setConfirmStep(1);
      setOriginalMap({ ...currentMap });
      setSuccessMsg(`已保存 ${result.changeCount} 处变更，备份于 ${result.backupPath}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        加载故事目录…
      </div>
    );
  }

  if (error && !catalog) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-slate-600">
        <p>{error}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-white"
        >
          重试
        </button>
      </div>
    );
  }

  if (!catalog) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={seriesFirstCollision}
      autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 8 }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
    >
      <div className="flex h-screen flex-col">
        <header className="z-40 shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <h1 className="text-lg font-bold text-slate-900">故事目录管理</h1>
              <p className="text-xs text-slate-500">
                共 {catalog.storyCount} 篇 · 左侧选系列 · 拖拽故事到左侧其他系列即可归类
              </p>
            </div>
            <div className="flex items-center gap-3">
              {changeCount > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                  {changeCount} 处未保存
                </span>
              )}
              <button
                type="button"
                disabled={changeCount === 0}
                onClick={handleSubmit}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow-md hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                提交更改
              </button>
            </div>
          </div>
          {successMsg && (
            <div className="border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-800">
              {successMsg}
            </div>
          )}
          {error && catalog && (
            <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-center text-sm text-red-700">
              {error}
            </div>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <SeriesSidebar
            tree={catalog.tree}
            storiesBySub={storiesBySub}
            selectedSub={selectedSub}
            overSub={overSub}
            isDragging={!!activeStory}
            onSelectSub={setSelectedSub}
          />
          <main className="min-w-0 flex-1 bg-slate-50/50">
            {selectedSub ? (
              <StoryPanel
                sub={selectedSub}
                parent={selectedParent}
                stories={selectedStories}
                activeStoryTitle={activeStory?.title ?? null}
                onOpenFolder={handleOpenFolder}
              />
            ) : null}
          </main>
        </div>
      </div>

      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null}>
        {activeStory ? (
          <div className="w-40 rotate-1 scale-105 opacity-95 shadow-2xl">
            <StoryCard story={activeStory} />
          </div>
        ) : null}
      </DragOverlay>

      <ConfirmDialog
        open={confirmOpen}
        step={confirmStep}
        diff={previewDiff}
        loading={saving}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmStep(1);
        }}
        onConfirm={handleConfirmStep}
      />
    </DndContext>
  );
}
