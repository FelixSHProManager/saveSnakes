import { useDroppable } from '@dnd-kit/core';
import type { ParentGroup, Story } from '../types';
import { seriesDndId } from '../dnd';

interface SubSeriesItemProps {
  sub: string;
  parent: string;
  count: number;
  selected: boolean;
  isOver: boolean;
  isDragging: boolean;
  onSelect: () => void;
}

function SubSeriesItem({
  sub,
  parent,
  count,
  selected,
  isOver,
  isDragging,
  onSelect,
}: SubSeriesItemProps) {
  const { setNodeRef, isOver: isOverDrop } = useDroppable({
    id: seriesDndId(sub),
    data: { type: 'series', sub, parent },
  });

  const highlighted = isOver || isOverDrop;

  return (
    <li ref={setNodeRef} className="py-0.5">
      <button
        type="button"
        onClick={onSelect}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm transition ${
          highlighted
            ? 'border-l-4 border-emerald-500 bg-emerald-200/80 pl-2 ring-2 ring-emerald-400'
            : isDragging
              ? 'border border-dashed border-slate-200'
              : selected
                ? 'bg-emerald-50 font-medium text-emerald-900'
                : 'text-slate-700 hover:bg-slate-100'
        }`}
      >
        <span className="line-clamp-2 flex-1">{sub}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            count === 0
              ? 'bg-sky-100 text-sky-700'
              : selected
                ? 'bg-emerald-200 text-emerald-800'
                : 'bg-slate-200 text-slate-600'
          }`}
        >
          {count}
        </span>
      </button>
    </li>
  );
}

interface SeriesSidebarProps {
  tree: ParentGroup[];
  storiesBySub: Record<string, Story[]>;
  selectedSub: string;
  overSub: string | null;
  isDragging: boolean;
  onSelectSub: (sub: string) => void;
}

export function SeriesSidebar({
  tree,
  storiesBySub,
  selectedSub,
  overSub,
  isDragging,
  onSelectSub,
}: SeriesSidebarProps) {
  return (
    <aside
      className={`flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white transition ${
        isDragging ? 'z-30 shadow-lg' : 'z-10'
      }`}
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">系列目录</h2>
        <p className="mt-0.5 text-xs text-slate-500">点击切换 · 拖拽故事到此处归类</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {tree.map((group) => (
          <div key={group.parent} className="mb-4 last:mb-0">
            <h3 className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {group.parent}
            </h3>
            <ul className="space-y-1">
              {group.subSeries.map((sub) => {
                const count = storiesBySub[sub.sub]?.length ?? 0;
                return (
                  <SubSeriesItem
                    key={sub.sub}
                    sub={sub.sub}
                    parent={group.parent}
                    count={count}
                    selected={selectedSub === sub.sub}
                    isOver={overSub === sub.sub}
                    isDragging={isDragging}
                    onSelect={() => onSelectSub(sub.sub)}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
