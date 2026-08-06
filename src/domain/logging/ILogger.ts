export const LogLevel = {
  Trace: 0,
  Debug: 1,
  Info: 2,
  Warning: 3,
  Error: 4,
  Critical: 5,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LogLevelName: Record<LogLevel, string> = {
  [LogLevel.Trace]: 'TRACE',
  [LogLevel.Debug]: 'DEBUG',
  [LogLevel.Info]: 'INFO',
  [LogLevel.Warning]: 'WARN',
  [LogLevel.Error]: 'ERROR',
  [LogLevel.Critical]: 'CRITICAL',
};

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: number;
  readonly context?: string;
  readonly data?: Record<string, unknown>;
  readonly error?: Error;
}

export interface ILogger {
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  trace(message: string, context?: string, data?: Record<string, unknown>): void;
  debug(message: string, context?: string, data?: Record<string, unknown>): void;
  info(message: string, context?: string, data?: Record<string, unknown>): void;
  warn(message: string, context?: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: string, data?: Record<string, unknown>): void;
  critical(message: string, error?: Error, context?: string, data?: Record<string, unknown>): void;
  getEntries(limit?: number): readonly LogEntry[];
}

export type LogOutput = (entry: LogEntry) => void;

export interface ILoggerFactory {
  create(context: string): ILogger;
}
