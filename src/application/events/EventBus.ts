import type {
  ApplicationEvent,
  ApplicationEventPayloadMap,
  EventHandler,
  EventKind,
  IEventBus,
  IEventPublisher,
  IEventSubscriber,
  Unsubscribe,
} from '@/domain/events/ApplicationEvent';

const MAX_HISTORY = 500;

/** Thread-safe synchronous event bus with typed publish/subscribe. */
export class EventBus implements IEventBus, IEventPublisher, IEventSubscriber {
  private readonly handlers = new Map<EventKind, Set<(event: ApplicationEvent) => void>>();
  private readonly globalHandlers = new Set<(event: ApplicationEvent) => void>();
  private readonly history: ApplicationEvent[] = [];

  publish<K extends EventKind>(
    kind: K,
    payload: ApplicationEventPayloadMap[K],
  ): ApplicationEvent {
    const event = {
      kind,
      timestamp: Date.now(),
      payload,
    } as ApplicationEvent;

    this.recordHistory(event);

    const handlers = this.handlers.get(kind);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event as Extract<ApplicationEvent, { kind: K }>);
        } catch {
          // Handlers must not break the bus; crash manager handles separately.
        }
      }
    }

    for (const handler of this.globalHandlers) {
      try {
        handler(event);
      } catch {
        // Swallow handler errors to protect publisher.
      }
    }

    return event;
  }

  subscribe<K extends EventKind>(kind: K, handler: EventHandler<K>): Unsubscribe {
    let set = this.handlers.get(kind);
    if (!set) {
      set = new Set();
      this.handlers.set(kind, set);
    }
    set.add(handler as (event: ApplicationEvent) => void);

    return () => {
      set?.delete(handler as (event: ApplicationEvent) => void);
    };
  }

  subscribeAll(handler: (event: ApplicationEvent) => void): Unsubscribe {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  on<K extends EventKind>(kind: K, handler: EventHandler<K>): Unsubscribe {
    return this.subscribe(kind, handler);
  }

  onAll(handler: (event: ApplicationEvent) => void): Unsubscribe {
    return this.subscribeAll(handler);
  }

  getHistory(limit = MAX_HISTORY): readonly ApplicationEvent[] {
    return this.history.slice(-limit);
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  private recordHistory(event: ApplicationEvent): void {
    this.history.push(event);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }
}

export class EventPublisher implements IEventPublisher {
  constructor(private readonly bus: IEventBus) {}

  publish<K extends EventKind>(
    kind: K,
    payload: ApplicationEventPayloadMap[K],
  ): ApplicationEvent {
    return this.bus.publish(kind, payload);
  }
}

export class EventSubscriber implements IEventSubscriber {
  constructor(private readonly bus: IEventBus) {}

  on<K extends EventKind>(kind: K, handler: EventHandler<K>): Unsubscribe {
    return this.bus.subscribe(kind, handler);
  }

  onAll(handler: (event: ApplicationEvent) => void): Unsubscribe {
    return this.bus.subscribeAll(handler);
  }
}
