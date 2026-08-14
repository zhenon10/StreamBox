import { type ReactNode } from 'react';

interface ChannelLogoProps {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly size?: 'xs' | 'sm' | 'md' | 'lg' | 'poster';
}

const sizeClasses = {
  xs: 'h-8 w-8 text-xs',
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-xl',
  poster: 'h-full w-full text-2xl',
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
        className={`${sizeClasses[size]} shrink-0 rounded-xl bg-surface-700 object-contain ${size === 'poster' ? 'rounded-none object-cover' : ''}`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} flex shrink-0 items-center justify-center bg-gradient-to-br from-accent-500/30 to-surface-700 font-bold text-accent-300 ${size === 'poster' ? 'rounded-none' : 'rounded-xl'}`}
    >
      {initials || '?'}
    </div>
  );
}
