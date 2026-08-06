export const TaskPriority = {
  Low: 0,
  Normal: 1,
  High: 2,
  Critical: 3,
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export interface ScheduledTask {
  readonly id: string;
  readonly name: string;
  readonly priority: TaskPriority;
  readonly execute: () => Promise<void>;
  readonly intervalMs?: number;
  readonly delayMs?: number;
}

export interface TaskHandle {
  readonly id: string;
  cancel(): void;
}

interface InternalTask extends ScheduledTask {
  cancelled: boolean;
  timerId: ReturnType<typeof setTimeout> | null;
  intervalId: ReturnType<typeof setInterval> | null;
}

/** Priority queue scheduler for background work with cancellation support. */
export class BackgroundTaskScheduler {
  private readonly tasks = new Map<string, InternalTask>();
  private readonly queue: InternalTask[] = [];
  private processing = false;
  private taskCounter = 0;

  schedule(task: Omit<ScheduledTask, 'id'>): TaskHandle {
    this.taskCounter++;
    const id = `task_${String(this.taskCounter)}`;

    const internal: InternalTask = {
      ...task,
      id,
      cancelled: false,
      timerId: null,
      intervalId: null,
    };

    this.tasks.set(id, internal);

    if (task.intervalMs) {
      internal.timerId = setTimeout(() => {
        void this.enqueue(internal);
        internal.intervalId = setInterval(() => {
          if (!internal.cancelled) void this.enqueue(internal);
        }, task.intervalMs);
      }, task.delayMs ?? 0);
    } else {
      internal.timerId = setTimeout(() => {
        void this.enqueue(internal);
      }, task.delayMs ?? 0);
    }

    return {
      id,
      cancel: () => this.cancel(id),
    };
  }

  scheduleImmediate(task: Omit<ScheduledTask, 'id' | 'delayMs' | 'intervalMs'>): TaskHandle {
    return this.schedule({ ...task, delayMs: 0 });
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.cancelled = true;
    if (task.timerId) clearTimeout(task.timerId);
    if (task.intervalId) clearInterval(task.intervalId);
    this.tasks.delete(taskId);
    return true;
  }

  cancelAll(): void {
    for (const id of this.tasks.keys()) {
      this.cancel(id);
    }
    this.queue.length = 0;
  }

  getActiveCount(): number {
    return this.tasks.size + this.queue.length;
  }

  private enqueue(task: InternalTask): void {
    if (task.cancelled) return;
    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority);
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task || task.cancelled) continue;

      try {
        await task.execute();
      } catch {
        // Task failures are logged by the task itself.
      }
    }

    this.processing = false;
  }
}
