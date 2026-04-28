import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

interface LiveModelDirectWarningIconProps {
  label: string;
  title: string;
}

const TOOLTIP_DELAY_MS = 120;

export const LiveModelDirectWarningIcon: React.FC<LiveModelDirectWarningIconProps> = ({ label, title }) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  const clearShowTimer = () => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const showTooltip = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const ownerWindow = trigger.ownerDocument.defaultView ?? window;
    const top = rect.top > 44 ? rect.top - 8 : rect.bottom + 8;

    setTooltipPosition({
      top,
      left: Math.min(Math.max(rect.left + rect.width / 2, 20), ownerWindow.innerWidth - 20),
    });
  };

  const scheduleTooltip = () => {
    clearShowTimer();
    showTimerRef.current = window.setTimeout(showTooltip, TOOLTIP_DELAY_MS);
  };

  const hideTooltip = () => {
    clearShowTimer();
    setTooltipPosition(null);
  };

  useEffect(
    () => () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
      }
    },
    [],
  );

  const targetDocument = triggerRef.current?.ownerDocument ?? document;

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-red-500 select-none"
        aria-label={label}
        role="img"
        tabIndex={0}
        onMouseEnter={scheduleTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        <AlertTriangle size={13} strokeWidth={2.25} aria-hidden="true" />
      </span>

      {tooltipPosition &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[2200] max-w-[min(260px,calc(100vw-24px))] rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-2.5 py-1.5 text-xs leading-snug text-amber-600 dark:text-amber-300"
            style={{
              left: tooltipPosition.left,
              top: tooltipPosition.top,
              transform: tooltipPosition.top > 44 ? 'translate(-50%, -100%)' : 'translateX(-50%)',
            }}
          >
            {title}
          </span>,
          targetDocument.body,
        )}
    </>
  );
};
