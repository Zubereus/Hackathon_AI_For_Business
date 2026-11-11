import React from 'react';
import { STRINGS } from '../i18n';
import { DataLabel } from '../types';

interface DataSourceBadgeProps {
  label: DataLabel;
  className?: string;
}

const TONE: Record<DataLabel, string> = {
  SYNTHETIC: 'border-warn/50 bg-warn-bg text-warn',
  PUBLIC_M5: 'border-accent/50 text-accent',
  PUBLIC_DUNNHUMBY: 'border-accent/50 text-accent',
  USER: 'border-good/50 bg-good-bg text-good',
};

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({ label, className = '' }) => {
  const cfg = STRINGS.badges[label] ?? STRINGS.badges.SYNTHETIC;
  const tone = TONE[label] ?? TONE.SYNTHETIC;
  const isForeignPublic = label === 'PUBLIC_M5' || label === 'PUBLIC_DUNNHUMBY';

  return (
    <span
      data-testid={`data-source-badge-${label}`}
      title={cfg.tooltip}
      className={`tag ${tone} ${className}`}
    >
      <span>{cfg.text}</span>
      {isForeignPublic && <span className="font-normal opacity-80">converted from USD</span>}
    </span>
  );
};

export default DataSourceBadge;
