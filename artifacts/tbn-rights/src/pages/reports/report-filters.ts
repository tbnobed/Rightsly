export type ContractReportFilterFields = {
  status: string;
  endType: string;
};

export function matchesContractStatusFilter(
  contract: ContractReportFilterFields,
  filter: string,
) {
  if (filter === "in_perpetuity") {
    return contract.endType === "perpetuity";
  }

  if (filter === "auto_renew") {
    return contract.endType === "auto_renew";
  }

  return contract.status === filter;
}