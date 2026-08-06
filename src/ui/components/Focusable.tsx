import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface FocusableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly focusId: string;
  readonly focusGroup?: string;
  readonly focusPriority?: number;
  readonly children: ReactNode;
}

export const Focusable = forwardRef<HTMLButtonElement, FocusableProps>(
  (
    {
      focusId,
      focusGroup = 'default',
      focusPriority = 0,
      children,
      className = '',
      disabled,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        data-focusable="true"
        data-focus-id={focusId}
        data-focus-group={focusGroup}
        data-focus-priority={focusPriority}
        data-disabled={disabled ? 'true' : undefined}
        disabled={disabled}
        className={`relative cursor-pointer rounded-xl border-0 bg-transparent p-0 text-inherit ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

Focusable.displayName = 'Focusable';
