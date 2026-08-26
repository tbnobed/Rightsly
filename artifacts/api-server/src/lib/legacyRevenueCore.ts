export function effectiveAmountReceived(
  amountReceived: string | number | null,
  legacyAmount: string | number | null,
) {
  const value = amountReceived ?? legacyAmount;
  return value === null ? null : Number(value);
}