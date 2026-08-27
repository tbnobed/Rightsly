export const TERRITORY_OPTIONS = [
  { value: "Global", label: "Global" },
  { value: "North America", label: "North America" },
  { value: "Europe", label: "Europe" },
  { value: "Latin America", label: "Latin America" },
  { value: "Asia Pacific", label: "Asia Pacific" },
  { value: "Middle East", label: "Middle East" },
  { value: "Africa", label: "Africa" },
  { value: "United States", label: "United States" },
  { value: "Canada", label: "Canada" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Mexico", label: "Mexico" },
  { value: "Brazil", label: "Brazil" },
  { value: "Australia", label: "Australia" },
  { value: "New Zealand", label: "New Zealand" },
  { value: "Japan", label: "Japan" },
  { value: "South Korea", label: "South Korea" },
  { value: "India", label: "India" },
  { value: "France", label: "France" },
  { value: "Germany", label: "Germany" },
  { value: "Italy", label: "Italy" },
  { value: "Spain", label: "Spain" },
] as const;

export const DISTRIBUTION_OPTIONS = [
  { value: "AVOD", label: "AVOD" },
  { value: "SVOD", label: "SVOD" },
  { value: "TVOD", label: "TVOD" },
  { value: "FAST", label: "Digital FAST Feed" },
  { value: "Linear Broadcast", label: "Linear COM Feed" },
  { value: "BD/DVD", label: "BD/DVD" },
  { value: "VOD", label: "VOD" },
  { value: "Broadcast", label: "Broadcast" },
] as const;

const DISTRIBUTION_LABELS = Object.fromEntries(
  DISTRIBUTION_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<string, string>;

export function distributionLabel(value: string) {
  return DISTRIBUTION_LABELS[value] ?? value;
}

export function contractTerritoryLabels(
  territories: readonly string[] | null | undefined,
  otherTerritories: string | null | undefined,
) {
  const custom = (otherTerritories ?? "")
    .split(/[,;\n]/)
    .map((territory) => territory.trim())
    .filter(Boolean);
  return [...new Set([...(territories ?? []), ...custom])];
}

export function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}