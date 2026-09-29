interface MarketState {
  collateral: bigint;
  reserved: bigint;
  position: bigint;
  entry_price: bigint;
  funding_checkpoint: bigint;
  salt: bigint;
}

const mask64 = (1n << 64n) - 1n;
const mask128 = (1n << 128n) - 1n;

export async function unpackMarket(packed: bigint[]): Promise<MarketState> {
  if (packed.length !== 3) throw new Error("Invalid market ciphertext length");
  const [first, second, third] = packed;
  if (first < 0n || second < 0n || third < 0n) {
    throw new Error("Invalid market ciphertext value");
  }
  // Arcis packs wider fields first and shifts signed values by their minimum.
  return {
    collateral: (first >> 128n) & mask64,
    reserved: (second >> 128n) & mask64,
    position: (third & mask64) - (1n << 63n),
    entry_price: (third >> 64n) & mask64,
    funding_checkpoint: (first & mask128) - (1n << 127n),
    salt: second & mask128,
  };
}

export function packQuoteCurve(prices: bigint[]): bigint[] {
  if (prices.length !== 8) throw new RangeError("Quote requires eight prices");
  const reciprocal = prices.map((price) =>
    price === 0n ? 0n : (1n << 76n) / price
  );
  const fields = [...prices, ...reciprocal];
  const words = Array<bigint>(6).fill(0n);
  fields.forEach((field, index) => {
    words[Math.floor(index / 3)] |= field << (BigInt(index % 3) * 64n);
  });
  return words;
}
