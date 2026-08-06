import {
  LogLevel,
  LogLevelName,
  type ILogger,
  type LogEntry,
  type LogOutput,
} from '@/domain/logging/ILogger';

const MAX_ENTRIES = 1000;

/** Enterprise logger with level filtering and pluggable outputs. */
export class Logger implements ILogger {
  private level: LogLevel = LogLevel.Info;
  private readonly entries: LogEntry[] = [];
  private readonly outputs: LogOutput[] = [];

  constructor(
    private readonly context: string,
    outputs?: LogOutput[],
  ) {
    if (outputs) {
      this.outputs.push(...outputs);
    }
  }

  addOutput(output: LogOutput): void {
    this.outputs.push(output);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  trace(message: string, ctx?: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.Trace, message, ctx, data);
  }

  debug(message: string, ctx?: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.Debug, message, ctx, data);
  }

  info(message: string, ctx?: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.Info, message, ctx, data);
  }

  warn(message: string, ctx?: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.Warning, message, ctx, data);
  }

  error(
    message: string,
    error?: Error,
    ctx?: string,
    data?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.Error, message, ctx, data, error);
  }

  critical(
    message: string,
    error?: Error,
    ctx?: string,
    data?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.Critical, message, ctx, data, error);
  }

  getEntries(limit = MAX_ENTRIES): readonly LogEntry[] {
    return this.entries.slice(-limit);
  }

  private log(
    level: LogLevel,
    message: string,
    ctx?: string,
    data?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (level < this.level) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: ctx ?? this.context,
      ...(data !== undefined ? { data } : {}),
      ...(error !== undefined ? { error } : {}),
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }

    for (const output of this.outputs) {
      output(entry);
    }
  }
}

/** Console output sink — file and remote sinks can be added later. */
export function createConsoleLogOutput(): LogOutput {
  return (entry: LogEntry) => {
    const prefix = `[${LogLevelName[entry.level]}][${entry.context ?? 'App'}]`;
    const payload = entry.data ? ` ${JSON.stringify(entry.data)}` : '';

    switch (entry.level) {
      case LogLevel.Trace:
      case LogLevel.Debug:
        console.debug(`${prefix} ${entry.message}${payload}`);
        break;
      case LogLevel.Info:
        console.info(`${prefix} ${entry.message}${payload}`);
        break;
      case LogLevel.Warning:
        console.warn(`${prefix} ${entry.message}${payload}`);
        break;
      case LogLevel.Error:
      case LogLevel.Critical:
        console.error(`${prefix} ${entry.message}${payload}`, entry.error);
        break;
    }
  };
}

export class LoggerFactory {
  private readonly outputs: LogOutput[] = [createConsoleLogOutput()];
  private globalLevel: LogLevel = LogLevel.Info;

  setGlobalLevel(level: LogLevel): void {
    this.globalLevel = level;
  }

  addOutput(output: LogOutput): void {
    this.outputs.push(output);
  }

  create(context: string): Logger {
    const logger = new Logger(context, this.outputs);
    logger.setLevel(this.globalLevel);
    return logger;
  }
}
