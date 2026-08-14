export const Capacitor = {
  getPlatform: (): string => 'web',
  isNativePlatform: (): boolean => false,
};

export function registerPlugin<T>(_name: string, implementation?: T): T {
  return (implementation ?? ({} as T));
}
