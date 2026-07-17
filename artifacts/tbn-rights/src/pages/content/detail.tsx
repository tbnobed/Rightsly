import { useState } from "react";
import { useGetContent, getGetContentQueryKey, useGetContentContracts, getGetContentContractsQueryKey } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/pages/contracts/index";
import { ContentFormDialog } from "@/components/content-form-dialog";
import { format, parseISO } from "date-fns";
import { ChevronLeft, Edit, Film, FileText, ChevronRight, Layers, LayoutList, Globe, Sparkles, Captions } from "lucide-react";

export default function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);

  const { data: content, isLoading } = useGetContent(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetContentQueryKey(id!),
    }
  });

  const { data: contracts, isLoading: isLoadingContracts } = useGetContentContracts(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetContentContractsQueryKey(id!),
    }
  });

  if (isLoading) {
    return <div className="p-8 max-w-6xl mx-auto"><Skeleton className="h-12 w-1/3 mb-6" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!content) return null;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-4 text-slate-500 -ml-3">
            <Link href="/content"><ChevronLeft className="w-4 h-4 mr-1" /> Catalog</Link>
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{content.title}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="bg-white">{content.type.replace(/_/g, ' ')}</Badge>
                {content.year && <span className="text-sm font-medium text-slate-500">{content.year}</span>}
                {content.hasCleans && (
                  <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[10px] gap-1" data-testid="badge-cleans">
                    <Sparkles className="w-3 h-3" /> Cleans
                  </Badge>
                )}
                {content.hasCaptions && (
                  <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px] gap-1" data-testid="badge-captions">
                    <Captions className="w-3 h-3" /> Captions
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <Button className="bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm" onClick={() => setEditOpen(true)} data-testid="button-edit-content">
          <Edit className="w-4 h-4 mr-2" /> Edit Metadata
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
              <CardTitle className="text-lg">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {content.description && (
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Synopsis</span>
                  <p className="text-sm text-slate-700 leading-relaxed">{content.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Internal ID</span>
                  <p className="text-sm font-mono text-slate-700">{content.id.split('-')[0]}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Added</span>
                  <p className="text-sm text-slate-700">{format(parseISO(content.createdAt), 'MMM yyyy')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {content.type === 'TVSeries' && content.seasons && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 flex flex-row items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" />
                <CardTitle className="text-lg">Seasons ({content.seasons.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100">
                  {content.seasons.map(season => (
                    <li key={season.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <span className="font-semibold text-slate-900">Season {season.seasonNumber}</span>
                        {season.title && <span className="ml-2 text-sm text-slate-500">{season.title}</span>}
                      </div>
                      <Badge variant="outline" className="text-xs">{season.episodeCount || '?'} eps</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2 border-slate-200 shadow-sm h-fit">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-lg flex items-center">
              <FileText className="w-5 h-5 mr-2 text-amber-500" />
              Linked Contracts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingContracts ? (
              <div className="p-8 text-center text-slate-500">Loading contracts...</div>
            ) : contracts && contracts.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {contracts.map(contract => (
                  <li key={contract.id} className="hover:bg-slate-50/80 transition-colors">
                    <Link href={`/contracts/${contract.id}`} className="flex items-center justify-between p-4 block w-full">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-900">{contract.partnerName || 'Unknown Partner'}</span>
                          <Badge variant="outline" className={`text-[10px] uppercase h-5 ${contract.direction === 'rights_in' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {contract.direction.replace('_', ' ')}
                          </Badge>
                          <StatusBadge status={contract.status} />
                        </div>
                        <div className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center"><Globe className="w-3.5 h-3.5 mr-1" /> {contract.territories?.slice(0, 2).join(', ') || 'Global'}</span>
                          <span className="flex items-center"><LayoutList className="w-3.5 h-3.5 mr-1" /> {contract.distributionTypes?.slice(0, 2).join(', ') || 'All'}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <FileText className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-slate-500 font-medium">No active rights found</p>
                <p className="text-slate-400 text-sm mt-1">This title is not currently attached to any contracts.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ContentFormDialog open={editOpen} onOpenChange={setEditOpen} content={content} />
    </div>
  );
}
