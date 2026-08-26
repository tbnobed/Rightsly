export function displayContractStatus<T extends { status: string; endType: string; endDate: string | null }>(contract: T, today = new Date().toISOString().slice(0, 10)) {
  return contract.status === "active" && contract.endType === "date" && !!contract.endDate && contract.endDate < today
    ? { ...contract, status: "expired" as const } : contract;
}