import { useState } from "react";
import { useListContracts, getListContractsQueryKey, ContractListItemDirection, ContractListItemStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from "date-fns";
import { Search, Plus, FileText, Filter, ChevronRight, Download } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

export default function ContractsList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [contentSearch, setContentSearch] = useState("");
  const debouncedContentSearch = useDebounce(contentSearch, 300);
  const [direction, setDirection] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [departmentTag, setDepartmentTag] = useState<string>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  
  const params = {
    search: debouncedSearch || undefined,
    contentSearch: debouncedContentSearch || undefined,
    direction: direction !== "all" ? direction as ContractListItemDirection : undefined,
    status: status !== "all" ? status as ContractListItemStatus : undefined,
    departmentTag: departmentTag !== "all" ? departmentTag : undefined,
    includeArchived: includeArchived || undefined,
  };
  const { data: result, isLoading } = useListContracts(params, {
    query: {
      queryKey: getListContractsQueryKey(params),
    }
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contracts</h1>
          <p className="text-slate-500 mt-1">Manage and track all licensing agreements.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white border-none" data-testid="button-new-contract">
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
                placeholder="Search by partner, territories..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white border-slate-200"
                data-testid="input-search-contracts"
              />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search by content title..." 
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
                className="pl-9 bg-white border-slate-200"
                data-testid="input-search-content"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="w-[140px] bg-white border-slate-200" data-testid="select-direction">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="rights_in">Rights In</SelectItem>
                  <SelectItem value="rights_out">Rights Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px] bg-white border-slate-200" data-testid="select-status">
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
            <Select value={departmentTag} onValueChange={setDepartmentTag}>
              <SelectTrigger className="w-[160px] bg-white border-slate-200" data-testid="select-department-tag">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="Acquisition">Acquisition</SelectItem>
                <SelectItem value="Distribution">Distribution</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none ml-auto">
              <Checkbox
                checked={includeArchived}
                onCheckedChange={(v) => setIncludeArchived(v === true)}
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
                <th className="px-6 py-4 font-medium">Partner / ID</th>
                <th className="px-6 py-4 font-medium">Licensor</th>
                <th className="px-6 py-4 font-medium">Direction</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Territories</th>
                <th className="px-6 py-4 font-medium">Content</th>
                <th className="px-6 py-4 font-medium">End Date</th>
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
                  <tr key={contract.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900">{contract.partnerName || 'Unknown Partner'}</div>
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
                      <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/contracts/${contract.id}`}>
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
        
        {result && result.total > result.pageSize && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-sm text-slate-500">
            <span>Showing {result.data.length} of {result.total} results</span>
            {/* Pagination would go here */}
          </div>
        )}
      </Card>
    </div>
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
