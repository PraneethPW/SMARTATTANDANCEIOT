import assert from 'node:assert/strict';
import test from 'node:test';
import { haversineMeters, isDwellSatisfied, normalizeRfid } from './domain.js';

test('normalizes RFID identifiers before matching', () => {
  assert.equal(normalizeRfid('04:a1-b2 c3'), '04A1B2C3');
});

test('haversine returns zero for the same point', () => {
  assert.equal(haversineMeters({ latitude: 9.57, longitude: 77.67 }, { latitude: 9.57, longitude: 77.67 }), 0);
});

test('geofence dwell prevents a one-packet arrival', () => {
  const now = new Date('2026-09-21T08:00:10Z');
  assert.equal(isDwellSatisfied(new Date('2026-09-21T08:00:04Z'), now, 8), false);
  assert.equal(isDwellSatisfied(new Date('2026-09-21T08:00:01Z'), now, 8), true);
});

