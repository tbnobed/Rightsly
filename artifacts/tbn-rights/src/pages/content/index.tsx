import { useEffect, useState } from "react";
import { useListContent, getListContentQueryKey, ListContentType } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Upload, Film, Tv, PlaySquare, MonitorPlay, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Sparkles, Captions, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { ContentFormDialog } from "@/components/content-form-dialog";

type ContentSortBy = "title" | "type" | "year" | "contractCount" | "updatedAt";
type SortDirection = "asc" | "desc";

export default function ContentList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [type, setType] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<ContentSortBy>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const params = {
    page,
    pageSize,
    search: debouncedSearch || undefined,
    type: type !== "all" ? type as ListContentType : undefined,
    sortBy,
    sortDirection,
  };
  const { data: result, isLoading } = useListContent(params, {
    query: {
      queryKey: getListContentQueryKey(params),
    }
  });
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  useEffect(() => {
    if (result && page > totalPages) setPage(totalPages);
  }, [page, result, totalPages]);

  const changeSort = (field: ContentSortBy) => {
    if (sortBy === field) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection(field === "contractCount" || field === "updatedAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: ContentSortBy }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
    return sortDirection === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 text-amber-700" />
      : <ArrowDown className="h-3.5 w-3.5 text-amber-700" />;
  };

  const SortHeader = ({ field, label }: { field: ContentSortBy; label: string }) => (
    <th className="px-6 py-4 font-medium">
      <button type="button" className="inline-flex items-center gap-1.5 hover:text-slate-900" onClick={() => changeSort(field)} data-testid={`button-sort-content-${field}`}>
        {label}<SortIcon field={field} />
      </button>
    </th>
  );

  const getTypeIcon = (contentType: string) => {
    switch (contentType) {
      case 'Film': return <Film className="w-5 h-5 text-indigo-500" />;
      case 'TVSeries': return <Tv className="w-5 h-5 text-blue-500" />;
      case 'TBN_FAST': 
      case 'WoF_FAST': return <PlaySquare className="w-5 h-5 text-rose-500" />;
      case 'TBN_Linear': return <MonitorPlay className="w-5 h-5 text-amber-500" />;
      default: return <Film className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Content Catalog</h1>
          <p className="text-slate-500 mt-1">Central repository of all licensable media assets.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50" data-testid="button-import-content">
            <Link href="/import">
              <Upload className="w-4 h-4 mr-2" />
              Import Content
            </Link>
          </Button>
          <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={() => setAddOpen(true)} data-testid="button-add-content">
            <Plus className="w-4 h-4 mr-2" />
            Add Title
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 bg-slate-50/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search titles..." 
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 bg-white border-slate-200"
            />
          </div>
          <Select value={type} onValueChange={(value) => {
            setType(value);
            setPage(1);
          }}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200">
              <SelectValue placeholder="Content Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Film">Film</SelectItem>
              <SelectItem value="TVSeries">TV Series</SelectItem>
              <SelectItem value="TBN_FAST">TBN FAST</SelectItem>
              <SelectItem value="TBN_Linear">TBN Linear</SelectItem>
              <SelectItem value="WoF_FAST">WoF FAST</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => {
            setSortBy(value as ContentSortBy);
            setSortDirection(value === "contractCount" || value === "updatedAt" ? "desc" : "asc");
            setPage(1);
          }}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200" data-testid="select-content-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="type">Content type</SelectItem>
              <SelectItem value="year">Release year</SelectItem>
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
            data-testid="button-content-sort-direction"
          >
            {sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-100">
              <tr>
                <SortHeader field="title" label="Title" />
                <SortHeader field="type" label="Type" />
                <th className="px-6 py-4 font-medium">Source</th>
                <SortHeader field="year" label="Year" />
                <SortHeader field="contractCount" label="Active Contracts" />
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Loading catalog...</td></tr>
              ) : !result?.data || result.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Film className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">No content found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                result.data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center shrink-0">
                          {getTypeIcon(item.type)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-base">{item.title}</span>
                            {item.hasCleans && (
                              <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[10px] gap-1" data-testid={`badge-cleans-${item.id}`}>
                                <Sparkles className="w-3 h-3" /> Cleans
                              </Badge>
                            )}
                            {item.hasCaptions && (
                              <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px] gap-1" data-testid={`badge-captions-${item.id}`}>
                                <Captions className="w-3 h-3" /> Captions
                              </Badge>
                            )}
                          </div>
                          {item.type === 'TVSeries' && item.seasons && (
                            <div className="text-xs text-slate-500 mt-0.5">{item.seasons.length} Seasons</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className="font-medium bg-white">
                        {item.type.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {item.contentSource ? (
                        <Badge variant="outline" className={item.contentSource === "tbn" ? "border-amber-200 bg-amber-50 text-amber-800" : "bg-white text-slate-600"} data-testid={`badge-source-${item.id}`}>
                          {item.contentSource === "tbn" ? "TBN" : "Third Party"}
                        </Badge>
                      ) : <span className="text-slate-400">Not set</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {item.year || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                        {item.contractCount || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/content/${item.id}`}>
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
        {result && result.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600" aria-live="polite">
              Showing <span className="font-medium text-slate-900">{(result.page - 1) * result.pageSize + 1}</span>
              {"–"}
              <span className="font-medium text-slate-900">{Math.min(result.page * result.pageSize, result.total)}</span>
              {" of "}
              <span className="font-medium text-slate-900">{result.total}</span> titles
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">Rows</span>
              <Select value={String(pageSize)} onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}>
                <SelectTrigger className="h-9 w-[72px] bg-white" data-testid="select-content-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="min-w-[92px] text-center text-sm text-slate-600">Page {result.page} of {totalPages}</span>
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page" data-testid="button-content-first-page">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Previous page" data-testid="button-content-previous-page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} aria-label="Next page" data-testid="button-content-next-page">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label="Last page" data-testid="button-content-last-page">
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ContentFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
