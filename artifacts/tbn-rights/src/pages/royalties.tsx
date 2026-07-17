import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useListContracts, getListContractsQueryKey, useGetRoyaltyCalc, getGetRoyaltyCalcQueryKey, useApproveRoyalty } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { Calculator, DollarSign, CheckCircle, FileText, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Royalties() {
  const { user } = useAuth();
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialContractId = searchParams.get('contractId') || undefined;
  
  const [selectedContractId, setSelectedContractId] = useState<string | undefined>(initialContractId);
  const { toast } = useToast();

  const contractsParams = { pageSize: 100 }; // Get many for dropdown
  const { data: contractsData } = useListContracts(contractsParams, {
    query: {
      queryKey: getListContractsQueryKey(contractsParams),
    }
  });
  
  // Filter for contracts that actually have royalties (often rights_out, or revenue_share)
  const royaltyContracts = contractsData?.data?.filter(c => c.royaltyType === 'revenue_share' || c.direction === 'rights_out') || [];

  const { data: calcResult, isLoading: isCalcLoading, refetch } = useGetRoyaltyCalc(selectedContractId!, {
    query: {
      enabled: !!selectedContractId,
      queryKey: getGetRoyaltyCalcQueryKey(selectedContractId!),
    }
  });

  const approveMutation = useApproveRoyalty();

  const handleApprove = async (reportId: string) => {
    if (!selectedContractId) return;
    try {
      await approveMutation.mutateAsync({ 
        contractId: selectedContractId, 
        data: { reportId, status: 'approved' } 
      });
      toast({ title: "Royalty Approved", description: "The calculation has been marked as approved." });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Could not approve the royalty." });
    }
  };

  if (user?.role !== 'admin' && user?.role !== 'finance') {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2">Only Finance and Admin roles can access the royalty calculator.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Royalty Calculator</h1>
          <p className="text-slate-500 mt-1">Compute revenue shares and review financial statements.</p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-6">
          <div className="max-w-md space-y-4">
            <label className="text-sm font-semibold text-slate-900">Select Contract</label>
            <Select value={selectedContractId} onValueChange={setSelectedContractId}>
              <SelectTrigger className="bg-slate-50" data-testid="select-royalty-contract">
                <SelectValue placeholder="Choose a contract to calculate..." />
              </SelectTrigger>
              <SelectContent>
                {royaltyContracts.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.partnerName} - {c.id.slice(0,6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedContractId && (
        isCalcLoading ? (
          <div className="p-12 text-center text-slate-500">Calculating royalties...</div>
        ) : calcResult ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-slate-900 text-white border-none shadow-md">
                <CardContent className="p-6">
                  <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">Partner</p>
                  <p className="text-xl font-bold">{calcResult.partnerName}</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <p className="text-slate-500 text-sm font-medium uppercase tracking-wider mb-1">Agreement Type</p>
                  <p className="text-xl font-bold text-slate-900 capitalize">{calcResult.royaltyType?.replace('_', ' ') || 'Standard'}</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 border-amber-200 shadow-sm">
                <CardContent className="p-6">
                  <p className="text-amber-700 text-sm font-medium uppercase tracking-wider mb-1">Details</p>
                  <p className="text-lg font-bold text-amber-900">{calcResult.royaltyDetails || 'N/A'}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Period Calculations</CardTitle>
                <Button size="sm" variant="outline" className="bg-white">
                  <FileText className="w-4 h-4 mr-2" /> Export CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 font-medium">Period</th>
                      <th className="px-6 py-4 font-medium text-right">Revenue</th>
                      <th className="px-6 py-4 font-medium text-right">Share %</th>
                      <th className="px-6 py-4 font-medium text-right text-amber-700">Amount Owed</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {calcResult.calculations.map((calc, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-medium text-slate-900">{calc.period}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-600">
                          {calc.revenueAmount !== null ? `$${calc.revenueAmount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-600">
                          {calc.sharePercentage !== null ? `${calc.sharePercentage}%` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900 font-mono">
                          {calc.amountOwed !== null ? `$${calc.amountOwed.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={calc.reviewStatus === 'approved' ? 'default' : 'secondary'} 
                            className={calc.reviewStatus === 'approved' ? 'bg-emerald-500 hover:bg-emerald-600 border-none' : ''}>
                            {calc.reviewStatus}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {calc.reviewStatus === 'pending' && (
                            <Button size="sm" className="bg-slate-900 text-white" onClick={() => handleApprove(calc.reportId)}>
                              Approve
                            </Button>
                          )}
                          {calc.reviewStatus === 'approved' && (
                            <span className="text-xs text-slate-400 flex items-center justify-end">
                              <CheckCircle className="w-3 h-3 mr-1 text-emerald-500" /> Approved
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {calcResult.calculations.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                          No revenue reports found for this contract to calculate.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500">No data available for this contract.</div>
        )
      )}
    </div>
  );
}
