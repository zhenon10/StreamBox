import { type ReactNode } from 'react';

interface ChannelLogoProps {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-xl',
} as const;

export function ChannelLogo({ name, logoUrl, size = 'md' }: ChannelLogoProps): ReactNode {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        loading="lazy"
        className={`${sizeClasses[size]} shrink-0 rounded-xl bg-surface-700 object-contain`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500/30 to-surface-700 font-bold text-accent-300`}
    >
      {initials || '?'}
    </div>
  );
}
