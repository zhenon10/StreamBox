import { invokeTauri, isTauriRuntime } from './tauriBridge';

export async function readWindowsDeviceId(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const id = (await invokeTauri<string>('get_or_create_device_id')).trim();
    return id || null;
  } catch {
    return null;
  }
}

export async function writeWindowsDeviceId(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invokeTauri('set_device_id', { id });
  } catch {
    // localStorage still holds the id
  }
}
