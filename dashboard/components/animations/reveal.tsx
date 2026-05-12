import { AnimatePresence, motion } from 'motion/react';
import { ReactNode } from 'react';

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
        transition={{ duration: 0.25, delay }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
