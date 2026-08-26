export function isSalesVisibleContract(
  contract: { status: string; archived: boolean; endType: string; endDate: string | null },
  today = new Date().toISOString().slice(0, 10),
) {
  return contract.status === "active"
    && !contract.archived
    && (contract.endType !== "date" || (!!contract.endDate && contract.endDate >= today));
}