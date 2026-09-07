export interface Story {
  title: string;
  sub: string;
  parent: string;
  summary: string;
  path: string;
  thumbnailUrl: string;
  hasThumbnail: boolean;
}

export interface SubSeriesGroup {
  sub: string;
  stories: Story[];
  count: number;
}

export interface ParentGroup {
  parent: string;
  subSeries: SubSeriesGroup[];
}

export interface CatalogData {
  structure: Record<string, string[]>;
  tree: ParentGroup[];
  map: Record<string, string>;
  storyCount: number;
}

export interface CatalogDiff {
  title: string;
  from: string | null;
  to: string | null;
}

export interface PreviewResult {
  token: string;
  diff: CatalogDiff[];
  changeCount: number;
}
