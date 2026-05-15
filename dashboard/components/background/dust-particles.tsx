import { useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

type Particle = {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
};

const PARTICLE_COUNT = 72;

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: 0.7 + Math.random() * 1.9,
    speed: 0.006 + Math.random() * 0.018,
    drift: -0.012 + Math.random() * 0.024,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.12 + Math.random() * 0.34,
  }));
}

export function DustParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();
  const particles = useMemo(makeParticles, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return undefined;

    let frame = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    const render = (now: number) => {
      resize();
      const width = window.innerWidth;
      const height = window.innerHeight;
      const t = reduceMotion ? 0 : (now - start) / 1000;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (const particle of particles) {
        const y = (((particle.y * height) - t * particle.speed * height) % (height + 80) + height + 80) % (height + 80) - 40;
        const x = particle.x * width + Math.sin(t * 0.22 + particle.phase) * 24 + t * particle.drift * width;
        const wrappedX = ((x % (width + 80)) + width + 80) % (width + 80) - 40;
        const twinkle = 0.58 + 0.42 * Math.sin(t * 0.8 + particle.phase);
        const alpha = particle.alpha * twinkle;
        const glow = particle.size * 4.5;

        const gradient = ctx.createRadialGradient(wrappedX, y, 0, wrappedX, y, glow);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        gradient.addColorStop(0.35, `rgba(151, 236, 255, ${alpha * 0.38})`);
        gradient.addColorStop(1, 'rgba(151, 236, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(wrappedX, y, glow, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.72, alpha + 0.12)})`;
        ctx.beginPath();
        ctx.arc(wrappedX, y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      if (!reduceMotion) frame = requestAnimationFrame(render);
    };

    window.addEventListener('resize', resize, { passive: true });
    render(start);
    if (!reduceMotion) frame = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [particles, reduceMotion]);

  return <canvas ref={canvasRef} className="dust-particles" aria-hidden="true" />;
}
