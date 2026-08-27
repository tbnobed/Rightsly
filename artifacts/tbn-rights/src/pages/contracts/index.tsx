import { useEffect, useState } from "react";
import {
  useListContracts,
  getListContractsQueryKey,
  useGetContractFilterOptions,
  getGetContractFilterOptionsQueryKey,
  ContractListItemDirection,
  ContractListItemStatus,
  ListContractsSortBy,
  ListContractsSortDirection,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from "date-fns";
import { Search, Plus, FileText, Filter, ChevronRight, ArrowUp, ArrowDown, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { getContractsPagination, getNextContractSort } from "./contracts-list-state";

export default function ContractsList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [contentSearch, setContentSearch] = useState("");
  const debouncedContentSearch = useDebounce(contentSearch, 300);
  const [direction, setDirection] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [departmentTag, setDepartmentTag] = useState<string>("all");
  const [territory, setTerritory] = useState<string>("all");
  const [licensor, setLicensor] = useState<string>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<ListContractsSortBy>("createdAt");
  const [sortDirection, setSortDirection] = useState<ListContractsSortDirection>("desc");

  const resetPage = () => setPage(1);
  const updateFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    resetPage();
  };
  
  const params = {
    search: debouncedSearch || undefined,
    contentSearch: debouncedContentSearch || undefined,
    direction: direction !== "all" ? direction as ContractListItemDirection : undefined,
    status: status !== "all" ? status as ContractListItemStatus : undefined,
    departmentTag: departmentTag !== "all" ? departmentTag : undefined,
    territory: territory !== "all" ? territory : undefined,
    licensor: licensor !== "all" ? licensor : undefined,
    includeArchived: includeArchived || undefined,
    page,
    pageSize,
    sortBy,
    sortDirection,
  };
  const { data: result, isLoading } = useListContracts(params, {
    query: {
      queryKey: getListContractsQueryKey(params),
    }
  });
  const filterParams = { includeArchived: includeArchived || undefined };
  const { data: filterOptions } = useGetContractFilterOptions(filterParams, {
    query: { queryKey: getGetContractFilterOptionsQueryKey(filterParams) },
  });
  const pagination = getContractsPagination(result?.total ?? 0, page, pageSize);
  const { totalPages } = pagination;

  useEffect(() => {
    if (result && page > totalPages) setPage(totalPages);
  }, [page, result, totalPages]);

  const changeSort = (field: ListContractsSortBy) => {
    const next = getNextContractSort(sortBy, sortDirection, field);
    setSortBy(next.sortBy);
    setSortDirection(next.sortDirection);
    resetPage();
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contracts</h1>
          <p className="text-slate-500 mt-1">Manage and track all licensing agreements.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white border-none w-full sm:w-auto" data-testid="button-new-contract">
            <Link href="/contracts/new">
              <Plus className="w-4 h-4 mr-2" />
              New Contract
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-4 bg-slate-50/50">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search partner, ID, licensor, territories..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="pl-9 bg-white border-slate-200"
                data-testid="input-search-contracts"
              />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search by content title..." 
                value={contentSearch}
                onChange={(e) => { setContentSearch(e.target.value); resetPage(); }}
                className="pl-9 bg-white border-slate-200"
                data-testid="input-search-content"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3">
            <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
               <Select value={direction} onValueChange={updateFilter(setDirection)}>
                <SelectTrigger className="w-full sm:w-[140px] bg-white border-slate-200" data-testid="select-direction">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="rights_in">Rights In</SelectItem>
                  <SelectItem value="rights_out">Rights Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <Select value={status} onValueChange={updateFilter(setStatus)}>
              <SelectTrigger className="w-full sm:w-[140px] bg-white border-slate-200" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="in_perpetuity">In Perpetuity</SelectItem>
              </SelectContent>
            </Select>
             <Select value={departmentTag} onValueChange={updateFilter(setDepartmentTag)}>
              <SelectTrigger className="w-full sm:w-[160px] bg-white border-slate-200" data-testid="select-department-tag">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="Acquisition">Acquisition</SelectItem>
                <SelectItem value="Distribution">Distribution</SelectItem>
              </SelectContent>
            </Select>
             <Select value={territory} onValueChange={updateFilter(setTerritory)}>
               <SelectTrigger className="w-full sm:w-[160px] bg-white border-slate-200" data-testid="select-territory">
                 <SelectValue placeholder="Territory" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">All Territories</SelectItem>
                 {filterOptions?.territories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
               </SelectContent>
             </Select>
             <Select value={licensor} onValueChange={updateFilter(setLicensor)}>
               <SelectTrigger className="w-full sm:w-[160px] bg-white border-slate-200" data-testid="select-licensor">
                 <SelectValue placeholder="Licensor" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">All Licensors</SelectItem>
                 {filterOptions?.licensors.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
               </SelectContent>
             </Select>
            <label className="col-span-2 sm:col-span-1 flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none sm:ml-auto mt-2 sm:mt-0">
              <Checkbox
                checked={includeArchived}
                 onCheckedChange={(v) => { setIncludeArchived(v === true); resetPage(); }}
                data-testid="checkbox-show-archived"
              />
              Show archived
            </label>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-100">
              <tr>
                 <SortableHeader label="Partner / ID" field="partnerName" {...{ sortBy, sortDirection, changeSort }} />
                 <SortableHeader label="Licensor" field="licensor" {...{ sortBy, sortDirection, changeSort }} />
                 <SortableHeader label="Direction" field="direction" {...{ sortBy, sortDirection, changeSort }} />
                 <SortableHeader label="Status" field="status" {...{ sortBy, sortDirection, changeSort }} />
                 <SortableHeader label="Territories" field="territories" {...{ sortBy, sortDirection, changeSort }} />
                 <SortableHeader label="Content" field="contentCount" {...{ sortBy, sortDirection, changeSort }} />
                 <SortableHeader label="End Date" field="endDate" {...{ sortBy, sortDirection, changeSort }} />
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-500">Loading contracts...</td></tr>
              ) : !result?.data || result.data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">No contracts found</p>
                      <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or create a new contract.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                result.data.map((contract) => (
                  <tr
                    key={contract.id}
                     className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => setLocation(`/contracts/${contract.id}`)}
                    data-testid={`row-contract-${contract.id}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/contracts/${contract.id}`} className="font-semibold text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded" onClick={(event) => event.stopPropagation()} data-testid={`link-contract-${contract.id}`}>{contract.partnerName || 'Unknown Partner'}</Link>
                        {(contract as { archived?: boolean }).archived && (
                          <Badge variant="secondary" className="bg-slate-200 text-slate-600 hover:bg-slate-200 text-[10px] uppercase tracking-wider" data-testid={`badge-archived-${contract.id}`}>Archived</Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{contract.id.slice(0,8)}...</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {contract.licensor || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={`capitalize font-medium ${contract.direction === 'rights_in' ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-emerald-200 text-emerald-700 bg-emerald-50'}`}>
                        {contract.direction.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={contract.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {contract.territories && contract.territories.length > 0 ? (
                          <>
                            <span className="text-slate-600 truncate block">{contract.territories.slice(0, 2).join(', ')}</span>
                            {contract.territories.length > 2 && <span className="text-xs text-slate-400">+{contract.territories.length - 2}</span>}
                          </>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">{contract.contentCount || 0}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {contract.endType === 'perpetuity' ? (
                        <span className="italic text-slate-400">In Perpetuity</span>
                      ) : contract.endDate ? (
                        format(parseISO(contract.endDate), 'MMM d, yyyy')
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                         <Link href={`/contracts/${contract.id}`} aria-label={`Open contract for ${contract.partnerName || "Unknown Partner"}`} onClick={(event) => event.stopPropagation()} data-testid={`link-contract-chevron-${contract.id}`}>
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
         {result && (
           <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-sm text-slate-500">
             <div className="flex flex-col sm:flex-row sm:items-center gap-3">
               <span aria-live="polite">
                 {result.total === 0 ? "No results" : `Showing ${pagination.start}–${pagination.end} of ${result.total}`}
               </span>
               <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); resetPage(); }}>
                 <SelectTrigger className="w-full sm:w-[110px] bg-white" aria-label="Results per page"><SelectValue /></SelectTrigger>
                 <SelectContent>
                   {[10, 20, 50, 100].map((value) => <SelectItem key={value} value={String(value)}>{value} / page</SelectItem>)}
                 </SelectContent>
               </Select>
             </div>
             <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1" role="navigation" aria-label="Contracts pagination">
               <Button variant="outline" size="icon" onClick={() => setPage(1)} disabled={page <= 1} aria-label="First page"><ChevronsLeft className="h-4 w-4" /></Button>
               <Button variant="outline" size="sm" onClick={() => setPage((value) => value - 1)} disabled={page <= 1}>Prev</Button>
               <span className="px-2 tabular-nums">Page {page} of {totalPages}</span>
               <Button variant="outline" size="sm" onClick={() => setPage((value) => value + 1)} disabled={page >= totalPages}>Next</Button>
               <Button variant="outline" size="icon" onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="Last page"><ChevronsRight className="h-4 w-4" /></Button>
             </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortDirection,
  changeSort,
}: {
  label: string;
  field: ListContractsSortBy;
  sortBy: ListContractsSortBy;
  sortDirection: ListContractsSortDirection;
  changeSort: (field: ListContractsSortBy) => void;
}) {
  const active = sortBy === field;
  return (
    <th className="px-6 py-2 font-medium" aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => changeSort(field)} className="flex items-center gap-1 rounded py-2 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
        {label}
        {active ? (sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <span className="h-3.5 w-3.5" />}
      </button>
    </th>
  );
}

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-sm">Active</Badge>;
    case 'draft':
      return <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200">Draft</Badge>;
    case 'expired':
      return <Badge variant="destructive" className="bg-red-500 hover:bg-red-600 text-white shadow-sm">Expired</Badge>;
    case 'in_perpetuity':
      return <Badge className="bg-indigo-500 hover:bg-indigo-600 text-white border-none shadow-sm">Perpetuity</Badge>;
    default:
      return <Badge variant="outline" className="capitalize">{status}</Badge>;
  }
}
