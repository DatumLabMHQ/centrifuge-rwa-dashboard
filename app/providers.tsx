'use client';

import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 5 min stale time so navigating between pages reuses cached data
            // without ever flickering to a loading skeleton.
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 2,
            retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
            // When a query key changes (e.g. time slicer on Flow page),
            // keep the previous data visible while the new fetch is in
            // flight. This kills the "loading skeleton" flicker.
            placeholderData: keepPreviousData,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
