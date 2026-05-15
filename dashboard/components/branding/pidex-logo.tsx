import { useEffect, useState } from 'react';

const PI_PATH = 'M 15,20 C 12,10 25,10 35,12 L 85,12 C 92,12 92,20 85,20 L 28,20 M 42,20 C 40,40 35,70 20,88 C 18,92 12,90 15,85 C 28,68 32,40 35,20 M 65,20 C 65,45 66,70 76,86 C 78,89 82,90 84,87 C 86,84 85,81 83,78 C 75,68 73,50 73,20';
const MIN_COUNT = 9;
const MAX_COUNT = 18;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function wave(time: number, speed: number, phase = 0): number {
  return (Math.sin(time * speed + phase) + 1) / 2;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PidexLogo() {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setTime((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const reduced = prefersReducedMotion();
  const countFloat = reduced
    ? 12
    : MIN_COUNT + (MAX_COUNT - MIN_COUNT) * (0.58 * wave(time, 0.22) + 0.42 * wave(time, 0.13, 1.7));
  const radius = reduced ? 27 : 23 + 10 * wave(time, 0.18, 0.9);
  const orbitRotation = reduced ? 0 : time * 18 + 24 * Math.sin(time * 0.17);
  const twist = reduced ? 0 : 18 * Math.sin(time * 0.31 + 0.8);
  const pulse = reduced ? 0 : Math.sin(time * 1.15) * 0.035;

  return (
    <svg className="pidex-logo" viewBox="0 0 120 120" role="img" aria-label="PIDEX logo">
      <g opacity="0.92">
        {Array.from({ length: MAX_COUNT }).map((_, index) => {
          const visible = 1 - smoothstep(countFloat - 1, countFloat, index);
          if (visible <= 0.01) return null;

          const angle = (index / countFloat) * Math.PI * 2 - Math.PI / 2 + Math.sin(time * 0.19 + index * 0.41) * 0.035;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const ringRotation = orbitRotation + (index / countFloat) * 360 + twist;
          const scale = 0.30 + pulse + 0.035 * Math.sin(time * 0.47 + index * 0.9);
          const opacity = (0.34 + 0.48 * wave(time, 0.27, index * 0.37)) * visible;

          return (
            <path
              key={index}
              d={PI_PATH}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={opacity}
              transform={`translate(${60 + x} ${60 + y}) rotate(${ringRotation}) scale(${scale}) translate(-50 -50)`}
            />
          );
        })}
      </g>

      <path
        d={PI_PATH}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="drop-shadow(0 3px 3px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 7px rgba(0, 245, 255, 0.45)) drop-shadow(0 0 12px rgba(167, 139, 250, 0.28))"
        transform="translate(60 60) scale(0.58) translate(-50 -50)"
      />
    </svg>
  );
}
