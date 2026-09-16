'use client';

import { useEffect } from 'react';

/** Adds a class to <body> for the life of a route.
 *
 *  The chat is an app, not a page: it owns the viewport and has no site chrome. The
 *  root layout renders one <body> for every route, so the class is applied here and
 *  removed on unmount rather than baked into the layout. */
export default function BodyClass({ name }: { name: string }) {
  useEffect(() => {
    document.body.classList.add(name);
    return () => document.body.classList.remove(name);
  }, [name]);
  return null;
}
