import { Preferences } from '@capacitor/preferences';

const NATIVE_DEVICE_ID_KEY = 'device.identity.id';

export async function readAndroidDeviceId(): Promise<string | null> {
  try {
    const result = await Preferences.get({ key: NATIVE_DEVICE_ID_KEY });
    const value = result.value?.trim() ?? '';
    return value || null;
  } catch {
    return null;
  }
}

export async function writeAndroidDeviceId(id: string): Promise<void> {
  try {
    await Preferences.set({ key: NATIVE_DEVICE_ID_KEY, value: id });
  } catch {
    // localStorage still holds the id
  }
}
