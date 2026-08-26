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
  { value: "FAST", label: "FAST" },
  { value: "Linear Broadcast", label: "Linear Broadcast" },
  { value: "VOD", label: "VOD" },
  { value: "Broadcast", label: "Broadcast" },
] as const;

export function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}