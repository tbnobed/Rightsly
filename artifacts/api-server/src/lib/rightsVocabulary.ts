/** Canonical rights vocabulary and documented aliases. */
export const TERRITORIES = [
  "Global", "North America", "Europe", "Latin America", "Asia Pacific",
  "Middle East", "Africa", "United States", "Canada", "United Kingdom",
  "Mexico", "Brazil", "Australia", "New Zealand", "Japan", "South Korea",
  "India", "France", "Germany", "Italy", "Spain",
] as const;
export const DISTRIBUTION_TYPES = [
  "SVOD", "AVOD", "TVOD", "FAST", "Linear Broadcast", "VOD", "Broadcast",
] as const;

const territoryAliases: Record<string, string> = {
  global: "Global", worldwide: "Global", world: "Global",
  us: "United States", usa: "United States", "u.s.": "United States", "united states": "United States",
  uk: "United Kingdom", "u.k.": "United Kingdom", britain: "United Kingdom", "great britain": "United Kingdom", "united kingdom": "United Kingdom",
  latam: "Latin America", "latin america": "Latin America",
  emea: "Europe", europe: "Europe", apac: "Asia Pacific", "asia pacific": "Asia Pacific",
  na: "North America", "north america": "North America", mea: "Middle East",
};
const distributionAliases: Record<string, string> = {
  svod: "SVOD", avod: "AVOD", tvod: "TVOD", fast: "FAST", vod: "VOD",
  linear: "Linear Broadcast", "linear broadcast": "Linear Broadcast",
  broadcast: "Broadcast", television: "Broadcast",
};
const regionCountries: Record<string, string[]> = {
  "North America": ["United States", "Canada", "Mexico"],
  Europe: ["United Kingdom", "France", "Germany", "Italy", "Spain"],
  "Latin America": ["Mexico", "Brazil"],
  "Asia Pacific": ["Australia", "New Zealand", "Japan", "South Korea", "India"],
};

const key = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const title = (value: string) => value.trim().replace(/\s+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const canonicalTerritoriesByKey = Object.fromEntries(TERRITORIES.map((value) => [key(value), value]));
const canonicalDistributionTypesByKey = Object.fromEntries(DISTRIBUTION_TYPES.map((value) => [key(value), value]));
export const canonicalTerritory = (value: string) =>
  territoryAliases[key(value)] ?? canonicalTerritoriesByKey[key(value)] ?? title(value);
export const territoryStorageKeys = (value: string) => {
  const canonical = canonicalTerritory(value);
  return [...new Set([
    key(canonical),
    ...Object.entries(territoryAliases)
      .filter(([, mapped]) => mapped === canonical)
      .map(([alias]) => alias),
  ])];
};
export const canonicalDistributionType = (value: string) =>
  distributionAliases[key(value)] ?? canonicalDistributionTypesByKey[key(value)] ?? title(value);
export const canonicalTerritories = (values: unknown) =>
  Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === "string" && !!v.trim()).map(canonicalTerritory))] : [];
export const canonicalDistributionTypes = (values: unknown) =>
  Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === "string" && !!v.trim()).map(canonicalDistributionType))] : [];
export const unrecognizedTerritories = (values: unknown) =>
  !Array.isArray(values)
    ? ["territories must be an array"]
    : values.filter((value): value is string =>
      typeof value !== "string" || !TERRITORIES.includes(canonicalTerritory(value) as typeof TERRITORIES[number]));
export const unrecognizedDistributionTypes = (values: unknown) =>
  !Array.isArray(values)
    ? ["distributionTypes must be an array"]
    : values.filter((value): value is string =>
      typeof value !== "string" || !DISTRIBUTION_TYPES.includes(canonicalDistributionType(value) as typeof DISTRIBUTION_TYPES[number]));
export const isRecognizedTerritory = (value: string) =>
  TERRITORIES.includes(canonicalTerritory(value) as typeof TERRITORIES[number]);
export const isRecognizedDistributionType = (value: string) =>
  DISTRIBUTION_TYPES.includes(canonicalDistributionType(value) as typeof DISTRIBUTION_TYPES[number]);

export function territoriesIntersect(a: string, b: string) {
  const left = canonicalTerritory(a), right = canonicalTerritory(b);
  if (left === "Global" || right === "Global" || left === right) return true;
  return (regionCountries[left]?.includes(right) ?? false) || (regionCountries[right]?.includes(left) ?? false);
}

export function distributionTypesIntersect(a: string, b: string) {
  const left = canonicalDistributionType(a), right = canonicalDistributionType(b);
  // VOD is a parent grouping; Broadcast contains Linear Broadcast.
  return left === right || (left === "VOD" && ["SVOD", "AVOD", "TVOD"].includes(right)) ||
    (right === "VOD" && ["SVOD", "AVOD", "TVOD"].includes(left)) ||
    (left === "Broadcast" && right === "Linear Broadcast") ||
    (right === "Broadcast" && left === "Linear Broadcast");
}