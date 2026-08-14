export const App = {
  addListener: async (
    _event: string,
    _cb: (...args: never[]) => void,
  ): Promise<{ remove: () => Promise<void> }> => ({
    remove: async () => undefined,
  }),
  exitApp: async (): Promise<void> => undefined,
};
