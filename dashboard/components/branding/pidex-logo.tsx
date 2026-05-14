import { useEffect, useState } from 'react';

const PI_PATH = 'M 15,20 C 12,10 25,10 35,12 L 85,12 C 92,12 92,20 85,20 L 28,20 M 42,20 C 40,40 35,70 20,88 C 18,92 12,90 15,85 C 28,68 32,40 35,20 M 65,20 C 65,45 66,70 76,86 C 78,89 82,90 84,87 C 86,84 85,81 83,78 C 75,68 73,50 73,20';
const COUNT = 16;
const HOLD_MS = 3000;
const TRANSITION_MS = 1800;
const CYCLE_MS = (HOLD_MS + TRANSITION_MS) * 2;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeInOut(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function progressAt(elapsed: number): number {
  const t = elapsed % CYCLE_MS;
  if (t < HOLD_MS) return 0;
  if (t < HOLD_MS + TRANSITION_MS) return easeInOut((t - HOLD_MS) / TRANSITION_MS);
  if (t < HOLD_MS + TRANSITION_MS + HOLD_MS) return 1;
  return easeInOut(1 - (t - HOLD_MS - TRANSITION_MS - HOLD_MS) / TRANSITION_MS);
}

export function PidexLogo() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setProgress(progressAt(now - start));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const radius = 30 * progress;
  const ownRotation = 0;

  return (
    <svg className="pidex-logo" viewBox="0 0 120 120" role="img" aria-label="PIDEX logo">
      {Array.from({ length: COUNT }).map((_, index) => {
        const angle = (index / COUNT) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const ringRotation = (index / COUNT) * 360;
        const appear = index === 0 ? 1 : clamp((progress - 0.08 - index * 0.012) / 0.42);
        const opacity = index === 0 ? 1 : easeInOut(appear) * 0.92;
        const scale = 0.34 * (index === 0 ? 3 - 2 * progress : 0.86 + 0.14 * easeInOut(appear));
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
            transform={`translate(${60 + x} ${60 + y}) rotate(${ownRotation + ringRotation * progress}) scale(${scale}) translate(-50 -50)`}
          />
        );
      })}
    </svg>
  );
}
