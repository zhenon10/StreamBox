export type FocusDirection = 'up' | 'down' | 'left' | 'right';

export interface FocusRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
}

export interface FocusableEntry {
  readonly id: string;
  readonly element: HTMLElement;
  readonly group: string;
  readonly rect: FocusRect;
  readonly priority: number;
}

export interface FocusSnapshot {
  readonly focusId: string;
  readonly group: string;
  readonly scrollTop: number;
}

const FOCUSABLE_SELECTOR = '[data-focusable="true"]:not([data-disabled="true"])';

export function getFocusRect(element: HTMLElement): FocusRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  };
}

export function queryFocusables(container: HTMLElement | Document = document): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

function directionScore(
  current: FocusRect,
  candidate: FocusRect,
  direction: FocusDirection,
): number | null {
  const dx = candidate.centerX - current.centerX;
  const dy = candidate.centerY - current.centerY;

  switch (direction) {
    case 'up':
      if (candidate.bottom > current.top + 2) return null;
      return Math.abs(dx) * 2 + Math.abs(dy);
    case 'down':
      if (candidate.top < current.bottom - 2) return null;
      return Math.abs(dx) * 2 + Math.abs(dy);
    case 'left':
      if (candidate.right > current.left + 2) return null;
      return Math.abs(dy) * 2 + Math.abs(dx);
    case 'right':
      if (candidate.left < current.right - 2) return null;
      return Math.abs(dy) * 2 + Math.abs(dx);
  }
}

export function findNextFocusable(
  current: HTMLElement,
  direction: FocusDirection,
  container?: HTMLElement,
): HTMLElement | null {
  const currentRect = getFocusRect(current);
  const focusables = queryFocusables(container ?? document);

  let best: { element: HTMLElement; score: number; priority: number } | null = null;

  for (const element of focusables) {
    if (element === current) continue;

    const rect = getFocusRect(element);
    const score = directionScore(currentRect, rect, direction);
    if (score === null) continue;

    const priority = Number(element.dataset.focusPriority ?? '0');

    if (
      !best ||
      score < best.score ||
      (score === best.score && priority > best.priority)
    ) {
      best = { element, score, priority };
    }
  }

  return best?.element ?? null;
}

export function applyFocus(element: HTMLElement): void {
  document.querySelectorAll('.focused').forEach((el) => {
    el.classList.remove('focused');
  });
  element.classList.add('focused');
  element.focus({ preventScroll: false });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

export function createFocusSnapshot(element: HTMLElement): FocusSnapshot {
  const scrollParent = findScrollParent(element);
  return {
    focusId: element.dataset.focusId ?? element.id,
    group: element.dataset.focusGroup ?? 'default',
    scrollTop: scrollParent?.scrollTop ?? 0,
  };
}

export function restoreFocusSnapshot(snapshot: FocusSnapshot): boolean {
  const selector = `[data-focus-id="${snapshot.focusId}"]`;
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return false;

  const scrollParent = findScrollParent(element);
  if (scrollParent) {
    scrollParent.scrollTop = snapshot.scrollTop;
  }

  applyFocus(element);
  return true;
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

export function directionFromKey(key: string): FocusDirection | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

export function getDefaultFocusable(container?: HTMLElement): HTMLElement | null {
  const focusables = queryFocusables(container ?? document);
  if (focusables.length === 0) return null;

  const prioritized = focusables
    .map((el) => ({ el, priority: Number(el.dataset.focusPriority ?? '0') }))
    .sort((a, b) => b.priority - a.priority);

  return prioritized[0]?.el ?? focusables[0] ?? null;
}
