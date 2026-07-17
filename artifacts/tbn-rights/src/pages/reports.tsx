import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetContractReport, getGetContractReportQueryKey, useGetExpiringReport, useGetRoyaltyReport, ContractListItem } from "@workspace/api-client-react";
import { FileDown, FileText, CalendarClock, DollarSign, Filter, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type SortField = "partner" | "contentCount" | "status" | "royaltyType" | "endDate";
type SortDir = "asc" | "desc";

const STATUS_CHIPS: { key: string; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "in_perpetuity", label: "In Perpetuity" },
  { key: "expired", label: "Expired" },
  { key: "auto_renew", label: "Auto-Renew" },
];

export default function Reports() {
  const { toast } = useToast();

  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>("partner");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: contractReport, isLoading: isLoadingReport } = useGetContractReport(undefined, {
    query: { queryKey: getGetContractReportQueryKey() },
  });

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const rows = useMemo(() => {
    const data: ContractListItem[] = contractReport?.data ?? [];
    const filtered = activeFilters.length === 0
      ? data
      : data.filter((c) =>
          activeFilters.some((f) =>
            f === "auto_renew" ? c.endType === "auto_renew" : c.status === f
          )
        );

    const dirMul = sortDir === "asc" ? 1 : -1;
    const compare = (a: ContractListItem, b: ContractListItem) => {
      switch (sortField) {
        case "partner":
          return (a.partnerName || "").localeCompare(b.partnerName || "") * dirMul;
        case "contentCount":
          return ((a.contentCount || 0) - (b.contentCount || 0)) * dirMul;
        case "status":
          return (a.status || "").localeCompare(b.status || "") * dirMul;
        case "royaltyType":
          return (a.royaltyType || "").localeCompare(b.royaltyType || "") * dirMul;
        case "endDate": {
          const av = a.endDate ? new Date(a.endDate).getTime() : 0;
          const bv = b.endDate ? new Date(b.endDate).getTime() : 0;
          return (av - bv) * dirMul;
        }
        default:
          return 0;
      }
    };
    return [...filtered].sort(compare);
  }, [contractReport, activeFilters, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 inline ml-1 text-slate-400" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 inline ml-1 text-slate-700" />
      : <ArrowDown className="w-3 h-3 inline ml-1 text-slate-700" />;
  };

  const handleExport = async (type: "contracts" | "expiring" | "royalties") => {
    toast({
      title: "Export started",
      description: "Generating Excel file...",
    });
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/reports/${type}?format=xlsx`,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
      );
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "You don't have permission to export this report."
            : `Export failed (HTTP ${res.status}).`,
        );
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match?.[1]?.trim() || `${type}-report.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: filename });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports Hub</h1>
        <p className="text-slate-500 mt-1">Generate and export system data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Contract Summaries */}
        <Card className="border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
              <FileText className="w-5 h-5 text-blue-700" />
            </div>
            <CardTitle>Contract Summaries</CardTitle>
            <CardDescription>Full listing of active agreements with key terms.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Direction Filter</label>
              <Select defaultValue="all">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="rights_in">Rights In Only</SelectItem>
                  <SelectItem value="rights_out">Rights Out Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Status Filter</label>
              <Select defaultValue="active">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="pt-4 flex gap-3">
              <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-800" onClick={() => handleExport('contracts')}>
                <FileDown className="w-4 h-4 mr-2" /> Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card className="border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-3">
              <CalendarClock className="w-5 h-5 text-amber-700" />
            </div>
            <CardTitle>Expiring Soon</CardTitle>
            <CardDescription>Upcoming renewals and terminations.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Timeframe</label>
              <Select defaultValue="90">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Next 30 Days</SelectItem>
                  <SelectItem value="60">Next 60 Days</SelectItem>
                  <SelectItem value="90">Next 90 Days</SelectItem>
                  <SelectItem value="180">Next 180 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="h-16"></div> {/* Spacer to align buttons */}
            
            <div className="pt-4 flex gap-3">
              <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-800" onClick={() => handleExport('expiring')}>
                <FileDown className="w-4 h-4 mr-2" /> Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Royalty Statements */}
        <Card className="border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-3">
              <DollarSign className="w-5 h-5 text-emerald-700" />
            </div>
            <CardTitle>Royalty Statements</CardTitle>
            <CardDescription>Calculated owed amounts per period.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Period</label>
              <Select defaultValue="q1_2023">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="q3_2023">Q3 2023</SelectItem>
                  <SelectItem value="q2_2023">Q2 2023</SelectItem>
                  <SelectItem value="q1_2023">Q1 2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
              <Select defaultValue="approved">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="approved">Approved Only</SelectItem>
                  <SelectItem value="pending">Pending Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="pt-4 flex gap-3">
              <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-800" onClick={() => handleExport('royalties')}>
                <FileDown className="w-4 h-4 mr-2" /> Excel
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Contract Results</CardTitle>
              <CardDescription>Filter and sort the contract report data.</CardDescription>
            </div>
            <Button variant="outline" className="bg-white" onClick={() => handleExport('contracts')} data-testid="button-export-results">
              <FileDown className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-4">
            <span className="text-xs font-semibold text-slate-500 uppercase mr-1 flex items-center">
              <Filter className="w-3.5 h-3.5 mr-1" /> Status
            </span>
            {STATUS_CHIPS.map((chip) => {
              const active = activeFilters.includes(chip.key);
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => toggleFilter(chip.key)}
                  data-testid={`chip-filter-${chip.key}`}
                >
                  <Badge
                    variant={active ? "default" : "outline"}
                    className={`cursor-pointer transition-colors ${active ? 'bg-amber-600 hover:bg-amber-700 text-white border-none' : 'bg-white hover:bg-slate-100 text-slate-600'}`}
                  >
                    {chip.label}
                  </Badge>
                </button>
              );
            })}
            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilters([])}
                className="text-xs text-slate-500 hover:text-slate-700 underline ml-1"
                data-testid="button-clear-filters"
              >
                Clear
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('partner')} data-testid="sort-partner">
                    Partner <SortIcon field="partner" />
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('contentCount')} data-testid="sort-content-count">
                    Content <SortIcon field="contentCount" />
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('status')} data-testid="sort-status">
                    Status <SortIcon field="status" />
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('royaltyType')} data-testid="sort-royalty-type">
                    Royalty Type <SortIcon field="royaltyType" />
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('endDate')} data-testid="sort-end-date">
                    End Date <SortIcon field="endDate" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoadingReport ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading report...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No results match the selected filters.</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors" data-testid={`row-report-${row.id}`}>
                      <td className="px-6 py-4 font-semibold text-slate-900">{row.partnerName || 'Unknown Partner'}</td>
                      <td className="px-6 py-4">
                        <span className="font-medium bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600">{row.contentCount || 0}</span>
                      </td>
                      <td className="px-6 py-4 capitalize text-slate-600">{(row.status || '').replace(/_/g, ' ')}</td>
                      <td className="px-6 py-4 capitalize text-slate-600">{row.royaltyType ? row.royaltyType.replace(/_/g, ' ') : '—'}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.endType === 'perpetuity' ? (
                          <span className="italic text-slate-400">In Perpetuity</span>
                        ) : row.endDate ? (
                          format(parseISO(row.endDate), 'MMM d, yyyy')
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
