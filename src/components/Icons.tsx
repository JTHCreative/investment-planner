import type { ReactNode } from 'react';

/** Stroke icons from the Lunar design (Lucide-style, 24×24 grid, drawn in the current text color). */
function Icon({ size = 16, strokeWidth = 2, children }: { size?: number; strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const LogoIcon = (p: P) => <Icon {...p}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></Icon>;
export const SignOutIcon = (p: P) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>;
export const InfoIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Icon>;
export const PlusIcon = (p: P) => <Icon {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>;
export const BarsIcon = (p: P) => <Icon {...p}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></Icon>;
export const TrendUpIcon = (p: P) => <Icon {...p}><path d="M22 7 13.5 15.5 8.5 10.5 2 17" /><path d="M16 7h6v6" /></Icon>;
export const TrendDownIcon = (p: P) => <Icon {...p}><path d="M22 17 13.5 8.5 8.5 13.5 2 7" /><path d="M16 17h6v-6" /></Icon>;
export const BackIcon = (p: P) => <Icon {...p}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></Icon>;
export const RefreshIcon = (p: P) => <Icon {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></Icon>;
export const CloseIcon = (p: P) => <Icon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>;
export const SearchIcon = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>;
export const CheckIcon = (p: P) => <Icon strokeWidth={2.5} {...p}><path d="M20 6 9 17l-5-5" /></Icon>;
export const ShieldIcon = (p: P) => <Icon {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></Icon>;
export const ChevronIcon = (p: P) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>;
export const CopyIcon = (p: P) => <Icon {...p}><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Icon>;
export const TrashIcon = (p: P) => <Icon {...p}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></Icon>;
export const ArrowDownIcon = (p: P) => <Icon {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Icon>;
export const ArrowUpIcon = (p: P) => <Icon {...p}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></Icon>;
export const WalletIcon = (p: P) => <Icon {...p}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></Icon>;
export const BriefcaseIcon = (p: P) => <Icon {...p}><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect width="20" height="14" x="2" y="6" rx="2" /></Icon>;
export const SettingsIcon = (p: P) => <Icon {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></Icon>;

/** Green/red pill with an arrow, e.g. "+$14,856.99 (+14.86%)". */
export function GainBadge({ value, children }: { value: number; children: ReactNode }) {
  const up = value >= 0;
  return (
    <span className={`badge ${up ? 'badge-gain' : 'badge-loss'}`}>
      {up ? <TrendUpIcon size={14} /> : <TrendDownIcon size={14} />}
      {children}
    </span>
  );
}
