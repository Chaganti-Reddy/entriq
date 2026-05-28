// apps/web/app/providers.tsx
// TanStack Query + Zustand providers wrapper.
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30 seconds
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: 'bg-zinc-900 border border-zinc-800 text-zinc-100',
            title: 'text-zinc-100 font-medium',
            description: 'text-zinc-400',
            actionButton: 'bg-violet-600 text-white',
            cancelButton: 'bg-zinc-800 text-zinc-400',
          },
        }}
      />
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
