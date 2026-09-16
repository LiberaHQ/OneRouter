// ~94 of 420 catalog ids contain a literal ":" (e.g. "cohere/north-mini-code:free").
// A raw colon in a Next.js dynamic route segment is unreliable here — repeat requests
// to the same URL started 404ing after the first successful render, consistent with
// Next's dev/build route cache mis-keying on a character that's also special to some
// filesystems and URL parsers. Routes and links use "~" (never present in real ids,
// confirmed against the full catalog) as a stand-in for ":" instead.
export function modelUrlPath(id: string): string {
  return `/models/${id.replace(/:/g, "~")}`;
}

export function modelIdFromSegments(author: string, name: string): string {
  return `${author}/${name.replace(/~/g, ":")}`;
}

export function modelNameSegment(id: string): string {
  const slash = id.indexOf("/");
  return id.slice(slash + 1).replace(/:/g, "~");
}
