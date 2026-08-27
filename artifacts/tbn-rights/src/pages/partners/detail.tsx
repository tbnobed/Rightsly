import { useGetPartner, getGetPartnerQueryKey, useListContracts, getListContractsQueryKey, useDeletePartner, getListPartnersQueryKey } from "@workspace/api-client-react";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/pages/contracts/index";
import { format, parseISO } from "date-fns";
import { ChevronLeft, Edit, Globe, FileText, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { PartnerFormDialog } from "@/components/partner-form-dialog";
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

export default function PartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const canEdit = user?.role === "admin" || user?.role === "content_admin" || user?.role === "legal";
  const canDelete = user?.role === "admin" || user?.role === "content_admin";

  const deletePartner = useDeletePartner();

  const { data: partner, isLoading } = useGetPartner(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetPartnerQueryKey(id!),
    }
  });

  const contractsParams = { partnerId: id! };
  const { data: contractsData, isLoading: isLoadingContracts } = useListContracts(contractsParams, {
    query: {
      enabled: !!id,
      queryKey: getListContractsQueryKey(contractsParams),
    }
  });

  if (isLoading) {
    return <div className="p-4 sm:p-8 max-w-5xl mx-auto"><Skeleton className="h-12 w-1/3 mb-6" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!partner) return null;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deletePartner.mutateAsync({ id: partner.id });
      queryClient.removeQueries({ queryKey: getGetPartnerQueryKey(partner.id) });
      queryClient.invalidateQueries({ queryKey: getListPartnersQueryKey() });
      toast({
        title: "Partner deleted",
        description: `${partner.name} has been removed.`,
      });
      setLocation("/partners");
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.data?.message || err?.message || "Could not delete partner.";
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
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-4 text-slate-500 -ml-3">
            <Link href="/partners"><ChevronLeft className="w-4 h-4 mr-1" /> Partners</Link>
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {partner.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{partner.name}</h1>
              <Badge variant="outline" className={`mt-1 ${partner.type === 'Licensor' ? 'border-blue-200 text-blue-700 bg-blue-50' : partner.type === 'Licensee' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-purple-200 text-purple-700 bg-purple-50'}`}>
                {partner.type}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button className="bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm" onClick={() => setEditOpen(true)} data-testid="button-edit-partner">
              <Edit className="w-4 h-4 mr-2" /> Edit Details
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" data-testid="button-delete-partner">
                  <Trash2 className="w-4 h-4" />
                  <span className="sr-only">Delete {partner.name}</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Partner</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{partner.name}</strong>? This action cannot be undone and will fail if the partner is linked to any contracts.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700" disabled={isDeleting}>
                    {isDeleting ? "Deleting..." : "Delete Partner"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {canEdit && <PartnerFormDialog open={editOpen} onOpenChange={setEditOpen} partner={partner} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1 border-slate-200 shadow-sm h-fit">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-lg">Partner Profile</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {partner.website && (
              <div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Website</span>
                <a href={partner.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center text-sm">
                  <Globe className="w-4 h-4 mr-1.5" /> {partner.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Internal Notes</span>
              <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-md border border-slate-100">
                {partner.notes || <span className="text-slate-400 italic">No notes added.</span>}
              </p>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Added</span>
              <p className="text-sm text-slate-700">{format(parseISO(partner.createdAt), 'MMMM d, yyyy')}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-lg flex items-center">
              <FileText className="w-5 h-5 mr-2 text-amber-500" />
              Contracts
              <Badge variant="outline" className="ml-2 border-emerald-200 bg-emerald-50 text-emerald-700">
                {partner.contractCount || 0} active
              </Badge>
            </CardTitle>
            <Button size="sm" asChild className="bg-slate-900 text-white hover:bg-slate-800">
              <Link href={`/contracts/new?partnerId=${partner.id}`}>New Contract</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingContracts ? (
              <div className="p-8 text-center text-slate-500">Loading contracts...</div>
            ) : contractsData?.data && contractsData.data.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {contractsData.data.map(contract => (
                  <li key={contract.id} className="hover:bg-slate-50/80 transition-colors">
                    <Link href={`/contracts/${contract.id}`} className="flex items-center justify-between p-4 block w-full">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] uppercase h-5">{contract.direction.replace('_', ' ')}</Badge>
                          <StatusBadge status={contract.status} />
                        </div>
                        <p className="text-sm font-medium text-slate-900 mt-1">
                          {contract.territories?.slice(0, 2).join(', ') || 'Global'}
                          {contract.endType === 'perpetuity' ? ' • In Perpetuity' : contract.endDate ? ` • Ends ${format(parseISO(contract.endDate), 'MMM yyyy')}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <FileText className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-slate-500 font-medium">No contracts found</p>
                <p className="text-slate-400 text-sm mt-1">This partner has no associated contracts.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
