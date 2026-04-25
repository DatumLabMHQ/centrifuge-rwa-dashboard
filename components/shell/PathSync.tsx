'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Origins of parent sites that are allowed to embed this dashboard via
 * iframe. We post our pathname to each one on every route change; the
 * parent uses it to mirror the path into its own URL bar so reload
 * preserves the user's location instead of bouncing back to the dashboard
 * root.
 *
 * No-op when not iframed — direct visits to the Vercel URL pay nothing.
 */
const ALLOWED_PARENT_ORIGINS = [
  'https://www.datumlab.xyz',
  'https://datumlab.xyz',
];

/**
 * `targetOrigin` MUST be a single origin (or '*'), not a list. We post
 * once per allowed origin; non-matching parents silently drop the message.
 * We never post to '*' — that would leak our path to anything embedding us.
 */
export default function PathSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.parent === window) return; // not iframed
    if (!pathname) return;

    // Include the query string so things like ?days=90 survive a reload.
    const qs = searchParams?.toString();
    const fullPath = qs ? `${pathname}?${qs}` : pathname;

    const message = {
      source: 'datumlabs-centrifuge' as const,
      type: 'path-change' as const,
      path: fullPath,
    };

    for (const origin of ALLOWED_PARENT_ORIGINS) {
      try {
        window.parent.postMessage(message, origin);
      } catch {
        // Cross-origin frame access can throw in edge cases — ignore.
      }
    }
  }, [pathname, searchParams]);

  return null;
}
