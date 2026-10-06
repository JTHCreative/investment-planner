import type { FolderColor } from '../lib/types';

/**
 * The Lunar colors a folder can be, mapped to the design system's tokens. Blue is left out on purpose: a folder turns
 * blue when it's the open one, so a blue folder would always look selected.
 */
export const FOLDER_COLORS: [FolderColor, string, string][] = [
  ['teal', 'Teal', 'var(--series-4)'],
  ['green', 'Green', 'var(--success)'],
  ['orange', 'Orange', 'var(--series-2)'],
  ['red', 'Red', 'var(--danger-text)'],
  ['pink', 'Pink', 'var(--series-3)'],
  ['purple', 'Purple', 'var(--series-6)'],
  ['grey', 'Grey', 'var(--cash)'],
];

export const folderColor = (c: FolderColor) => FOLDER_COLORS.find(([k]) => k === c)?.[2] ?? (c === 'blue' ? 'var(--series-1)' : 'var(--cash)');

/** A folder drawn closed or open. Both shapes are always drawn and cross-fade, so switching `open` animates the folder
 * opening (see .folder-glyph in styles.css). */
export function FolderGlyph({ open, size = 24 }: { open: boolean; size?: number }) {
  return (
    <span className={`folder-glyph${open ? ' open' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path
          className="folder-closed"
          d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        />
        <path
          className="folder-open"
          d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
        />
      </svg>
    </span>
  );
}
