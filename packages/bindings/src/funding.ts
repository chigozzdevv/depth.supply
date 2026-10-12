export function fundingFresh(
  last: number,
  interval: number,
  now: number,
): boolean {
  return (
    Number.isSafeInteger(last) &&
    last > 0 &&
    Number.isSafeInteger(interval) &&
    interval >= 60 &&
    interval <= 86_400 &&
    Number.isSafeInteger(now) &&
    now >= last &&
    now - last < interval * 2
  );
}
