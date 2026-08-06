import { type ReactNode } from 'react';

interface CardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: ReactNode;
  readonly badge?: string;
  readonly focused?: boolean;
  readonly className?: string;
}

export function Card({
  title,
  subtitle,
  icon,
  badge,
  focused = false,
  className = '',
}: CardProps): ReactNode {
  return (
    <div
      className={`flex h-full w-full flex-col justify-between rounded-2xl bg-surface-800 p-6 transition-colors ${
        focused ? 'bg-surface-700 ring-2 ring-accent-500' : 'hover:bg-surface-700/80'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        {icon && <div className="text-4xl text-accent-400">{icon}</div>}
        {badge && (
          <span className="rounded-full bg-accent-500/20 px-3 py-1 text-sm font-medium text-accent-300">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-4">
        <h3 className="text-2xl font-semibold tracking-tight text-white">{title}</h3>
        {subtitle && <p className="mt-2 text-lg text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}
