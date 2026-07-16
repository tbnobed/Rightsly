import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { Link, useLocation, useParams } from "wouter";
import { useGetContract, getGetContractQueryKey, useGetContentContracts, getGetContentContractsQueryKey } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/pages/contracts/index";
import { format, parseISO } from "date-fns";
import { ChevronLeft, Edit, FileText, Globe, Link as LinkIcon, Download, AlertCircle, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ContractAttachments } from "@/components/contract-attachments";

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  
  const { data: contract, isLoading } = useGetContract(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetContractQueryKey(id!),
    }
  });

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
            <Button className="bg-slate-900 text-white hover:bg-slate-800" data-testid="button-edit-contract">
              <Edit className="w-4 h-4 mr-2" /> Edit Contract
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-5 bg-slate-200/50 p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="content" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Content</TabsTrigger>
          <TabsTrigger value="documents" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Documents</TabsTrigger>
          <TabsTrigger value="amendments" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Amendments</TabsTrigger>
          <TabsTrigger value="financials" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Financials</TabsTrigger>
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
                <Button size="sm" variant="outline" className="bg-white">
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
                        {amd.documentUrl && (
                          <a href={amd.documentUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-sm flex items-center">
                            <FileText className="w-3 h-3 mr-1" /> Document
                          </a>
                        )}
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
        
        <TabsContent value="financials" className="mt-6">
          {/* Financial details here */}
          <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-lg shadow-sm">
            <p>Financial details tab selected. Use the Revenue Reports or Royalties section to manage money.</p>
            <div className="mt-4 flex justify-center gap-4">
              <Button asChild variant="outline">
                <Link href={`/royalties?contractId=${contract.id}`}>View Royalties</Link>
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Needed icon imports that were missed above
import { Calculator, Film } from "lucide-react";
