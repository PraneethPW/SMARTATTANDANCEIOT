import { createHash, randomBytes } from 'node:crypto';

export type Coordinates = { latitude: number; longitude: number };

export function haversineMeters(from: Coordinates, to: Coordinates) {
  const earthRadius = 6_371_000;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = radians(to.latitude - from.latitude);
  const lonDelta = radians(to.longitude - from.longitude);
  const fromLat = radians(from.latitude);
  const toLat = radians(to.latitude);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

export function normalizeRfid(uid: string) {
  return uid.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

export function generateDeviceSecret() {
  return `ts_${randomBytes(24).toString('base64url')}`;
}

export function hashDeviceSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function isDwellSatisfied(candidateAt: Date | null, now: Date, seconds: number) {
  if (!candidateAt) return seconds === 0;
  return now.getTime() - candidateAt.getTime() >= seconds * 1000;
}

