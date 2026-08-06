import { type ReactNode } from 'react';
import { Focusable } from './Focusable';

interface CrashScreenProps {
  readonly message: string;
  readonly onRecover: () => void;
  readonly onExit?: () => void;
}

/** User-friendly crash recovery screen. */
export function CrashScreen({ message, onRecover, onExit }: CrashScreenProps): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-surface-950 px-16">
      <div className="max-w-2xl text-center">
        <div className="mb-8 text-6xl">⚠</div>
        <h1 className="mb-4 text-4xl font-bold text-white">Something went wrong</h1>
        <p className="mb-8 text-xl text-slate-400">{message}</p>
        <div className="flex justify-center gap-6">
          <Focusable focusId="crash-recover" focusGroup="crash" focusPriority={10} onClick={onRecover}>
            <span className="rounded-xl bg-accent-500 px-12 py-4 text-xl font-semibold text-white [.focused_&]:bg-accent-400">
              Try Again
            </span>
          </Focusable>
          {onExit && (
            <Focusable focusId="crash-exit" focusGroup="crash" focusPriority={9} onClick={onExit}>
              <span className="rounded-xl bg-surface-800 px-12 py-4 text-xl text-white [.focused_&]:bg-surface-700">
                Exit App
              </span>
            </Focusable>
          )}
        </div>
      </div>
    </div>
  );
}
