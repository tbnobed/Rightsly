import { useState } from "react";
import { useListContent, getListContentQueryKey, ListContentType } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Film, Tv, PlaySquare, MonitorPlay, ChevronRight, Sparkles, Captions } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { ContentFormDialog } from "@/components/content-form-dialog";

export default function ContentList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [type, setType] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  const params = {
    search: debouncedSearch || undefined,
    type: type !== "all" ? type as ListContentType : undefined,
  };
  const { data: result, isLoading } = useListContent(params, {
    query: {
      queryKey: getListContentQueryKey(params),
    }
  });

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
        <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={() => setAddOpen(true)} data-testid="button-add-content">
          <Plus className="w-4 h-4 mr-2" />
          Add Title
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 bg-slate-50/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search titles..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-slate-200"
            />
          </div>
          <Select value={type} onValueChange={setType}>
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-medium">Title</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Year</th>
                <th className="px-6 py-4 font-medium">Active Contracts</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading catalog...</td></tr>
              ) : !result?.data || result.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
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
      </Card>

      <ContentFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
