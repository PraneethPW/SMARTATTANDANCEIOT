export function faceDistance(a: number[], b: number[]): number {
  if (
    a.length !== 128 ||
    b.length !== 128 ||
    !a.every(Number.isFinite) ||
    !b.every(Number.isFinite)
  )
    return Infinity;
  return Math.sqrt(a.reduce((sum, n, i) => sum + (n - b[i]!) ** 2, 0));
}

export function headTurnPassed(
  front: number,
  turned: number,
  direction: "LEFT" | "RIGHT",
): boolean {
  if (
    !Number.isFinite(front) ||
    !Number.isFinite(turned) ||
    Math.abs(front) >= 0.08
  )
    return false;
  return direction === "LEFT"
    ? turned - front > 0.045
    : turned - front < -0.045;
}
