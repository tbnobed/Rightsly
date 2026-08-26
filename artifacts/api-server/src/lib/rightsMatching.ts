export const normalizeRightValue = (value: string) =>
  value.trim().toLocaleLowerCase("en-US");

/**
 * Returns true when the requested territory overlaps a contract's territory.
 * A Global request overlaps every territorial grant because it asks whether
 * rights are available everywhere. An empty contract territory list is also
 * treated as Global, matching how the app presents those contracts.
 */
export function territoriesOverlap(
  requestedTerritory: string,
  contractTerritories: string[] | null | undefined,
  otherTerritories?: string | null,
) {
  const requested = normalizeRightValue(requestedTerritory);
  const explicit = (contractTerritories ?? []).map(normalizeRightValue).filter(Boolean);
  const other = (otherTerritories ?? "")
    .split(/[,;|]/)
    .map(normalizeRightValue)
    .filter(Boolean);
  const granted = [...explicit, ...other];

  return (
    requested === "global" ||
    granted.length === 0 ||
    granted.includes("global") ||
    granted.includes(requested)
  );
}