import type {
  ListPartnersParams,
  PaginatedPartners,
  Partner,
} from "@workspace/api-client-react";

export const PARTNERS_PAGE_SIZE = 100;

type FetchPartnersPage = (
  params: ListPartnersParams,
  options?: RequestInit,
) => Promise<PaginatedPartners>;

/**
 * The partners endpoint is paginated, so a contract form must explicitly
 * walk every page rather than relying on the endpoint's default page size.
 */
export async function fetchAllPartners(
  fetchPage: FetchPartnersPage,
  signal?: AbortSignal,
): Promise<Partner[]> {
  const partners: Partner[] = [];
  let expectedTotal = 0;
  let page = 1;

  while (partners.length < expectedTotal || page === 1) {
    const result = await fetchPage(
      {
        page,
        pageSize: PARTNERS_PAGE_SIZE,
        sortBy: "name",
        sortDirection: "asc",
      },
      { signal },
    );

    if (!Number.isFinite(result.total) || result.total < 0) {
      throw new Error("The partners response contained an invalid total.");
    }
    if (!Array.isArray(result.data)) {
      throw new Error("The partners response contained invalid data.");
    }
    if (result.data.length === 0 && partners.length < result.total) {
      throw new Error("The partners response ended before all pages were loaded.");
    }

    expectedTotal = Math.max(expectedTotal, result.total);
    partners.push(...result.data);
    page += 1;
  }

  return partners;
}