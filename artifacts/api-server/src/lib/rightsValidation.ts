export const CONTENT_TYPES = ["Film", "TVSeries", "TBN_FAST", "TBN_Linear", "WoF_FAST"] as const;
export const CONTRACT_DIRECTIONS = ["rights_in", "rights_out"] as const;
export const CONTRACT_STATUSES = ["draft", "active", "expired", "in_perpetuity", "terminated"] as const;
export const END_TYPES = ["date", "perpetuity", "auto_renew"] as const;
export const ROYALTY_TYPES = ["revenue_share", "flat_fee", "other"] as const;
export const PAYMENT_TERMS = ["net_30", "net_60", "net_90"] as const;
export const REPORTING_FREQUENCIES = ["monthly", "quarterly", "annually"] as const;
export const RIGHTS_OUT_EXCLUSIVITIES = ["exclusive", "non_exclusive"] as const;

const contentTypeAliases: Record<string, (typeof CONTENT_TYPES)[number]> = {
  "tv series": "TVSeries",
};
const exclusivityAliases: Record<string, (typeof RIGHTS_OUT_EXCLUSIVITIES)[number]> = {
  "non-exclusive": "non_exclusive",
};

const aliasKey = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

export function normalizeContentType(value: unknown) {
  if (typeof value !== "string") return undefined;
  return contentTypeAliases[aliasKey(value)] ??
    (CONTENT_TYPES.includes(value as (typeof CONTENT_TYPES)[number]) ? value as (typeof CONTENT_TYPES)[number] : undefined);
}

export function normalizeRightsOutExclusivity(value: unknown) {
  if (typeof value !== "string") return undefined;
  return exclusivityAliases[aliasKey(value)] ??
    (RIGHTS_OUT_EXCLUSIVITIES.includes(value as (typeof RIGHTS_OUT_EXCLUSIVITIES)[number])
      ? value as (typeof RIGHTS_OUT_EXCLUSIVITIES)[number]
      : undefined);
}

export function isEnumValue<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}