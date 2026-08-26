export function validateHttpUrl(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return "websiteLink must be a valid HTTP or HTTPS URL";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? null : "websiteLink must use HTTP or HTTPS";
  } catch { return "websiteLink must be a valid HTTP or HTTPS URL"; }
}

export function validateContentYear(year: unknown) {
  if (year == null || year === "") return null;
  const currentMaximum = new Date().getUTCFullYear() + 5;
  return typeof year === "number" && Number.isInteger(year) && year >= 1900 && year <= currentMaximum
    ? null : `year must be an integer between 1900 and ${currentMaximum}`;
}

export type TitleRightsTerm = "months" | "years" | "in_perpetuity";

export interface NormalizedTitleRights {
  contentSource: "tbn" | "third_party";
  tbnMediaId: string | null;
  notes: string | null;
  broadcastRightsDuration: number | null;
  broadcastRightsTerm: TitleRightsTerm | null;
  digitalRightsDuration: number | null;
  digitalRightsTerm: TitleRightsTerm | null;
  internationalRightsDuration: number | null;
  internationalRightsTerm: TitleRightsTerm | null;
  internationalBroadcastAirAmount: number | null;
  youtubeRightsDuration: number | null;
  youtubeRightsTerm: TitleRightsTerm | null;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRightsDuration(label: string, duration: unknown, term: unknown) {
  const normalizedTerm = term == null || term === "" ? null : term;
  if (normalizedTerm !== null && !["months", "years", "in_perpetuity"].includes(String(normalizedTerm))) {
    return { error: `${label} term must be Months, Years, In Perpetuity, or blank` };
  }
  if (normalizedTerm === null) {
    if (duration == null || duration === "") return { duration: null, term: null };
    if (typeof duration !== "number" || !Number.isInteger(duration) || duration <= 0) {
      return { error: `${label} duration must be a positive whole number` };
    }
    return { duration, term: null };
  }
  if (normalizedTerm === "in_perpetuity") {
    if (duration != null && duration !== "") return { error: `${label} duration must be blank for In Perpetuity` };
    return { duration: null, term: normalizedTerm as TitleRightsTerm };
  }
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration <= 0) {
    return { error: `${label} duration must be a positive whole number for Months or Years` };
  }
  return { duration, term: normalizedTerm as TitleRightsTerm };
}

export function normalizeTitleRights(input: Record<string, unknown>): { value?: NormalizedTitleRights; error?: string } {
  const source = input.contentSource;
  if (source !== "tbn" && source !== "third_party") {
    return { error: "contentSource must be tbn or third_party" };
  }
  const tbnMediaId = optionalText(input.tbnMediaId);
  if (tbnMediaId && tbnMediaId.length > 200) return { error: "TBN Media ID must be 200 characters or fewer" };
  if (source === "tbn" && !tbnMediaId) {
    return { error: "TBN Media ID is required for TBN content" };
  }
  const notes = optionalText(input.notes);
  if (notes && notes.length > 5000) return { error: "notes must be 5,000 characters or fewer" };
  const broadcast = normalizeRightsDuration("Broadcast Rights", input.broadcastRightsDuration, input.broadcastRightsTerm);
  if (broadcast.error) return { error: broadcast.error };
  const digital = normalizeRightsDuration("Digital Rights", input.digitalRightsDuration, input.digitalRightsTerm);
  if (digital.error) return { error: digital.error };
  const international = normalizeRightsDuration("International Rights", input.internationalRightsDuration, input.internationalRightsTerm);
  if (international.error) return { error: international.error };
  const youtube = normalizeRightsDuration("YouTube Rights", input.youtubeRightsDuration, input.youtubeRightsTerm);
  if (youtube.error) return { error: youtube.error };
  const airAmount = input.internationalBroadcastAirAmount;
  if (airAmount != null && airAmount !== "" && (
    typeof airAmount !== "number" || !Number.isInteger(airAmount) || airAmount <= 0
  )) {
    return { error: "International Broadcast Air Amount must be a positive whole number" };
  }
  return {
    value: {
      contentSource: source,
      tbnMediaId: source === "tbn" ? tbnMediaId : null,
      notes,
      broadcastRightsDuration: broadcast.duration ?? null,
      broadcastRightsTerm: broadcast.term ?? null,
      digitalRightsDuration: digital.duration ?? null,
      digitalRightsTerm: digital.term ?? null,
      internationalRightsDuration: international.duration ?? null,
      internationalRightsTerm: international.term ?? null,
      internationalBroadcastAirAmount: airAmount == null || airAmount === "" ? null : airAmount as number,
      youtubeRightsDuration: youtube.duration ?? null,
      youtubeRightsTerm: youtube.term ?? null,
    },
  };
}

export function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}