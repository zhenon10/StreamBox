export type GraphDirection = 'up' | 'down' | 'left' | 'right';

export interface NavigationNode {
  readonly id: string;
  readonly group?: string;
  readonly neighbors?: Partial<Record<GraphDirection, string>>;
  readonly isDefault?: boolean;
  readonly priority?: number;
}

export interface NavigationScreenGraph {
  readonly screenId: string;
  readonly nodes: readonly NavigationNode[];
  readonly defaultFocusId: string;
  readonly modalTrap?: boolean;
}

export interface ListRegistration {
  readonly listId: string;
  readonly itemIds: readonly string[];
  readonly orientation: 'vertical' | 'horizontal';
  readonly wrap?: boolean;
}

/** Declarative navigation graph — supplements spatial focus with explicit edges. */
export class NavigationGraphManager {
  private readonly screens = new Map<string, NavigationScreenGraph>();
  private readonly dynamicNodes = new Map<string, NavigationNode>();
  private readonly listRegistrations = new Map<string, ListRegistration>();
  private activeScreenId: string | null = null;
  private readonly modalStack: string[] = [];

  registerScreen(graph: NavigationScreenGraph): () => void {
    this.screens.set(graph.screenId, graph);
    return () => {
      if (this.activeScreenId === graph.screenId) {
        this.activeScreenId = null;
      }
      this.screens.delete(graph.screenId);
    };
  }

  setActiveScreen(screenId: string): void {
    this.activeScreenId = screenId;
  }

  registerDynamicNode(node: NavigationNode): () => void {
    this.dynamicNodes.set(node.id, node);
    return () => this.dynamicNodes.delete(node.id);
  }

  registerList(registration: ListRegistration): () => void {
    this.listRegistrations.set(registration.listId, registration);
    this.wireListNeighbors(registration);
    return () => this.listRegistrations.delete(registration.listId);
  }

  updateListItems(listId: string, itemIds: readonly string[]): void {
    const existing = this.listRegistrations.get(listId);
    if (!existing) return;
    const updated: ListRegistration = { ...existing, itemIds };
    this.listRegistrations.set(listId, updated);
    this.wireListNeighbors(updated);
  }

  pushModal(screenId: string): void {
    this.modalStack.push(screenId);
    this.activeScreenId = screenId;
  }

  popModal(): string | null {
    const popped = this.modalStack.pop() ?? null;
    this.activeScreenId =
      this.modalStack.length > 0
        ? (this.modalStack[this.modalStack.length - 1] ?? null)
        : this.activeScreenId;
    return popped;
  }

  isModalActive(): boolean {
    return this.modalStack.length > 0;
  }

  getDefaultFocusId(): string | null {
    const graph = this.getActiveGraph();
    if (!graph) return null;
    return graph.defaultFocusId;
  }

  resolveNext(currentId: string, direction: GraphDirection): string | null {
    const node = this.getNode(currentId);
    if (!node) return null;

    const explicit = node.neighbors?.[direction];
    if (explicit && this.nodeExists(explicit)) {
      return explicit;
    }

    const listNeighbor = this.resolveListNeighbor(currentId, direction);
    if (listNeighbor) return listNeighbor;

    return null;
  }

  getNode(id: string): NavigationNode | null {
    return this.dynamicNodes.get(id) ?? this.findNodeInActiveScreen(id);
  }

  getActiveScreenId(): string | null {
    return this.activeScreenId;
  }

  private getActiveGraph(): NavigationScreenGraph | null {
    if (!this.activeScreenId) return null;
    return this.screens.get(this.activeScreenId) ?? null;
  }

  private findNodeInActiveScreen(id: string): NavigationNode | null {
    const graph = this.getActiveGraph();
    if (!graph) return null;
    return graph.nodes.find((n) => n.id === id) ?? null;
  }

  private nodeExists(id: string): boolean {
    return this.getNode(id) !== null || document.querySelector(`[data-focus-id="${id}"]`) !== null;
  }

  private wireListNeighbors(registration: ListRegistration): void {
    const { itemIds, orientation } = registration;
    const primary: GraphDirection = orientation === 'vertical' ? 'down' : 'right';
    const reverse: GraphDirection = orientation === 'vertical' ? 'up' : 'left';

    for (let i = 0; i < itemIds.length; i++) {
      const id = itemIds[i];
      if (!id) continue;

      const neighbors: Partial<Record<GraphDirection, string>> = {};
      const prev = itemIds[i - 1];
      const next = itemIds[i + 1];

      if (prev) neighbors[reverse] = prev;
      if (next) neighbors[primary] = next;

      this.dynamicNodes.set(id, {
        id,
        group: registration.listId,
        neighbors,
        priority: itemIds.length - i,
      });
    }
  }

  private resolveListNeighbor(currentId: string, direction: GraphDirection): string | null {
    for (const registration of this.listRegistrations.values()) {
      const index = registration.itemIds.indexOf(currentId);
      if (index === -1) continue;

      const primary: GraphDirection = registration.orientation === 'vertical' ? 'down' : 'right';
      const reverse: GraphDirection = registration.orientation === 'vertical' ? 'up' : 'left';

      if (direction === primary) {
        return registration.itemIds[index + 1] ?? (registration.wrap ? registration.itemIds[0] : null) ?? null;
      }
      if (direction === reverse) {
        return (
          registration.itemIds[index - 1] ??
          (registration.wrap ? registration.itemIds[registration.itemIds.length - 1] : null) ??
          null
        );
      }
    }
    return null;
  }
}

export function resolveFocusElement(focusId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-focus-id="${focusId}"]`);
}
