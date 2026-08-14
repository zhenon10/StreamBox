export const Preferences = {
  async get(_options: { key: string }): Promise<{ value: string | null }> {
    return { value: null };
  },
  async set(_options: { key: string; value: string }): Promise<void> {
    return undefined;
  },
  async remove(_options: { key: string }): Promise<void> {
    return undefined;
  },
  async keys(): Promise<{ keys: string[] }> {
    return { keys: [] };
  },
};
