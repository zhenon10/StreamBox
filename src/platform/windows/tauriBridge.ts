type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown>;
};

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
}

export async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const internals = window.__TAURI_INTERNALS__ as TauriInternals | undefined;
  if (!internals?.invoke) {
    throw new Error('Tauri bridge unavailable');
  }
  return internals.invoke(cmd, args) as Promise<T>;
}
