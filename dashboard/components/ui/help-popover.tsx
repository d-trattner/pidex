import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type HelpPopoverProps = {
  title: string;
  shows: string;
  source: string;
  reading: string;
  improve: string;
  caveats?: string;
};

type Position = { top: number; left: number; placement: 'top' | 'bottom' };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function HelpPopover({ title, shows, source, reading, improve, caveats }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, placement: 'bottom' });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const panelWidth = Math.min(380, window.innerWidth - 20);
      const mobile = window.innerWidth <= 640;
      if (mobile) {
        setPosition({ top: window.innerHeight - 12, left: 10, placement: 'top' });
        return;
      }
      const spaceBelow = window.innerHeight - rect.bottom;
      const placement: Position['placement'] = spaceBelow > 280 ? 'bottom' : 'top';
      const top = placement === 'bottom' ? rect.bottom + 10 : Math.max(10, rect.top - 10);
      const left = clamp(rect.right - panelWidth, 10, window.innerWidth - panelWidth - 10);
      setPosition({ top, left, placement });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const panel = open && mounted ? createPortal(
    <>
      <div className="metric-help-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
      <div
        ref={panelRef}
        id={panelId}
        className={`metric-help-popover metric-help-popover--${position.placement}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${panelId}-title`}
        style={{ top: position.top, left: position.left }}
      >
        <div className="metric-help-popover__head">
          <h4 id={`${panelId}-title`}>{title}</h4>
          <button type="button" className="metric-help-popover__close" aria-label={`Close ${title} help`} onClick={() => setOpen(false)}>×</button>
        </div>
        <dl>
          <dt>What this shows</dt>
          <dd>{shows}</dd>
          <dt>Data source</dt>
          <dd>{source}</dd>
          <dt>How to read it</dt>
          <dd>{reading}</dd>
          <dt>Improve it</dt>
          <dd>{improve}</dd>
          {caveats ? (
            <>
              <dt>Caveats</dt>
              <dd>{caveats}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="metric-help-trigger"
        aria-label={`Explain ${title}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {panel}
    </>
  );
}
