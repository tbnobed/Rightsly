import { canonicalTerritory, territoriesIntersect, territoryContains } from "./rightsVocabulary.ts";
export const normalizeRightValue = (value: string) => canonicalTerritory(value).toLocaleLowerCase("en-US");

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
  const requested = canonicalTerritory(requestedTerritory);
  const explicit = (contractTerritories ?? []).map(canonicalTerritory).filter(Boolean);
  const other = (otherTerritories ?? "")
    .split(/[,;|]/)
    .map(canonicalTerritory)
    .filter(Boolean);
  const granted = [...explicit, ...other];

  return (
    granted.length === 0 ||
    granted.some((territory) => territoriesIntersect(requested, territory))
  );
}

/**
 * Returns true only when the contract grant contains the entire requested
 * territory. This directional check is required for Rights In acquisition
 * coverage; a country-level grant cannot cover a regional or Global request.
 */
export function territoriesCover(
  requestedTerritory: string,
  contractTerritories: string[] | null | undefined,
  otherTerritories?: string | null,
) {
  const requested = canonicalTerritory(requestedTerritory);
  const explicit = (contractTerritories ?? []).map(canonicalTerritory).filter(Boolean);
  const other = (otherTerritories ?? "")
    .split(/[,;|]/)
    .map(canonicalTerritory)
    .filter(Boolean);
  const granted = [...explicit, ...other];

  return granted.length === 0 ||
    granted.some((territory) => territoryContains(territory, requested));
}