import React from 'react';

export const PageHeader: React.FC<{ title: string; children?: React.ReactNode }> = ({
  title,
  children,
}) => (
  <header className="mb-8">
    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.012em]">{title}</h1>
    {children && <p className="mt-2 max-w-[64ch] text-[16px] text-muted">{children}</p>}
  </header>
);

type NoticeTone = 'info' | 'warn' | 'error';

const NOTICE_TONE: Record<NoticeTone, string> = {
  info: 'bg-sunken text-ink',
  warn: 'bg-warn-bg text-warn',
  error: 'bg-bad-bg text-bad',
};

export const Notice: React.FC<{
  tone?: NoticeTone;
  title?: string;
  children: React.ReactNode;
  testId?: string;
  role?: 'alert' | 'status';
}> = ({ tone = 'info', title, children, testId, role }) => (
  <div
    role={role ?? (tone === 'error' ? 'alert' : undefined)}
    data-testid={testId}
    className={`rounded px-4 py-3 text-[14px] leading-snug ${NOTICE_TONE[tone]}`}
  >
    {title && <span className="font-semibold">{title} </span>}
    <span>{children}</span>
  </div>
);
