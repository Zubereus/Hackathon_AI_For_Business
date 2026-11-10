import React from 'react';
import { FX_CONFIG, STRINGS } from '../i18n';
import { DataLabel } from '../types';

interface DataSourceBadgeProps {
  label: DataLabel;
  className?: string;
}

const STYLE_MAP: Record<DataLabel, string> = {
  SYNTHETIC: 'bg-amber-50 text-amber-900 border-amber-400',
  PUBLIC_M5: 'bg-indigo-50 text-indigo-900 border-indigo-400',
  PUBLIC_DUNNHUMBY: 'bg-violet-50 text-violet-900 border-violet-400',
  USER: 'bg-emerald-50 text-emerald-900 border-emerald-500',
};

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({ label, className = '' }) => {
  const cfg = STRINGS.badges[label] ?? STRINGS.badges.SYNTHETIC;
  const styleClass = STYLE_MAP[label] ?? STYLE_MAP.SYNTHETIC;
  const isForeignPublic = label === 'PUBLIC_M5' || label === 'PUBLIC_DUNNHUMBY';

  return (
    <span
      data-testid={`data-source-badge-${label}`}
      title={cfg.tooltip}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold tracking-wide rounded-full border ${styleClass} ${className}`}
    >
      <span aria-hidden="true">{cfg.symbol}</span>
      <span>{cfg.text}</span>
      {isForeignPublic && (
        <span
          className="ml-1 font-normal text-[11px] opacity-80 border-l border-current pl-1.5"
          title={FX_CONFIG.disclaimer}
        >
          USD→VND ({FX_CONFIG.disclaimer})
        </span>
      )}
    </span>
  );
};

export default DataSourceBadge;
