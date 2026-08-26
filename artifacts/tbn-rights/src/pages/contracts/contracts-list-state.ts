import type { ListContractsSortBy, ListContractsSortDirection } from "@workspace/api-client-react";

export function getContractsPagination(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    totalPages,
    safePage,
    start: total === 0 ? 0 : (safePage - 1) * pageSize + 1,
    end: Math.min(safePage * pageSize, total),
  };
}

export function getNextContractSort(
  currentField: ListContractsSortBy,
  currentDirection: ListContractsSortDirection,
  clickedField: ListContractsSortBy,
) {
  if (currentField === clickedField) {
    return {
      sortBy: currentField,
      sortDirection: currentDirection === "asc" ? "desc" as const : "asc" as const,
    };
  }
  return { sortBy: clickedField, sortDirection: "asc" as const };
}