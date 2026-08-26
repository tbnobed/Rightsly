import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Link, useLocation, useParams } from "wouter";
import { useGetContract, getGetContractQueryKey, useGetContentContracts, getGetContentContractsQueryKey, useUpdateContract, useDeleteContract, useCreateAmendment, useDeleteAmendment, useRequestUploadUrl, getListContractsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/pages/contracts/index";
import { format, parseISO } from "date-fns";
import { ChevronLeft, Edit, FileText, Globe, Link as LinkIcon, Download, AlertCircle, Plus, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ContractAttachments } from "@/components/contract-attachments";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/lib/upload-file";

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  const { data: contract, isLoading } = useGetContract(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetContractQueryKey(id!),
    }
  });

  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();
  const createAmendment = useCreateAmendment();
  const deleteAmendment = useDeleteAmendment();
  const requestUploadUrl = useRequestUploadUrl();
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const [amendmentDate, setAmendmentDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [amendmentDescription, setAmendmentDescription] = useState("");
  const [amendmentFile, setAmendmentFile] = useState<File | null>(null);

  const resetAmendmentForm = () => {
    setAmendmentDate(format(new Date(), "yyyy-MM-dd"));
    setAmendmentDescription("");
    setAmendmentFile(null);
  };

  const handleAmendmentOpenChange = (open: boolean) => {
    setAmendmentOpen(open);
    if (!open) resetAmendmentForm();
  };

  const handleCreateAmendment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contract || !amendmentDate || !amendmentDescription.trim()) return;
    try {
      let documentUrl: string | undefined;
      if (amendmentFile) {
        const { objectPath } = await uploadFile(requestUploadUrl, amendmentFile);
        documentUrl = objectPath;
      }
      await createAmendment.mutateAsync({
        id: contract.id,
        data: {
          date: amendmentDate,
          description: amendmentDescription.trim(),
          documentUrl,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetContractQueryKey(contract.id) });
      handleAmendmentOpenChange(false);
      toast({ title: "Amendment added", description: "The contract amendment is now recorded." });
    } catch {
      toast({
        title: "Could not add amendment",
        description: "We couldn't upload that file. Please confirm it is an allowed document under 50 MB and try again.",
        variant: "destructive",
      });
    }
  };

  const openAmendmentDocument = async (documentUrl: string) => {
    if (!documentUrl.startsWith("/")) {
      window.open(documentUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const token = localStorage.getItem("auth_token");
    const response = await fetch(`${import.meta.env.BASE_URL}api/storage${documentUrl}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error("Failed to download document");
    const blobUrl = URL.createObjectURL(await response.blob());
    window.open(blobUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  };

  const handleDeleteAmendment = async (amendmentId: string) => {
    if (!contract || !window.confirm("Delete this amendment? This cannot be undone.")) return;
    try {
      await deleteAmendment.mutateAsync({ id: contract.id, amendmentId });
      await queryClient.invalidateQueries({ queryKey: getGetContractQueryKey(contract.id) });
      toast({ title: "Amendment deleted" });
    } catch (err) {
      toast({
        title: "Could not delete amendment",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleArchive = async () => {
    if (!contract) return;
    const nextArchived = !contract.archived;
    if (nextArchived && !window.confirm("Archive this contract? You can restore it later from this page.")) return;
    try {
      await updateContract.mutateAsync({ id: contract.id, data: { archived: nextArchived } });
      queryClient.invalidateQueries({ queryKey: getGetContractQueryKey(contract.id) });
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      toast({
        title: nextArchived ? "Contract archived" : "Contract unarchived",
        description: nextArchived
          ? "This contract has been archived."
          : "This contract has been restored.",
      });
    } catch (err) {
      toast({
        title: "Action failed",
        description: "Could not update the contract. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!contract) return;
    const confirmed = window.confirm(
      `Delete this contract with ${contract.partnerName || "Unknown Partner"}? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await deleteContract.mutateAsync({ id: contract.id });
      await queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      toast({ title: "Contract deleted" });
      setLocation("/contracts");
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete the contract.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div className="p-8 max-w-7xl mx-auto"><Skeleton className="h-12 w-1/3 mb-6" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!contract) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Contract not found</h2>
        <Button variant="outline" asChild>
          <Link href="/contracts">Return to Contracts</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-4 text-slate-500 -ml-3">
            <Link href="/contracts"><ChevronLeft className="w-4 h-4 mr-1" /> Contracts</Link>
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {contract.partnerName || 'Unknown Partner'}
            </h1>
            <StatusBadge status={contract.status} />
            <Badge variant="outline" className={`capitalize font-medium ${contract.direction === 'rights_in' ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-emerald-200 text-emerald-700 bg-emerald-50'}`}>
              {contract.direction.replace('_', ' ')}
            </Badge>
            {contract.archived && (
              <Badge variant="secondary" className="bg-slate-200 text-slate-600 hover:bg-slate-200 uppercase tracking-wider text-[10px]" data-testid="badge-archived">Archived</Badge>
            )}
          </div>
          <p className="text-slate-500 font-mono text-sm">ID: {contract.id}</p>
        </div>
        <div className="flex items-center gap-3">
          {contract.documentUrl && (
            <Button variant="outline" className="bg-white" asChild>
              <a href={contract.documentUrl} target="_blank" rel="noreferrer">
                <Download className="w-4 h-4 mr-2" /> PDF
              </a>
            </Button>
          )}
          {(user?.role === 'admin' || user?.role === 'legal') && (
            <>
              {user?.role === 'admin' && (
                <Button
                  variant="outline"
                  className="bg-white text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleDelete}
                  disabled={deleteContract.isPending}
                  data-testid="button-delete-contract"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              )}
              <Button
                variant="outline"
                className="bg-white"
                onClick={handleToggleArchive}
                disabled={updateContract.isPending}
                data-testid="button-toggle-archive"
              >
                {contract.archived ? (
                  <><ArchiveRestore className="w-4 h-4 mr-2" /> Unarchive</>
                ) : (
                  <><Archive className="w-4 h-4 mr-2" /> Archive</>
                )}
              </Button>
              <Button className="bg-slate-900 text-white hover:bg-slate-800" asChild data-testid="button-edit-contract">
                <Link href={`/contracts/${contract.id}/edit`}>
                  <Edit className="w-4 h-4 mr-2" /> Edit Contract
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className={`grid w-full max-w-xl ${user?.role === "admin" || user?.role === "finance" ? "grid-cols-5" : "grid-cols-4"} bg-slate-200/50 p-1`}>
          <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="content" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Content</TabsTrigger>
          <TabsTrigger value="documents" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Documents</TabsTrigger>
          <TabsTrigger value="amendments" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Amendments</TabsTrigger>
          {(user?.role === "admin" || user?.role === "finance") && <TabsTrigger value="financials" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Financials</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-slate-100 bg-slate-50/80 pb-4">
                  <CardTitle className="text-lg">Terms & Territories</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <dl className="divide-y divide-slate-100">
                    <div className="px-6 py-4 grid grid-cols-3 gap-4">
                      <dt className="text-sm font-medium text-slate-500">Term</dt>
                      <dd className="text-sm text-slate-900 col-span-2 font-medium">
                        {contract.startDate ? format(parseISO(contract.startDate), 'MMM d, yyyy') : 'TBD'} 
                        {' → '} 
                        {contract.endType === 'perpetuity' ? 'In Perpetuity' : contract.endDate ? format(parseISO(contract.endDate), 'MMM d, yyyy') : 'TBD'}
                        {contract.endType === 'auto_renew' && <span className="ml-2 text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-normal">Auto-renews</span>}
                      </dd>
                    </div>
                    <div className="px-6 py-4 grid grid-cols-3 gap-4">
                      <dt className="text-sm font-medium text-slate-500">Department Tags</dt>
                      <dd className="text-sm text-slate-900 col-span-2">{contract.departmentTags?.length ? contract.departmentTags.join(", ") : "None specified"}</dd>
                    </div>
                    {contract.websiteLink && (
                      <div className="px-6 py-4 grid grid-cols-3 gap-4">
                        <dt className="text-sm font-medium text-slate-500">Website</dt>
                        <dd className="text-sm col-span-2"><a href={contract.websiteLink} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-all" data-testid="link-contract-website">{contract.websiteLink}</a></dd>
                      </div>
                    )}
                    <div className="px-6 py-4 grid grid-cols-3 gap-4">
                      <dt className="text-sm font-medium text-slate-500">Parties</dt>
                      <dd className="text-sm text-slate-900 col-span-2">
                        <div className="flex flex-col space-y-1">
                          <span className="font-medium"><span className="text-slate-500 font-normal w-20 inline-block">Licensor:</span> {contract.licensor || 'TBN'}</span>
                          <span className="font-medium"><span className="text-slate-500 font-normal w-20 inline-block">Licensee:</span> {contract.licensee || 'TBN'}</span>
                        </div>
                      </dd>
                    </div>
                    <div className="px-6 py-4 grid grid-cols-3 gap-4 bg-slate-50/30">
                      <dt className="text-sm font-medium text-slate-500 flex items-center gap-1.5"><Globe className="w-4 h-4" /> Territories</dt>
                      <dd className="text-sm text-slate-900 col-span-2">
                        <div className="flex flex-wrap gap-1.5">
                          {contract.territories?.map(t => (
                            <Badge key={t} variant="secondary" className="bg-slate-200 text-slate-700 hover:bg-slate-200">{t}</Badge>
                          )) || <span className="text-slate-400 italic">None specified</span>}
                        </div>
                        {contract.otherTerritories && <p className="mt-2 text-slate-600 text-xs">{contract.otherTerritories}</p>}
                      </dd>
                    </div>
                    <div className="px-6 py-4 grid grid-cols-3 gap-4">
                      <dt className="text-sm font-medium text-slate-500">Distribution</dt>
                      <dd className="text-sm text-slate-900 col-span-2 flex flex-wrap gap-1.5">
                        {contract.distributionTypes?.map(d => (
                          <Badge key={d} variant="outline" className="border-slate-300 text-slate-700">{d}</Badge>
                        )) || <span className="text-slate-400 italic">None specified</span>}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100 bg-slate-50/80 pb-4"><CardTitle className="text-lg">Rights &amp; Terms</CardTitle></CardHeader>
                <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                  <div><span className="block text-slate-500">Platform</span><span className="font-medium">{contract.platform || "Not specified"}</span></div>
                  <div><span className="block text-slate-500">Exclusivity</span><span className="font-medium capitalize">{contract.rightsOutDetails?.exclusivity?.replace("_", " ") || "Not specified"}</span></div>
                  <div><span className="block text-slate-500">Auto-renew</span><span className="font-medium">{contract.rightsOutDetails?.autoRenew ? "Yes" : "No"}</span></div>
                  <div><span className="block text-slate-500">Reporting Frequency</span><span className="font-medium capitalize">{contract.rightsOutDetails?.reportingFrequency || "Not specified"}</span></div>
                  <div><span className="block text-slate-500">Has Amendment</span><span className="font-medium">{contract.rightsOutDetails?.hasAmendment ? "Yes" : "No"}</span></div>
                </CardContent>
              </Card>

              {contract.direction === 'rights_in' && contract.rightsInDetails && (
                <Card className="border-blue-200 shadow-sm overflow-hidden bg-blue-50/10">
                  <CardHeader className="border-b border-blue-100 bg-blue-50/50 pb-4">
                    <CardTitle className="text-lg text-blue-900">Rights In Specifics</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {/* Specific details rendering */}
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-2">Platforms</h4>
                        <div className="flex flex-wrap gap-2">
                          {contract.rightsInDetails.platforms?.map(p => (
                            <Badge key={p} className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-none">{p}</Badge>
                          ))}
                        </div>
                      </div>
                      {contract.rightsInDetails.grantOfRights && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 mb-1">Grant of Rights</h4>
                          <p className="text-sm text-slate-700 bg-white p-3 rounded border border-blue-100">{contract.rightsInDetails.grantOfRights}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div><span className="block text-slate-500">YouTube Channel</span><span className="font-medium">{contract.rightsInDetails.youtubeChannel || "Not specified"}</span></div>
                        <div><span className="block text-slate-500">Social Platforms</span><span className="font-medium">{contract.rightsInDetails.socialPlatforms?.join(", ") || "Not specified"}</span></div>
                        <div><span className="block text-slate-500">Social Handle</span><span className="font-medium">{contract.rightsInDetails.socialHandle || "Not specified"}</span></div>
                        {Object.entries((contract.rightsInDetails as any).socialAccounts ?? {}).map(([platform, account]) => (
                          <div key={platform}><span className="block text-slate-500">{platform} Account</span><span className="font-medium">{String(account)}</span></div>
                        ))}
                        <div><span className="block text-slate-500">Exclusivity</span><span className="font-medium">{contract.rightsInDetails.exclusivitySameAsDuration ? "Same as agreement duration" : [contract.rightsInDetails.exclusivityStartDate, contract.rightsInDetails.exclusivityEndDate].filter(Boolean).join(" – ") || "Not specified"}</span></div>
                      </div>
                      {contract.rightsInDetails.marketingRights && (
                        <div><h4 className="text-sm font-semibold text-slate-900 mb-1">Marketing Rights</h4><p className="text-sm text-slate-700">{contract.rightsInDetails.marketingRights}</p></div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start text-left bg-white" asChild>
                    <Link href={`/royalties?contractId=${contract.id}`}>
                      <Calculator className="w-4 h-4 mr-2 text-slate-400" /> Run Royalty Calc
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start text-left bg-white" asChild>
                    <Link href={`/rights-check`}>
                      <AlertCircle className="w-4 h-4 mr-2 text-slate-400" /> Check Conflicts
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {contract.notes && (
                <Card className="border-amber-200 shadow-sm bg-amber-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-amber-900">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-amber-900/80 whitespace-pre-wrap">{contract.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="content" className="mt-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/80 pb-4">
              <div>
                <CardTitle className="text-lg">Licensed Content</CardTitle>
                <CardDescription>Titles covered by this agreement</CardDescription>
              </div>
              {(user?.role === 'admin' || user?.role === 'legal') && (
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                  <LinkIcon className="w-4 h-4 mr-2" /> Link Content
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {contract.contentItems && contract.contentItems.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {contract.contentItems.map(item => (
                    <li key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-slate-900">{item.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{item.type}</Badge>
                          {item.year && <span className="text-xs text-slate-500">{item.year}</span>}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/content/${item.id}`}>View</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center">
                  <Film className="w-8 h-8 text-slate-300 mb-2" />
                  <p>No content items linked to this contract yet.</p>
                </div>
              )}
              {(contract as any).selectedSeasons?.length > 0 && (
                <div className="border-t border-slate-100 p-4 bg-indigo-50/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 mb-2">Selected season scope</p>
                  <div className="flex flex-wrap gap-2">
                    {(contract as any).selectedSeasons.map((season: any) => (
                      <Badge key={season.id} variant="outline" className="bg-white border-indigo-200 text-indigo-800">
                        Season {season.seasonNumber}{season.title ? ` · ${season.title}` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <ContractAttachments
            contractId={contract.id}
            canEdit={user?.role === 'admin' || user?.role === 'legal'}
          />
        </TabsContent>

        <TabsContent value="amendments" className="mt-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/80 pb-4">
              <CardTitle className="text-lg">Amendments</CardTitle>
              {(user?.role === 'admin' || user?.role === 'legal') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  onClick={() => setAmendmentOpen(true)}
                  data-testid="button-add-amendment"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Amendment
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {contract.amendments && contract.amendments.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {contract.amendments.map(amd => (
                    <li key={amd.id} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-slate-900">{format(parseISO(amd.date), 'MMMM d, yyyy')}</span>
                        <div className="flex items-center gap-3">
                          {amd.documentUrl && (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-blue-600"
                              onClick={() =>
                                openAmendmentDocument(amd.documentUrl!).catch(() =>
                                  toast({ title: "Failed to open document", variant: "destructive" }),
                                )
                              }
                              data-testid={`button-amendment-document-${amd.id}`}
                            >
                              <FileText className="w-3 h-3 mr-1" /> Document
                            </Button>
                          )}
                          {(user?.role === "admin" || user?.role === "legal") && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => handleDeleteAmendment(amd.id)}
                              disabled={deleteAmendment.isPending}
                              aria-label="Delete amendment"
                              data-testid={`button-delete-amendment-${amd.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600">{amd.description}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <p>No amendments recorded for this contract.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {(user?.role === "admin" || user?.role === "finance") && <TabsContent value="financials" className="mt-6">
          <div className="p-8 bg-white border border-slate-200 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-5">Financial Terms</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
              <div><dt className="text-slate-500">Royalty Type</dt><dd className="mt-1 font-medium capitalize">{contract.royaltyType?.replace(/_/g, " ") || "Not specified"}</dd></div>
              <div><dt className="text-slate-500">Minimum Payment Threshold</dt><dd className="mt-1 font-medium">{contract.rightsOutDetails?.minPaymentThreshold != null ? `$${contract.rightsOutDetails.minPaymentThreshold}` : "Not specified"}</dd></div>
              <div><dt className="text-slate-500">Payment Terms</dt><dd className="mt-1 font-medium uppercase">{contract.paymentTerms?.replace("_", " ") || "Not specified"}</dd></div>
              <div><dt className="text-slate-500">Royalty Details</dt><dd className="mt-1 font-medium whitespace-pre-wrap">{contract.royaltyDetails || "Not specified"}</dd></div>
            </dl>
            <div className="mt-4 flex justify-center gap-4">
              <Button asChild variant="outline">
                <Link href={`/royalties?contractId=${contract.id}`}>View Royalties</Link>
              </Button>
            </div>
          </div>
        </TabsContent>}
      </Tabs>

      <Dialog open={amendmentOpen} onOpenChange={handleAmendmentOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateAmendment}>
            <DialogHeader>
              <DialogTitle>Add Amendment</DialogTitle>
              <DialogDescription>Record a dated change to this contract.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-5">
              <div className="space-y-2">
                <Label htmlFor="amendment-date">Effective date</Label>
                <Input
                  id="amendment-date"
                  type="date"
                  value={amendmentDate}
                  onChange={(event) => setAmendmentDate(event.target.value)}
                  required
                  data-testid="input-amendment-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amendment-description">Description</Label>
                <Textarea
                  id="amendment-description"
                  value={amendmentDescription}
                  onChange={(event) => setAmendmentDescription(event.target.value)}
                  placeholder="Describe what changed"
                  rows={4}
                  required
                  data-testid="input-amendment-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amendment-document">Document (optional)</Label>
                <Input
                  id="amendment-document"
                  type="file"
                  accept="application/pdf,.pdf,.doc,.docx"
                  onChange={(event) => setAmendmentFile(event.target.files?.[0] ?? null)}
                  data-testid="input-amendment-document"
                />
                <p className="text-xs text-slate-500">PDF, DOC, or DOCX</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleAmendmentOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAmendment.isPending || requestUploadUrl.isPending || !amendmentDate || !amendmentDescription.trim()}
                data-testid="button-save-amendment"
              >
                {createAmendment.isPending || requestUploadUrl.isPending ? "Adding..." : "Add Amendment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Needed icon imports that were missed above
import { Calculator, Film } from "lucide-react";
