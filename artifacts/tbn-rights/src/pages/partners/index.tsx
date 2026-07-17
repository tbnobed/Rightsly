import { useListPartners, getListPartnersQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Briefcase, ChevronRight, Globe, LayoutGrid, List } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import { PartnerFormDialog } from "@/components/partner-form-dialog";

export default function PartnersList() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [, navigate] = useLocation();
  const [view, setView] = useState<"grid" | "list">(
    () => (localStorage.getItem("partners_view") === "list" ? "list" : "grid")
  );
  const changeView = (v: "grid" | "list") => {
    setView(v);
    localStorage.setItem("partners_view", v);
  };
  const debouncedSearch = useDebounce(search, 300);

  const params = { search: debouncedSearch || undefined };
  const { data: result, isLoading } = useListPartners(params, {
    query: {
      queryKey: getListPartnersQueryKey(params),
    }
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Partners</h1>
          <p className="text-slate-500 mt-1">Manage licensors and licensees.</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={() => setAddOpen(true)} data-testid="button-add-partner">
          <Plus className="w-4 h-4 mr-2" />
          Add Partner
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search partners..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-slate-200"
            />
          </div>
          <div className="ml-auto flex items-center rounded-md border border-slate-200 bg-white p-0.5">
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

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Loading partners...</div>
        ) : !result?.data || result.data.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center">
            <Briefcase className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No partners found</p>
          </div>
        ) : view === "list" ? (
          <table className="w-full text-sm text-left" data-testid="table-partners">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-100">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Website</th>
                <th className="px-6 py-3 font-medium text-right">Contracts</th>
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
                      <span className="text-slate-600"><strong className="text-slate-900">{partner.contractCount || 0}</strong> Contracts</span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>
        )}
      </Card>

      <PartnerFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
