import { motion } from 'motion/react';
import { ComponentPropsWithoutRef } from 'react';

type GlassPanelProps = Omit<ComponentPropsWithoutRef<'div'>, 'onDrag' | 'onDragStart' | 'onDragEnd'> & {
  variant?: 'panel' | 'card';
};

export function GlassPanel({ className = '', variant = 'panel', children, ...rest }: GlassPanelProps) {
  const classes = ['glass', variant === 'card' ? 'glass-card' : '', className].filter(Boolean).join(' ');

  return (
    <motion.div
      className={classes}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28 }}
      whileHover={{ y: -2 }}
      {...(rest as any)}
    >
      {children}
    </motion.div>
  );
}
