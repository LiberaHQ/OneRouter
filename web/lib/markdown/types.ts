export interface TocEntry {
  level: number;
  id: string;
  text: string;
}

// Threaded through rendering instead of Python's module-level mutable EXTRA_TOC
// global, which was unsafe under Node's concurrent request handling.
export interface RenderContext {
  extraToc: TocEntry[];
}
