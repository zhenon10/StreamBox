import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platform, services, TOKENS } from '@/application/di/container';
import { validateStoredLicense } from '@/application/usecases/licenseUseCases';
import { playlistRequiresLicense } from '@/domain/license/storeBuild';
import type { LicenseSnapshot } from '@/domain/license/types';

/**
 * Blocks playlist routes in store builds until a license is validated.
 * Returns null while checking; licensed snapshot (or null if gate off / unlicensed home).
 */
export function useRequireLicense(options?: {
  readonly redirectTo?: string;
  readonly enforce?: boolean;
}): {
  readonly checking: boolean;
  readonly licensed: boolean;
  readonly snapshot: LicenseSnapshot | null;
} {
  const enforce = options?.enforce ?? playlistRequiresLicense();
  const redirectTo = options?.redirectTo ?? '/';
  const navigate = useNavigate();
  const [checking, setChecking] = useState(enforce);
  const [snapshot, setSnapshot] = useState<LicenseSnapshot | null>(null);

  useEffect(() => {
    if (!enforce) {
      setChecking(false);
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    setChecking(true);
    void (async () => {
      const result = await validateStoredLicense({
        licenseClient: services.resolve(TOKENS.licenseClient),
        storage: platform.storage,
        licenseStore: services.resolve(TOKENS.licenseStore),
      });
      if (cancelled) return;
      if (!result.ok) {
        const cachedOk =
          result.error === 'network' &&
          result.snapshot != null &&
          result.snapshot.expiresAt > Date.now();
        if (!cachedOk) {
          setSnapshot(null);
          setChecking(false);
          navigate(redirectTo, { replace: true });
          return;
        }
        setSnapshot(result.snapshot);
        setChecking(false);
        return;
      }
      setSnapshot(result.snapshot);
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enforce, navigate, redirectTo]);

  return {
    checking,
    licensed: Boolean(snapshot) || !enforce,
    snapshot,
  };
}
