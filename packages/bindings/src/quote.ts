export type EncryptedQuote = {
  bid: bigint[];
  ask: bigint[];
  bidReciprocal: bigint[];
  askReciprocal: bigint[];
};

export function packQuoteCurve(quote: EncryptedQuote): bigint[] {
  const values = [
    ...quote.bid,
    ...quote.ask,
    ...quote.bidReciprocal,
    ...quote.askReciprocal,
  ];
  if (
    [quote.bid, quote.ask, quote.bidReciprocal, quote.askReciprocal].some(
      (fields) => fields.length !== 4
    ) ||
    values.some(
      (value) =>
        typeof value !== "bigint" || value < 0n || value > (1n << 64n) - 1n
    )
  )
    throw new RangeError(
      "Quote curve must contain sixteen unsigned 64 bit values"
    );
  const words = Array<bigint>(6).fill(0n);
  values.forEach((value, index) => {
    words[Math.floor(index / 3)] |= value << (BigInt(index % 3) * 64n);
  });
  return words;
}
