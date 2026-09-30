import { useEffect, useRef, type ReactNode } from 'react';
import { Focusable } from '@/ui/components/Focusable';
import { applyFocus } from '@/ui/navigation/focusEngine';
import { useT } from '@/i18n/useT';

interface ExitConfirmDialogProps {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Back on the TV home screen: confirm before leaving the app (LG webOS UX rule). */
export function ExitConfirmDialog({ onConfirm, onCancel }: ExitConfirmDialogProps): ReactNode {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Default to the safe choice so an accidental second OK doesn't quit.
    if (cancelRef.current) applyFocus(cancelRef.current);
  }, []);

  return (
    <div data-modal-root className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-[640px] rounded-2xl bg-surface-800 p-8">
        <h3 className="mb-8 text-center text-3xl font-semibold text-white">{t('exit.title')}</h3>
        <div className="flex gap-4">
          <Focusable
            focusId="exit-confirm"
            focusGroup="exit-dialog"
            focusPriority={1}
            className="flex-1"
            onClick={onConfirm}
          >
            <div className="rounded-xl bg-accent-500 py-4 text-center text-xl font-semibold text-white [.focused_&]:bg-accent-400">
              {t('exit.confirm')}
            </div>
          </Focusable>
          <Focusable
            ref={cancelRef}
            focusId="exit-cancel"
            focusGroup="exit-dialog"
            focusPriority={2}
            className="flex-1"
            onClick={onCancel}
          >
            <div className="rounded-xl bg-surface-700 py-4 text-center text-xl font-semibold text-white [.focused_&]:bg-surface-600">
              {t('exit.cancel')}
            </div>
          </Focusable>
        </div>
      </div>
    </div>
  );
}
