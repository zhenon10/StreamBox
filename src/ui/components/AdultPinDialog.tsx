import { useState, type ReactNode } from 'react';
import { Focusable } from '@/ui/components/Focusable';
import { useT } from '@/i18n/useT';

interface AdultPinDialogProps {
  /** 'set' when no PIN exists yet, 'enter' to unlock with an existing PIN. */
  readonly mode: 'set' | 'enter';
  readonly onCancel: () => void;
  /** Return an i18n message key on failure, or null on success. */
  readonly onSubmit: (pin: string) => 'wrong' | null;
}

/** PIN gate for +18 / adult categories — creation on first use, entry after. */
export function AdultPinDialog({ mode, onCancel, onSubmit }: AdultPinDialogProps): ReactNode {
  const t = useT();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const digitsOnly = (value: string): string => value.replace(/\D/g, '').slice(0, 8);

  const handleSubmit = (): void => {
    if (pin.length < 4) {
      setError(t('adultPin.tooShort'));
      return;
    }
    if (mode === 'set' && pin !== confirm) {
      setError(t('adultPin.mismatch'));
      return;
    }
    const result = onSubmit(pin);
    if (result === 'wrong') {
      setError(t('adultPin.wrong'));
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="adult-pin-panel w-[520px] max-w-[92vw] rounded-2xl bg-surface-800 p-8">
        <h3 className="mb-2 text-3xl font-semibold text-white">
          {mode === 'set' ? t('adultPin.titleSet') : t('adultPin.titleEnter')}
        </h3>
        <p className="mb-6 text-lg text-slate-400">
          {mode === 'set' ? t('adultPin.subtitleSet') : t('adultPin.subtitleEnter')}
        </p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => {
            setPin(digitsOnly(e.target.value));
            setError(null);
          }}
          placeholder={t('adultPin.placeholder')}
          className="mb-4 w-full rounded-xl border-2 border-surface-600 bg-surface-900 px-6 py-4 text-center text-3xl tracking-[0.5em] text-white focus:border-accent-500 focus:outline-none"
          autoFocus
        />
        {mode === 'set' && (
          <input
            type="password"
            inputMode="numeric"
            value={confirm}
            onChange={(e) => {
              setConfirm(digitsOnly(e.target.value));
              setError(null);
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
