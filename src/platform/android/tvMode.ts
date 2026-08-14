import { registerPlugin } from '@capacitor/core';

const IvPlayerTv = registerPlugin<{ isTelevision(): Promise<{ value: boolean }> }>('IvPlayerTv');

export async function queryIsTelevision(): Promise<boolean> {
  try {
    const result = await IvPlayerTv.isTelevision();
    return result.value === true;
  } catch {
    return false;
  }
}
