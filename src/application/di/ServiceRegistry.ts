export enum ServiceLifetime {
  Singleton = 'singleton',
  Transient = 'transient',
  Scoped = 'scoped',
}

export type ServiceToken<T> = symbol & { readonly __serviceType?: T };

export function createToken<T>(description: string): ServiceToken<T> {
  return Symbol(description) as ServiceToken<T>;
}

interface ServiceRegistration<T> {
  readonly factory: (provider: ServiceProvider) => T;
  readonly lifetime: ServiceLifetime;
  instance?: T;
  scopedInstances?: Map<string, T>;
}

/** Central service registry with lifetime management. */
export class ServiceRegistry {
  private readonly registrations = new Map<ServiceToken<unknown>, ServiceRegistration<unknown>>();
  private scopeId: string | null = null;

  register<T>(
    token: ServiceToken<T>,
    factory: (provider: ServiceProvider) => T,
    lifetime: ServiceLifetime = ServiceLifetime.Singleton,
  ): this {
    this.registrations.set(token, { factory, lifetime });
    return this;
  }

  resolve<T>(token: ServiceToken<T>, provider: ServiceProvider): T {
    const registration = this.registrations.get(token);
    if (!registration) {
      throw new Error(`Service not registered: ${String(token.description)}`);
    }

    switch (registration.lifetime) {
      case ServiceLifetime.Singleton:
        if (registration.instance === undefined) {
          registration.instance = registration.factory(provider);
        }
        return registration.instance as T;

      case ServiceLifetime.Transient:
        return registration.factory(provider) as T;

      case ServiceLifetime.Scoped: {
        const scope = this.scopeId ?? 'default';
        if (!registration.scopedInstances) {
          registration.scopedInstances = new Map();
        }
        let instance = registration.scopedInstances.get(scope);
        if (instance === undefined) {
          instance = registration.factory(provider);
          registration.scopedInstances.set(scope, instance);
        }
        return instance as T;
      }
    }
  }

  beginScope(scopeId: string): void {
    this.scopeId = scopeId;
  }

  endScope(): void {
    this.scopeId = null;
  }

  has(token: ServiceToken<unknown>): boolean {
    return this.registrations.has(token);
  }
}

/** Resolves services from the registry — the only entry point for dependency retrieval. */
export class ServiceProvider {
  constructor(private readonly registry: ServiceRegistry) {}

  resolve<T>(token: ServiceToken<T>): T {
    return this.registry.resolve(token, this);
  }

  beginScope(scopeId: string): void {
    this.registry.beginScope(scopeId);
  }

  endScope(): void {
    this.registry.endScope();
  }
}
