import { motion } from 'motion/react';
import { ComponentPropsWithoutRef } from 'react';

type GlassButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'onDrag' | 'onDragStart' | 'onDragEnd'> & {
  tone?: 'default' | 'accent' | 'danger';
};

export function GlassButton({ tone = 'default', className = '', children, ...rest }: GlassButtonProps) {
  const toneClass = {
    default: 'btn-glass-default',
    accent: 'btn-glass-accent',
    danger: 'btn-glass-danger',
  }[tone];

  return (
    <motion.button
      className={`glass-btn ${toneClass} ${className}`}
      type={rest.type ?? 'button'}
      whileTap={{ scale: 0.98 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.18 }}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
}
