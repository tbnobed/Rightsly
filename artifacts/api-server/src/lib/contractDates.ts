const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateContractDates(input: {
  startDate?: string | null;
  endType?: string | null;
  endDate?: string | null;
}) {
  const { startDate, endType, endDate } = input;

  if (startDate && !isValidDate(startDate)) {
    return "startDate must be a valid YYYY-MM-DD value";
  }
  if (endType === "date" && !endDate) {
    return "endDate is required when endType is date";
  }
  if (endDate && !isValidDate(endDate)) {
    return "endDate must be a valid YYYY-MM-DD value";
  }
  if (startDate && endType === "date" && endDate && endDate < startDate) {
    return "endDate must be on or after startDate";
  }
  return null;
}