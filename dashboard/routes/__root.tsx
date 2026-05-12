import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';

import { GlobalHeader, MobileMenuSheet } from '../components/navigation/global-nav';

import '@/styles/theme.css';

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
        <div className="page-shell">
          <GlobalHeader />
          <Outlet />
        </div>
        <MobileMenuSheet />
        <Scripts />
      </body>
    </html>
  ),
});
