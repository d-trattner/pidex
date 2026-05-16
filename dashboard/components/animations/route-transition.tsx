import type { ReactNode } from 'react';

import { useLocation } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export function RouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.main
        key={location.pathname}
        className="route-transition"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}
