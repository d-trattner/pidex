import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';

import { RouteTransition } from '../components/animations/route-transition';
import { GlobalHeader, MobileMenuSheet } from '../components/navigation/global-nav';

import '@/styles/theme.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
    },
  },
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'PIDEX Dashboard' },
    ],
  }),
  component: () => (
    <html lang="en" className="h-full">
      <head>
        <HeadContent />
      </head>
      <body className="h-full">
        <QueryClientProvider client={queryClient}>
          <div className="page-shell">
            <GlobalHeader />
            <RouteTransition>
              <Outlet />
            </RouteTransition>
          </div>
          <MobileMenuSheet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  ),
});
