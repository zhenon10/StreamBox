/**
 * In-memory "adult categories unlocked" flag for the current app run.
 *
 * Deliberately NOT persisted: every fresh launch starts locked again
 * (PIN re-entry required), matching a parental-control expectation. Once
 * unlocked during a run, navigating between screens keeps it unlocked
 * until the app is closed/reloaded.
 */
class AdultLockSessionImpl {
  private unlocked = false;

  isUnlocked(): boolean {
    return this.unlocked;
  }

  unlock(): void {
    this.unlocked = true;
  }

  lock(): void {
    this.unlocked = false;
  }
}

export const adultLockSession = new AdultLockSessionImpl();
