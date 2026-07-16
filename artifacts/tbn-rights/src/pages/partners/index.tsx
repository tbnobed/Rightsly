import { useListPartners, getListPartnersQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Briefcase, ChevronRight, Globe } from "lucide-react";
import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";

export default function PartnersList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data: result, isLoading } = useListPartners({
    query: {
      queryKey: getListPartnersQueryKey({ search: debouncedSearch || undefined }),
    }
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Partners</h1>
          <p className="text-slate-500 mt-1">Manage licensors and licensees.</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white" data-testid="button-add-partner">
          <Plus className="w-4 h-4 mr-2" />
          Add Partner
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search partners..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-slate-200"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {isLoading ? (
            <div className="col-span-full py-12 text-center text-slate-500">Loading partners...</div>
          ) : !result?.data || result.data.length === 0 ? (
            <div className="col-span-full py-12 text-center flex flex-col items-center">
              <Briefcase className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No partners found</p>
            </div>
          ) : (
            result.data.map((partner) => (
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
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
