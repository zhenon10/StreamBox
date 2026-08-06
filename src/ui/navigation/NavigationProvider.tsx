import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { FocusSnapshot } from './focusEngine';
import {
  applyFocus,
  createFocusSnapshot,
  directionFromKey,
  findNextFocusable,
  getDefaultFocusable,
  restoreFocusSnapshot,
} from './focusEngine';
import { resolveFocusElement, type GraphDirection } from './NavigationGraph';
import { services, TOKENS } from '@/application/di/container';
import type { RemoteKey } from '@/platform/interfaces';

interface FocusStackEntry {
  readonly routeKey: string;
  readonly snapshot: FocusSnapshot | null;
}

interface NavigationContextValue {
  readonly pushFocus: (routeKey: string) => void;
  readonly popFocus: () => FocusSnapshot | null;
  readonly restoreFocus: (snapshot: FocusSnapshot | null) => void;
  readonly setFocusContainer: (element: HTMLElement | null) => void;
  readonly focusDefault: () => void;
  readonly registerScreenGraph: typeof import('./NavigationGraph').NavigationGraphManager.prototype.registerScreen;
  readonly registerList: typeof import('./NavigationGraph').NavigationGraphManager.prototype.registerList;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps {
  readonly children: ReactNode;
  readonly onBack?: () => void;
  readonly onEnter?: (element: HTMLElement) => void;
}

export function NavigationProvider({
  children,
  onBack,
  onEnter,
}: NavigationProviderProps): ReactNode {
  const focusStackRef = useRef<FocusStackEntry[]>([]);
  const containerRef = useRef<HTMLElement | null>(null);
  const currentFocusedRef = useRef<HTMLElement | null>(null);
  const graphManager = services.resolve(TOKENS.navigationGraph);
  const devMode = services.resolve(TOKENS.developerMode);

  const setFocusContainer = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
  }, []);

  const focusById = useCallback((focusId: string): boolean => {
    const element = resolveFocusElement(focusId);
    if (!element) return false;
    applyFocus(element);
    currentFocusedRef.current = element;
    return true;
  }, []);

  const focusDefault = useCallback(() => {
    const graphDefault = graphManager.getDefaultFocusId();
    if (graphDefault && focusById(graphDefault)) return;

    const target = getDefaultFocusable(containerRef.current ?? undefined);
    if (target) {
      applyFocus(target);
      currentFocusedRef.current = target;
    }
  }, [focusById, graphManager]);

  const pushFocus = useCallback((routeKey: string) => {
    graphManager.setActiveScreen(routeKey);
    const snapshot = currentFocusedRef.current
      ? createFocusSnapshot(currentFocusedRef.current)
      : null;
    focusStackRef.current.push({ routeKey, snapshot });
  }, [graphManager]);

  const popFocus = useCallback((): FocusSnapshot | null => {
    const entry = focusStackRef.current.pop();
    return entry?.snapshot ?? null;
  }, []);

  const restoreFocus = useCallback(
    (snapshot: FocusSnapshot | null) => {
      if (snapshot && restoreFocusSnapshot(snapshot)) {
        const el = document.querySelector<HTMLElement>(`[data-focus-id="${snapshot.focusId}"]`);
        if (el) currentFocusedRef.current = el;
        return;
      }
      focusDefault();
    },
    [focusDefault],
  );

  const navigateByGraph = useCallback(
    (currentId: string, direction: GraphDirection): boolean => {
      const nextId = graphManager.resolveNext(currentId, direction);
      if (!nextId) return false;
      return focusById(nextId);
    },
    [focusById, graphManager],
  );

  const handleRemoteKey = useCallback(
    (key: RemoteKey) => {
      if (devMode.handleKey(key)) return;

      const platformCtx = services.resolve(TOKENS.platformContext);

      if (graphManager.isModalActive() && key === 'Back') {
        graphManager.popModal();
        focusDefault();
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const current =
        active?.dataset.focusable === 'true'
          ? active
          : currentFocusedRef.current ?? getDefaultFocusable(containerRef.current ?? undefined);

      if (!current && key !== 'Back') {
        focusDefault();
        return;
      }

      if (key === 'Back') {
        onBack?.();
        return;
      }

      if (key === 'Enter' && current) {
        onEnter?.(current);
        current.click();
        return;
      }

      const direction = directionFromKey(key);
      if (!direction || !current) return;

      const currentFocusId = current.dataset.focusId ?? current.id;

      if (currentFocusId && navigateByGraph(currentFocusId, direction)) {
        return;
      }

      const next = findNextFocusable(current, direction, containerRef.current ?? undefined);
      if (next) {
        applyFocus(next);
        currentFocusedRef.current = next;
      }

      void platformCtx;
    },
    [devMode, focusDefault, graphManager, navigateByGraph, onBack, onEnter],
  );

  useEffect(() => {
    const platformCtx = services.resolve(TOKENS.platformContext);
    const unsubscribe = platformCtx.remote.subscribe(({ key }: { key: RemoteKey }) => {
      handleRemoteKey(key);
    });
    return unsubscribe;
  }, [handleRemoteKey]);

  useEffect(() => {
    const timer = setTimeout(focusDefault, 100);
    return () => clearTimeout(timer);
  }, [focusDefault]);

  const value: NavigationContextValue = {
    pushFocus,
    popFocus,
    restoreFocus,
    setFocusContainer,
    focusDefault,
    registerScreenGraph: graphManager.registerScreen.bind(graphManager),
    registerList: graphManager.registerList.bind(graphManager),
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return ctx;
}

export function useFocusOnMount(focusId: string, enabled = true): void {
  const { focusDefault } = useNavigation();

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-focus-id="${focusId}"]`);
      if (el) {
        applyFocus(el);
      } else {
        focusDefault();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [focusId, enabled, focusDefault]);
}

export function useRouteFocus(routeKey: string): void {
  const { pushFocus, popFocus, restoreFocus } = useNavigation();

  useEffect(() => {
    pushFocus(routeKey);
    return () => {
      const snapshot = popFocus();
      if (snapshot) {
        requestAnimationFrame(() => restoreFocus(snapshot));
      }
    };
  }, [routeKey, pushFocus, popFocus, restoreFocus]);
}

export function useScreenGraph(
  screenId: string,
  graph: import('./NavigationGraph').NavigationScreenGraph,
): void {
  const { registerScreenGraph } = useNavigation();

  useEffect(() => {
    if (graph.screenId !== screenId) return;
    return registerScreenGraph(graph);
  }, [screenId, graph, registerScreenGraph]);
}

export function useListNavigation(
  listId: string,
  itemIds: readonly string[],
  orientation: 'vertical' | 'horizontal' = 'vertical',
): void {
  const { registerList } = useNavigation();

  useEffect(() => {
    return registerList({ listId, itemIds, orientation });
  }, [listId, itemIds, orientation, registerList]);
}
