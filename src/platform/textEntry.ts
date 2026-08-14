/** True when the event target is a field the user is typing into. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el =
    target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.disabled || el.readOnly) return false;
    if (el instanceof HTMLInputElement) {
      const type = el.type;
      if (
        type === 'button' ||
        type === 'submit' ||
        type === 'reset' ||
        type === 'checkbox' ||
        type === 'radio' ||
        type === 'file' ||
        type === 'color' ||
        type === 'range'
      ) {
        return false;
      }
    }
    return true;
  }
  return el.isContentEditable;
}

export function isTypingInField(event: KeyboardEvent): boolean {
  return isTextEntryTarget(event.target) || isTextEntryTarget(document.activeElement);
}

/** Keys that must reach the caret instead of D-pad / remote handlers. */
export function isTextEntryTypingKey(event: KeyboardEvent): boolean {
  const key = event.key;
  const code = event.keyCode || event.which;
  const inMultiline =
    event.target instanceof HTMLTextAreaElement ||
    document.activeElement instanceof HTMLTextAreaElement;

  if (code === 8 || code === 46) return true;
  if (
    key === 'Backspace' ||
    key === 'Delete' ||
    key === ' ' ||
    key === 'Spacebar' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'Home' ||
    key === 'End' ||
    key === 'Tab'
  ) {
    return true;
  }
  if (key === 'Enter') return true;
  if ((key === 'ArrowUp' || key === 'ArrowDown') && inMultiline) return true;
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return key.length === 1 || key === 'Backspace' || key === 'Delete';
  }
  return key.length === 1;
}
