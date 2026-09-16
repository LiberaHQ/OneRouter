// Must match site/build.py's slug() exactly — existing #anchor links, llms.txt output,
// and external bookmarks all depend on this precise algorithm.
export function slug(text: string): string {
  let s = text.replace(/<[^>]+>/g, "").toLowerCase();
  s = s.replace(/[^a-z0-9\s-]/g, "");
  s = s.replace(/[\s-]+/g, "-");
  return s.replace(/^-+|-+$/g, "");
}
