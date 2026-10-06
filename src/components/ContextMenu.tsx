import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon } from './Icons';

export type MenuEntry =
  | { label: string; icon?: ReactNode; onSelect: () => void; checked?: boolean; disabled?: boolean }
  | { heading: string }
  | 'separator';

/**
 * A small menu at a point on screen (where the right-click happened, or under a "more" button). Arrow keys move
 * between items, Enter picks one, and Escape, a click elsewhere, or scrolling closes it.
 */
export function ContextMenu({ x, y, entries, onClose, label }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the whole menu on screen: flip it left or up when it would run off an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, x + width > window.innerWidth - 8 ? x - width : x),
      top: Math.max(8, y + height > window.innerHeight - 8 ? y - height : y),
    });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const close = () => onClose();
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  function onKeyDown(e: React.KeyboardEvent) {
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }

  return createPortal(
    <div ref={ref} className="context-menu" role="menu" aria-label={label} style={pos} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
      {entries.map((entry, i) =>
        entry === 'separator' ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : 'heading' in entry ? (
          <div key={i} className="menu-heading">{entry.heading}</div>
        ) : (
          <button
            key={i}
            type="button"
            role={entry.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={entry.checked}
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            <span className="menu-icon">{entry.icon}</span>
            <span className="menu-label">{entry.label}</span>
            {entry.checked && <CheckIcon size={14} />}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
