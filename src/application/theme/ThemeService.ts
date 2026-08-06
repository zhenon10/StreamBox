export const ThemeId = {
  Dark: 'dark',
  OledBlack: 'oled-black',
  Classic: 'classic',
  Blue: 'blue',
  Purple: 'purple',
} as const;

export type ThemeId = (typeof ThemeId)[keyof typeof ThemeId];

export interface ThemeTokens {
  readonly surface950: string;
  readonly surface900: string;
  readonly surface800: string;
  readonly surface700: string;
  readonly surface600: string;
  readonly accent500: string;
  readonly accent400: string;
  readonly accent300: string;
  readonly success500: string;
  readonly error500: string;
  readonly warning500: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly focusRing: string;
  readonly focusGlow: string;
}

export interface ThemeDefinition {
  readonly id: ThemeId;
  readonly name: string;
  readonly tokens: ThemeTokens;
}

const THEMES: Record<ThemeId, ThemeDefinition> = {
  [ThemeId.Dark]: {
    id: ThemeId.Dark,
    name: 'Dark',
    tokens: {
      surface950: '#0a0a0f',
      surface900: '#12121a',
      surface800: '#1a1a26',
      surface700: '#252533',
      surface600: '#32324a',
      accent500: '#6366f1',
      accent400: '#818cf8',
      accent300: '#a5b4fc',
      success500: '#22c55e',
      error500: '#ef4444',
      warning500: '#f59e0b',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      focusRing: '#6366f1',
      focusGlow: 'rgba(99, 102, 241, 0.45)',
    },
  },
  [ThemeId.OledBlack]: {
    id: ThemeId.OledBlack,
    name: 'OLED Black',
    tokens: {
      surface950: '#000000',
      surface900: '#0a0a0a',
      surface800: '#141414',
      surface700: '#1f1f1f',
      surface600: '#2a2a2a',
      accent500: '#ffffff',
      accent400: '#e2e8f0',
      accent300: '#cbd5e1',
      success500: '#22c55e',
      error500: '#ef4444',
      warning500: '#f59e0b',
      textPrimary: '#ffffff',
      textSecondary: '#a1a1aa',
      focusRing: '#ffffff',
      focusGlow: 'rgba(255, 255, 255, 0.35)',
    },
  },
  [ThemeId.Classic]: {
    id: ThemeId.Classic,
    name: 'Classic',
    tokens: {
      surface950: '#1a1a2e',
      surface900: '#16213e',
      surface800: '#1f2b47',
      surface700: '#2a3a5c',
      surface600: '#3d4f6f',
      accent500: '#e94560',
      accent400: '#ff6b6b',
      accent300: '#ff8a8a',
      success500: '#4ade80',
      error500: '#f87171',
      warning500: '#fbbf24',
      textPrimary: '#edf2f4',
      textSecondary: '#8d99ae',
      focusRing: '#e94560',
      focusGlow: 'rgba(233, 69, 96, 0.45)',
    },
  },
  [ThemeId.Blue]: {
    id: ThemeId.Blue,
    name: 'Blue',
    tokens: {
      surface950: '#0c1929',
      surface900: '#0f2744',
      surface800: '#15325a',
      surface700: '#1e4070',
      surface600: '#2a5088',
      accent500: '#3b82f6',
      accent400: '#60a5fa',
      accent300: '#93c5fd',
      success500: '#22c55e',
      error500: '#ef4444',
      warning500: '#f59e0b',
      textPrimary: '#f0f9ff',
      textSecondary: '#7dd3fc',
      focusRing: '#3b82f6',
      focusGlow: 'rgba(59, 130, 246, 0.45)',
    },
  },
  [ThemeId.Purple]: {
    id: ThemeId.Purple,
    name: 'Purple',
    tokens: {
      surface950: '#130820',
      surface900: '#1a0a2e',
      surface800: '#2d1b4e',
      surface700: '#3d2566',
      surface600: '#4c2d7a',
      accent500: '#a855f7',
      accent400: '#c084fc',
      accent300: '#d8b4fe',
      success500: '#22c55e',
      error500: '#ef4444',
      warning500: '#f59e0b',
      textPrimary: '#faf5ff',
      textSecondary: '#c4b5fd',
      focusRing: '#a855f7',
      focusGlow: 'rgba(168, 85, 247, 0.45)',
    },
  },
};

type ThemeChangeListener = (theme: ThemeDefinition) => void;

/** Runtime theme engine — components must use CSS variables, never hardcoded colors. */
export class ThemeService {
  private currentTheme: ThemeDefinition = THEMES[ThemeId.Dark];
  private readonly listeners = new Set<ThemeChangeListener>();
  private readonly customThemes = new Map<ThemeId, ThemeDefinition>();

  getCurrentTheme(): ThemeDefinition {
    return this.currentTheme;
  }

  getAvailableThemes(): readonly ThemeDefinition[] {
    return [...Object.values(THEMES), ...this.customThemes.values()];
  }

  setTheme(themeId: ThemeId): void {
    const theme = this.customThemes.get(themeId) ?? THEMES[themeId];
    if (!theme) return;

    this.currentTheme = theme;
    this.applyTokens(theme.tokens);
    for (const listener of this.listeners) {
      listener(theme);
    }
  }

  registerTheme(theme: ThemeDefinition): void {
    this.customThemes.set(theme.id, theme);
  }

  onThemeChange(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(themeId: ThemeId = ThemeId.Dark): void {
    this.setTheme(themeId);
  }

  private applyTokens(tokens: ThemeTokens): void {
    const root = document.documentElement;
    root.style.setProperty('--theme-surface-950', tokens.surface950);
    root.style.setProperty('--theme-surface-900', tokens.surface900);
    root.style.setProperty('--theme-surface-800', tokens.surface800);
    root.style.setProperty('--theme-surface-700', tokens.surface700);
    root.style.setProperty('--theme-surface-600', tokens.surface600);
    root.style.setProperty('--theme-accent-500', tokens.accent500);
    root.style.setProperty('--theme-accent-400', tokens.accent400);
    root.style.setProperty('--theme-accent-300', tokens.accent300);
    root.style.setProperty('--theme-success-500', tokens.success500);
    root.style.setProperty('--theme-error-500', tokens.error500);
    root.style.setProperty('--theme-warning-500', tokens.warning500);
    root.style.setProperty('--theme-text-primary', tokens.textPrimary);
    root.style.setProperty('--theme-text-secondary', tokens.textSecondary);
    root.style.setProperty('--theme-focus-ring', tokens.focusRing);
    root.style.setProperty('--theme-focus-glow', tokens.focusGlow);

    root.style.setProperty('--color-surface-950', tokens.surface950);
    root.style.setProperty('--color-surface-900', tokens.surface900);
    root.style.setProperty('--color-surface-800', tokens.surface800);
    root.style.setProperty('--color-surface-700', tokens.surface700);
    root.style.setProperty('--color-surface-600', tokens.surface600);
    root.style.setProperty('--color-accent-500', tokens.accent500);
    root.style.setProperty('--color-accent-400', tokens.accent400);
    root.style.setProperty('--color-accent-300', tokens.accent300);
    root.style.setProperty('--color-success-500', tokens.success500);
    root.style.setProperty('--color-error-500', tokens.error500);
    root.style.setProperty('--color-warning-500', tokens.warning500);
  }
}

export { THEMES };
