import { createFileRoute } from '@tanstack/react-router';
import { motion } from 'motion/react';

import { RouteTransition } from '../../components/animations/route-transition';

function DashboardLayout() {

  return (
    <RouteTransition>
      <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <p className="muted">Select section to open dashboard views.</p>
      </motion.main>
    </RouteTransition>
  );
}

export const Route = createFileRoute('/dashboard/')({
  component: DashboardLayout,
});
