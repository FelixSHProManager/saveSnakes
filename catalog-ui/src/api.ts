import type { CatalogData, PreviewResult } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

export function fetchCatalog() {
  return request<CatalogData>('/api/catalog');
}

export function previewChanges(map: Record<string, string>) {
  return request<PreviewResult>('/api/catalog/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map }),
  });
}

export function saveChanges(map: Record<string, string>, confirmToken: string) {
  return request<{ ok: boolean; backupPath: string; storyCount: number; changeCount: number }>(
    '/api/catalog/save',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map, confirmToken }),
    },
  );
}

export function openStoryFolder(title: string) {
  return request<{ ok: boolean; path: string }>(
    `/api/archive/${encodeURIComponent(title)}/open`,
    { method: 'POST' },
  );
}

export function computeLocalDiff(
  original: Record<string, string>,
  current: Record<string, string>,
) {
  const changes: { title: string; from: string; to: string }[] = [];
  for (const title of Object.keys(original)) {
    if (original[title] !== current[title]) {
      changes.push({ title, from: original[title], to: current[title] });
    }
  }
  return changes.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}
