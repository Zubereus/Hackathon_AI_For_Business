import React from 'react';
import { FX_CONFIG, STRINGS } from '../i18n';
import { DataLabel } from '../types';

interface DataSourceBadgeProps {
  label: DataLabel;
  className?: string;
}

const STYLE_MAP: Record<DataLabel, { pill: string; dot: string }> = {
  SYNTHETIC: {
    pill: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30',
    dot: 'bg-amber-500',
  },
  PUBLIC_M5: {
    pill: 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-500',
  },
  PUBLIC_DUNNHUMBY: {
    pill: 'bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-500/30',
    dot: 'bg-purple-500',
  },
  USER: {
    pill: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
};

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({ label, className = '' }) => {
  const cfg = STRINGS.badges[label] ?? STRINGS.badges.SYNTHETIC;
  const style = STYLE_MAP[label] ?? STYLE_MAP.SYNTHETIC;
  const isForeignPublic = label === 'PUBLIC_M5' || label === 'PUBLIC_DUNNHUMBY';

  return (
    <span
      data-testid={`data-source-badge-${label}`}
      title={cfg.tooltip}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-md border tracking-tight ${style.pill} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      <span aria-hidden="true" className="opacity-60 text-[10px]">{cfg.symbol}</span>
      <span>{cfg.text}</span>
      {isForeignPublic && (
        <span
          className="ml-1 text-[11px] font-normal opacity-75 border-l border-current/30 pl-1.5 tracking-normal"
          title={FX_CONFIG.disclaimer}
        >
          USD→VND ({FX_CONFIG.disclaimer})
        </span>
      )}
    </span>
  );
};

export default DataSourceBadge;
