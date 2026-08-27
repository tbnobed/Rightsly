import { useListPartners, getListPartnersQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Briefcase, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Globe, LayoutGrid, List, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import { PartnerFormDialog } from "@/components/partner-form-dialog";

type PartnerSortBy = "name" | "type" | "website" | "contractCount" | "updatedAt";
type SortDirection = "asc" | "desc";

export default function PartnersList() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<PartnerSortBy>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [, navigate] = useLocation();
  const [view, setView] = useState<"grid" | "list">(
    () => (localStorage.getItem("partners_view") === "list" ? "list" : "grid")
  );
  const changeView = (v: "grid" | "list") => {
    setView(v);
    localStorage.setItem("partners_view", v);
  };
  const debouncedSearch = useDebounce(search, 300);

  const params = {
    page,
    pageSize,
    search: debouncedSearch || undefined,
    sortBy,
    sortDirection,
  };
  const { data: result, isLoading } = useListPartners(params, {
    query: {
      queryKey: getListPartnersQueryKey(params),
    }
  });
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  useEffect(() => {
    if (result && page > totalPages) setPage(totalPages);
  }, [page, result, totalPages]);

  const changeSort = (field: PartnerSortBy) => {
    if (sortBy === field) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection(field === "contractCount" || field === "updatedAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: PartnerSortBy }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
    return sortDirection === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 text-amber-700" />
      : <ArrowDown className="h-3.5 w-3.5 text-amber-700" />;
  };

  const SortHeader = ({ field, label, align = "left" }: { field: PartnerSortBy; label: string; align?: "left" | "right" }) => (
    <th className={`px-6 py-3 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 hover:text-slate-900 ${align === "right" ? "justify-end" : ""}`}
        onClick={() => changeSort(field)}
        aria-label={`Sort by ${label}`}
        data-testid={`button-sort-partners-${field}`}
      >
        {label}<SortIcon field={field} />
      </button>
    </th>
  );

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Partners</h1>
          <p className="text-slate-500 mt-1">Manage licensors and licensees.</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white w-full sm:w-auto" onClick={() => setAddOpen(true)} data-testid="button-add-partner">
          <Plus className="w-4 h-4 mr-2" />
          Add Partner
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3 bg-slate-50/50">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search partners..." 
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 bg-white border-slate-200"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto justify-between md:justify-start">
            <div className="flex items-center gap-2 flex-1 sm:flex-none">
              <Select
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value as PartnerSortBy);
                  setSortDirection(value === "contractCount" || value === "updatedAt" ? "desc" : "asc");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[170px] bg-white" data-testid="select-partners-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="type">Partner type</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="contractCount">Active contract count</SelectItem>
                  <SelectItem value="updatedAt">Recently updated</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  setSortDirection((current) => current === "asc" ? "desc" : "asc");
                  setPage(1);
                }}
                aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
                data-testid="button-partners-sort-direction"
              >
                {sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 shrink-0">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5"
              onClick={() => changeView("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5"
              onClick={() => changeView("list")}
              data-testid="button-view-list"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Loading partners...</div>
        ) : !result?.data || result.data.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center">
            <Briefcase className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No partners found</p>
          </div>
        ) : view === "list" ? (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" data-testid="table-partners">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-100">
              <tr>
                <SortHeader field="name" label="Name" />
                <SortHeader field="type" label="Type" />
                <SortHeader field="website" label="Website" />
                <SortHeader field="contractCount" label="Active Contracts" align="right" />
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {result.data.map((partner) => (
                <tr
                  key={partner.id}
                  className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                  onClick={() => navigate(`/partners/${partner.id}`)}
                  data-testid={`row-partner-${partner.id}`}
                >
                  <td className="px-6 py-3 font-medium text-slate-900">
                    <span className="inline-flex items-center gap-3">
                      <span className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-600 font-bold shrink-0">
                        {partner.name.charAt(0)}
                      </span>
                      {partner.name}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant="outline" className={`
                      ${partner.type === 'Licensor' ? 'border-blue-200 text-blue-700 bg-blue-50' : 
                        partner.type === 'Licensee' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 
                        'border-purple-200 text-purple-700 bg-purple-50'}
                    `}>
                      {partner.type}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-slate-500 truncate max-w-52">
                    {partner.website ? partner.website.replace(/^https?:\/\//, '') : '—'}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-slate-900">{partner.contractCount || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="w-4 h-4 text-slate-300 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {result.data.map((partner) => (
              <Link key={partner.id} href={`/partners/${partner.id}`}>
                <Card className="h-full border-slate-200 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg">
                        {partner.name.charAt(0)}
                      </div>
                      <Badge variant="outline" className={`
                        ${partner.type === 'Licensor' ? 'border-blue-200 text-blue-700 bg-blue-50' : 
                          partner.type === 'Licensee' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 
                          'border-purple-200 text-purple-700 bg-purple-50'}
                      `}>
                        {partner.type}
                      </Badge>
                    </div>
                    
                    <h3 className="font-bold text-lg text-slate-900 group-hover:text-amber-700 transition-colors mb-1 truncate">
                      {partner.name}
                    </h3>
                    
                    {partner.website && (
                      <div className="flex items-center text-sm text-slate-500 mb-4">
                        <Globe className="w-3.5 h-3.5 mr-1" />
                        <span className="truncate">{partner.website.replace(/^https?:\/\//, '')}</span>
                      </div>
                    )}
                    
                    <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                      <span className="text-slate-600"><strong className="text-slate-900">{partner.contractCount || 0}</strong> Active Contracts</span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>
        )}

        {result && result.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-600" aria-live="polite">
              Showing <span className="font-medium text-slate-900">{(result.page - 1) * result.pageSize + 1}</span>
              {"–"}
              <span className="font-medium text-slate-900">{Math.min(result.page * result.pageSize, result.total)}</span>
              {" of "}
              <span className="font-medium text-slate-900">{result.total}</span> partners
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="text-sm text-slate-600">Rows</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[72px] bg-white" data-testid="select-partners-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="min-w-[92px] text-center text-sm text-slate-600">
                Page {result.page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-9 w-9" disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page" data-testid="button-partners-first-page">
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Previous page" data-testid="button-partners-previous-page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} aria-label="Next page" data-testid="button-partners-next-page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label="Last page" data-testid="button-partners-last-page">
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <PartnerFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
