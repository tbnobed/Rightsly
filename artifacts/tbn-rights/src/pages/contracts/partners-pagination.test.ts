import assert from "node:assert/strict";
import test from "node:test";
import type { ListPartnersParams, PaginatedPartners } from "@workspace/api-client-react";
import { fetchAllPartners, PARTNERS_PAGE_SIZE } from "./partners-pagination.ts";

test("fetchAllPartners loads every page with the server maximum page size", async () => {
  const calls: ListPartnersParams[] = [];
  const pages = [
    Array.from({ length: PARTNERS_PAGE_SIZE }, (_, index) => ({
      id: `partner-${index}`,
      name: `Partner ${index}`,
    })),
    Array.from({ length: PARTNERS_PAGE_SIZE }, (_, index) => ({
      id: `partner-${PARTNERS_PAGE_SIZE + index}`,
      name: `Partner ${PARTNERS_PAGE_SIZE + index}`,
    })),
    [{ id: "partner-200", name: "Partner 200" }],
  ];

  const result = await fetchAllPartners(async (params) => {
    calls.push(params);
    const data = pages[(params.page ?? 1) - 1] ?? [];
    return {
      data,
      total: 201,
      page: params.page ?? 1,
      pageSize: PARTNERS_PAGE_SIZE,
    } as PaginatedPartners;
  });

  assert.equal(result.length, 201);
  assert.deepEqual(
    calls.map(({ page, pageSize, sortBy, sortDirection }) => ({
      page,
      pageSize,
      sortBy,
      sortDirection,
    })),
    [
      { page: 1, pageSize: 100, sortBy: "name", sortDirection: "asc" },
      { page: 2, pageSize: 100, sortBy: "name", sortDirection: "asc" },
      { page: 3, pageSize: 100, sortBy: "name", sortDirection: "asc" },
    ],
  );
});

test("fetchAllPartners rejects an incomplete response instead of returning a partial list", async () => {
  await assert.rejects(
    fetchAllPartners(async (params) => ({
      data: params.page === 1 ? [{ id: "partner-1", name: "Partner 1" }] : [],
      total: 2,
      page: params.page ?? 1,
      pageSize: PARTNERS_PAGE_SIZE,
    }) as Promise<PaginatedPartners>),
    /ended before all pages were loaded/,
  );
});