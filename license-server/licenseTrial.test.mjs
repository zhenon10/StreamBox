import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantTrialIfNew, isTrialRecord, trialDays } from './licenseTrial.mjs';

test('grants one 7-day trial for a new device', () => {
  const db = { deviceLicenses: {}, codes: {} };
  const rec = grantTrialIfNew(db, 'ABCDEF123456', 'full-device-id');
  assert.ok(rec);
  assert.equal(rec.kind, 'trial');
  assert.equal(isTrialRecord(rec), true);
  assert.match(rec.planName, /Deneme/);
  const again = grantTrialIfNew(db, 'ABCDEF123456', 'full-device-id');
  assert.equal(again, null);
  assert.ok(rec.expiresAt > Date.now() + (trialDays() - 1) * 86_400_000);
});

test('does not replace a paid license with a trial', () => {
  const db = {
    deviceLicenses: {
      ABCDEF123456: {
        planName: '1 Yıl',
        playlistUrl: '',
        expiresAt: Date.now() + 86_400_000,
        kind: 'paid',
        createdAt: Date.now(),
      },
    },
  };
  assert.equal(grantTrialIfNew(db, 'ABCDEF123456', 'x'), null);
  assert.equal(db.deviceLicenses.ABCDEF123456.planName, '1 Yıl');
});
