import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Focusable } from '@/ui/components/Focusable';
import { useT } from '@/i18n/useT';

const PIN_LENGTH = 4;

interface AdultPinDialogProps {
  /** 'set' when no PIN exists yet, 'enter' to unlock with an existing PIN. */
  readonly mode: 'set' | 'enter';
  readonly onCancel: () => void;
  /** Return an i18n message key on failure, or null on success. */
  readonly onSubmit: (pin: string) => 'wrong' | null;
  /** Overrides the default subtitle — e.g. "enter mode" reused to verify the current PIN before a change. */
  readonly subtitle?: string;
}

/**
 * PIN gate for +18 / adult categories — creation on first use, entry after.
 *
 * Fixed 4-digit length so both fields can auto-advance/auto-submit as soon
 * as they're full: a D-pad/remote user has no way to move focus between two
 * plain <input> fields (the focus engine only tracks Focusable elements),
 * so waiting for a manual "next" action would strand TV users.
 */
export function AdultPinDialog({
  mode,
  onCancel,
  onSubmit,
  subtitle,
}: AdultPinDialogProps): ReactNode {
  const t = useT();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const digitsOnly = (value: string): string => value.replace(/\D/g, '').slice(0, PIN_LENGTH);

  const trySubmit = (finalPin: string, finalConfirm: string): void => {
    if (finalPin.length < PIN_LENGTH) {
      setError(t('adultPin.tooShort'));
      return;
    }
    if (mode === 'set' && finalPin !== finalConfirm) {
      setError(t('adultPin.mismatch'));
      setPin('');
      setConfirm('');
      pinRef.current?.focus();
      return;
    }
    const result = onSubmit(finalPin);
    if (result === 'wrong') {
      setError(t('adultPin.wrong'));
      setPin('');
      pinRef.current?.focus();
    }
  };

  const handlePinChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const next = digitsOnly(e.target.value);
    setPin(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;
    if (mode === 'set') {
      confirmRef.current?.focus();
    } else {
      trySubmit(next, confirm);
    }
  };

  const handleConfirmChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const next = digitsOnly(e.target.value);
    setConfirm(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;
    trySubmit(pin, next);
  };

  const handleSubmit = (): void => {
    trySubmit(pin, confirm);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="adult-pin-panel w-[520px] max-w-[92vw] rounded-2xl bg-surface-800 p-8">
        <h3 className="mb-2 text-3xl font-semibold text-white">
          {mode === 'set' ? t('adultPin.titleSet') : t('adultPin.titleEnter')}
        </h3>
        <p className="mb-6 text-lg text-slate-400">
          {subtitle ?? (mode === 'set' ? t('adultPin.subtitleSet') : t('adultPin.subtitleEnter'))}
        </p>
        <input
          ref={pinRef}
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={handlePinChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder={t('adultPin.placeholder')}
          className="mb-4 w-full rounded-xl border-2 border-surface-600 bg-surface-900 px-6 py-4 text-center text-3xl tracking-[0.5em] text-white focus:border-accent-500 focus:outline-none"
          autoFocus
        />
        {mode === 'set' && (
          <input
            ref={confirmRef}
            type="password"
            inputMode="numeric"
            value={confirm}
            onChange={handleConfirmChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder={t('adultPin.confirmPlaceholder')}
            className="mb-4 w-full rounded-xl border-2 border-surface-600 bg-surface-900 px-6 py-4 text-center text-3xl tracking-[0.5em] text-white focus:border-accent-500 focus:outline-none"
          />
        )}
        {error && <p className="mb-4 text-lg text-error-500">{error}</p>}
        <div className="flex gap-4">
          <Focusable
            focusId="adult-pin-submit"
            focusGroup="adult-pin-dialog"
            focusPriority={2}
            className="flex-1"
            onClick={handleSubmit}
          >
            <div className="rounded-xl bg-accent-500 py-4 text-center text-xl font-semibold text-white [.focused_&]:bg-accent-400">
              {mode === 'set' ? t('adultPin.create') : t('adultPin.submit')}
            </div>
          </Focusable>
          <Focusable
            focusId="adult-pin-cancel"
            focusGroup="adult-pin-dialog"
            focusPriority={1}
            className="flex-1"
            onClick={onCancel}
          >
            <div className="rounded-xl bg-surface-700 py-4 text-center text-xl font-semibold text-white [.focused_&]:bg-surface-600">
              {t('adultPin.cancel')}
            </div>
          </Focusable>
        </div>
      </div>
    </div>
  );
}
