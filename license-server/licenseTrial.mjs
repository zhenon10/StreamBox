/** First-open player trial. Paid plans stay ONE_YEAR / LIFETIME. */

export const TRIAL_KIND = 'trial';
export const PAID_KIND = 'paid';

export function trialDays() {
  const n = Number(process.env.IVPLAYER_TRIAL_DAYS ?? 7);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(30, Math.round(n));
}

export function isTrialRecord(rec) {
  return Boolean(rec) && rec.kind === TRIAL_KIND;
}

/**
 * One trial per device code. Never overwrites an existing (paid or used) record.
 * @returns {object | null} new trial record, or null if skipped
 */
export function grantTrialIfNew(db, deviceCode, deviceId) {
  if (trialDays() <= 0) return null;
  if (!db.deviceLicenses) db.deviceLicenses = {};
  if (db.deviceLicenses[deviceCode]) return null;

  const days = trialDays();
  const rec = {
    planName: `Deneme (${days} gün)`,
    playlistUrl: '',
    expiresAt: Date.now() + days * 86_400_000,
    fullDeviceId: deviceId || undefined,
    createdAt: Date.now(),
    kind: TRIAL_KIND,
  };
  db.deviceLicenses[deviceCode] = rec;
  return rec;
}

export function syncSyntheticDeviceCode(db, deviceCode, rec) {
  if (!db.codes) db.codes = {};
  const syntheticCode = `DEV-${deviceCode}`;
  if (!db.codes[syntheticCode]) {
    db.codes[syntheticCode] = {
      planName: rec.planName,
      playlistUrl: rec.playlistUrl || '',
      maxDevices: 1,
      expiresAt: rec.expiresAt,
    };
    return;
  }
  db.codes[syntheticCode].planName = rec.planName;
  db.codes[syntheticCode].playlistUrl = rec.playlistUrl || '';
  db.codes[syntheticCode].expiresAt = rec.expiresAt;
}
