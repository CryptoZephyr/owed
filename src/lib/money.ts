export type UsdAmount = { currencyCode: "USD"; value: string };

export function usd(cents: number): UsdAmount {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new RangeError(`Amount must be a positive whole number of cents, got ${cents}`);
  }
  return { currencyCode: "USD", value: `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}` };
}

export function toCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    throw new RangeError(`Not a valid money value: ${value}`);
  }
  const [, whole = "0", fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
