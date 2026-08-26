import { useState } from "react";
import { useGetContent, getGetContentQueryKey, useGetContentContracts, getGetContentContractsQueryKey, useDeleteContent, getListContentQueryKey } from "@workspace/api-client-react";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/pages/contracts/index";
import { ContentFormDialog } from "@/components/content-form-dialog";
import { format, parseISO } from "date-fns";
import { ChevronLeft, Edit, Film, FileText, ChevronRight, Layers, LayoutList, Globe, Sparkles, Captions, Trash2, ShieldCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function formatTitleRight(duration: number | null, term: "months" | "years" | "in_perpetuity" | null, customTerm: string | null) {
  if (term === "in_perpetuity") return "In Perpetuity";
  if (!duration) return "Not specified";
  if (!term) return customTerm ? `${duration} ${customTerm}` : String(duration);
  const label = term === "months" ? "Month" : "Year";
  return `${duration} ${label}${duration === 1 ? "" : "s"}`;
}

export default function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const canEdit = user?.role === "admin" || user?.role === "legal";
  const canDelete = user?.role === "admin";

  const deleteContent = useDeleteContent();

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

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteContent.mutateAsync({ id: content.id });
      queryClient.removeQueries({ queryKey: getGetContentQueryKey(content.id) });
      queryClient.invalidateQueries({ queryKey: getListContentQueryKey() });
      toast({
        title: "Content deleted",
        description: `${content.title} has been removed from the catalog.`,
      });
      setLocation("/content");
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.data?.message || err?.message || "Could not delete content.";
      toast({
        title: "Delete failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

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
                {content.contentSource && (
                  <Badge variant="outline" className={content.contentSource === "tbn" ? "border-amber-200 bg-amber-50 text-amber-800" : "bg-white text-slate-600"} data-testid="badge-content-source">
                    {content.contentSource === "tbn" ? "TBN Content" : "Third-Party Content"}
                  </Badge>
                )}
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
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button className="bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm" onClick={() => setEditOpen(true)} data-testid="button-edit-content">
              <Edit className="w-4 h-4 mr-2" /> {content.type === "TVSeries" ? "Edit Title & Seasons" : "Edit Metadata"}
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" data-testid="button-delete-content">
                  <Trash2 className="w-4 h-4" />
                  <span className="sr-only">Delete {content.title}</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Content</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{content.title}</strong>? This action cannot be undone and will fail if the title is linked to any contract.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700" disabled={isDeleting}>
                    {isDeleting ? "Deleting..." : "Delete Content"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
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
              <div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Content Source</span>
                <p className="text-sm text-slate-700">{content.contentSource === "tbn" ? "TBN Content" : content.contentSource === "third_party" ? "Third-Party Content" : "Not set"}</p>
              </div>
              {content.contentSource === "tbn" && (
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">TBN Media ID</span>
                  <p className="text-sm font-mono text-slate-700" data-testid="text-tbn-media-id">
                    {content.tbnMediaId || "Not assigned at title level"}
                  </p>
                </div>
              )}
              {[
                ["Format", content.mediaFormat],
                ["Genres", content.genres],
                ["Director", content.director],
                ["Actors", content.actors],
                ["Release Date", content.releaseDate ? format(parseISO(content.releaseDate), "MMM d, yyyy") : null],
                ["Rating", content.contentRating],
              ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, value]) => (
                <div key={label}>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">{label}</span>
                  <p className="text-sm whitespace-pre-wrap text-slate-700">{value}</p>
                </div>
              ))}
              {content.notes && (
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Notes</span>
                  <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed" data-testid="text-content-notes">{content.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">
                    {content.catalogInternalId ? "Catalog Internal ID" : "Rightsly ID"}
                  </span>
                  <p className="text-sm font-mono text-slate-700">
                    {content.catalogInternalId || content.id}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Added</span>
                  <p className="text-sm text-slate-700">{format(parseISO(content.createdAt), 'MMM yyyy')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm" data-testid="card-title-rights">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Rights Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
              {[
                ["Broadcast Rights", formatTitleRight(content.broadcastRightsDuration, content.broadcastRightsTerm, content.broadcastRightsCustomTerm)],
                ["Digital Rights", formatTitleRight(content.digitalRightsDuration, content.digitalRightsTerm, content.digitalRightsCustomTerm)],
                ["International Rights", formatTitleRight(content.internationalRightsDuration, content.internationalRightsTerm, content.internationalRightsCustomTerm)],
                ["YouTube Rights", formatTitleRight(content.youtubeRightsDuration, content.youtubeRightsTerm, content.youtubeRightsCustomTerm)],
              ].map(([label, value]) => (
                <div key={label}>
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
                </div>
              ))}
              <div className="sm:col-span-2 rounded-md bg-slate-50 p-3">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">International Broadcast Air Amount</span>
                <p className="mt-1 text-sm font-semibold text-slate-800" data-testid="text-international-air-amount">
                  {content.internationalBroadcastAirAmount ? `${content.internationalBroadcastAirAmount} allowed airing${content.internationalBroadcastAirAmount === 1 ? "" : "s"}` : "Not specified"}
                </p>
              </div>
            </CardContent>
          </Card>

          {content.type === 'TVSeries' && content.seasons && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 flex flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  <CardTitle className="text-lg">Seasons ({content.seasons.length})</CardTitle>
                </div>
                {canEdit && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="button-manage-seasons">
                    <Edit className="w-3.5 h-3.5 mr-1.5" /> Manage Seasons
                  </Button>
                )}
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

      {content.episodes && content.episodes.length > 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LayoutList className="h-5 w-5 text-indigo-500" />
              Episodes ({content.episodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[42rem] overflow-auto p-0">
            <ul className="divide-y divide-slate-100">
              {content.episodes.map((episode) => {
                const season = content.seasons?.find((item) => item.id === episode.seasonId);
                const episodeLabel = episode.episodeNumberText ||
                  (episode.episodeNumber ? String(episode.episodeNumber) : null);
                return (
                  <li key={episode.id} className="space-y-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          {season && <Badge variant="outline">Season {season.seasonNumber}</Badge>}
                          {episodeLabel && <Badge variant="secondary">Episode {episodeLabel}</Badge>}
                          <h3 className="font-semibold text-slate-900">{episode.title || "Untitled episode"}</h3>
                        </div>
                        {episode.internalId && (
                          <p className="mt-1 font-mono text-xs text-slate-500">Catalog ID: {episode.internalId}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {episode.mediaFormat && <Badge variant="outline">{episode.mediaFormat}</Badge>}
                        {episode.contentRating && <Badge variant="outline">{episode.contentRating}</Badge>}
                        {episode.year && <Badge variant="outline">{episode.year}</Badge>}
                      </div>
                    </div>
                    {episode.description && (
                      <p className="text-sm leading-relaxed text-slate-600">{episode.description}</p>
                    )}
                    <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                      {episode.genres && <p><strong className="text-slate-700">Genres:</strong> {episode.genres}</p>}
                      {episode.director && <p><strong className="text-slate-700">Director:</strong> {episode.director}</p>}
                      {episode.actors && <p><strong className="text-slate-700">Actors:</strong> {episode.actors}</p>}
                      {episode.releaseDate && (
                        <p><strong className="text-slate-700">Release:</strong> {format(parseISO(episode.releaseDate), "MMM d, yyyy")}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {canEdit && <ContentFormDialog open={editOpen} onOpenChange={setEditOpen} content={content} />}
    </div>
  );
}
