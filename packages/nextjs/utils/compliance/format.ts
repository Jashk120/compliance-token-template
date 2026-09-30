const USD_SCALE = 100_000_000n;
const WEIBAR_PER_HBAR = 10n ** 18n;

export function formatUsd8(value: bigint | string): string {
  const raw = typeof value === "bigint" ? value : BigInt(value);
  const whole = raw / USD_SCALE;
  const cents = (raw % USD_SCALE) / 1_000_000n;
  return `$${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

export function hbarToUsd8(weibar: bigint, price8: bigint): bigint {
  return (weibar * price8) / WEIBAR_PER_HBAR;
}

export function shortAddress(address: string, size = 6): string {
  if (address.length <= size * 2 + 2) {
    return address;
  }
  return `${address.slice(0, size + 2)}...${address.slice(-size)}`;
}
