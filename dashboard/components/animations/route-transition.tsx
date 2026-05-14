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
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={location.pathname}
        className="route-transition"
        initial={{ opacity: 0, y: 14, scale: 0.992, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -10, scale: 0.996, filter: 'blur(6px)' }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}
