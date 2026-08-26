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

export function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}