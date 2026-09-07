import type { CatalogDiff } from '../types';

interface ConfirmDialogProps {
  open: boolean;
  step: 1 | 2;
  diff: CatalogDiff[];
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  step,
  diff,
  loading,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {step === 1 ? '确认变更内容' : '最终确认写入'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {step === 1
              ? `共 ${diff.length} 篇故事将被移动到其他子系列`
              : '此操作将备份原文件并写入磁盘，请再次确认'}
          </p>
        </div>

        {step === 1 && (
          <div className="max-h-80 overflow-y-auto px-6 py-4">
            <ul className="space-y-2">
              {diff.map((d) => (
                <li
                  key={d.title}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-900">{d.title}</span>
                  <div className="mt-1 text-xs text-slate-600">
                    {d.from} → {d.to}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 px-6 py-4 text-sm text-slate-700">
            <p>将修改以下文件：</p>
            <ul className="list-inside list-disc space-y-1 text-slate-600">
              <li>
                <code className="rounded bg-slate-100 px-1">_series_map.json</code>
              </li>
              <li>
                <code className="rounded bg-slate-100 px-1">故事目录.md</code>
              </li>
            </ul>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              写入前会自动备份到 <code>.catalog-backups/</code> 目录。
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-medium text-white shadow hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50"
          >
            {loading ? '保存中…' : step === 1 ? '继续' : '确认写入'}
          </button>
        </div>
      </div>
    </div>
  );
}
