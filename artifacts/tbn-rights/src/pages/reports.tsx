import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetContractReport, useGetExpiringReport, useGetRoyaltyReport } from "@workspace/api-client-react";
import { FileDown, FileText, CalendarClock, DollarSign, Download, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Reports() {
  const { toast } = useToast();

  const handleExport = async (type: string, format: string) => {
    // In a real app, this would trigger the hook with the correct format 
    // to download the file blob. For the UI, we simulate it.
    toast({
      title: "Export Started",
      description: `Generating ${type} report as ${format.toUpperCase()}...`,
    });
    
    // Simulate delay
    setTimeout(() => {
      toast({
        title: "Export Complete",
        description: "Your file is ready to download.",
        variant: "default",
      });
    }, 1500);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports Hub</h1>
        <p className="text-slate-500 mt-1">Generate and export system data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Contract Summaries */}
        <Card className="border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
              <FileText className="w-5 h-5 text-blue-700" />
            </div>
            <CardTitle>Contract Summaries</CardTitle>
            <CardDescription>Full listing of active agreements with key terms.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Direction Filter</label>
              <Select defaultValue="all">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="rights_in">Rights In Only</SelectItem>
                  <SelectItem value="rights_out">Rights Out Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Status Filter</label>
              <Select defaultValue="active">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="pt-4 flex gap-3">
              <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-800" onClick={() => handleExport('contracts', 'xlsx')}>
                <FileDown className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button variant="outline" className="flex-1 bg-white" onClick={() => handleExport('contracts', 'pdf')}>
                <Download className="w-4 h-4 mr-2" /> PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card className="border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-3">
              <CalendarClock className="w-5 h-5 text-amber-700" />
            </div>
            <CardTitle>Expiring Soon</CardTitle>
            <CardDescription>Upcoming renewals and terminations.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Timeframe</label>
              <Select defaultValue="90">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Next 30 Days</SelectItem>
                  <SelectItem value="60">Next 60 Days</SelectItem>
                  <SelectItem value="90">Next 90 Days</SelectItem>
                  <SelectItem value="180">Next 180 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="h-16"></div> {/* Spacer to align buttons */}
            
            <div className="pt-4 flex gap-3">
              <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-800" onClick={() => handleExport('expiring', 'xlsx')}>
                <FileDown className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button variant="outline" className="flex-1 bg-white" onClick={() => handleExport('expiring', 'pdf')}>
                <Download className="w-4 h-4 mr-2" /> PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Royalty Statements */}
        <Card className="border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-3">
              <DollarSign className="w-5 h-5 text-emerald-700" />
            </div>
            <CardTitle>Royalty Statements</CardTitle>
            <CardDescription>Calculated owed amounts per period.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Period</label>
              <Select defaultValue="q1_2023">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="q3_2023">Q3 2023</SelectItem>
                  <SelectItem value="q2_2023">Q2 2023</SelectItem>
                  <SelectItem value="q1_2023">Q1 2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
              <Select defaultValue="approved">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="approved">Approved Only</SelectItem>
                  <SelectItem value="pending">Pending Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="pt-4 flex gap-3">
              <Button className="flex-1 bg-slate-900 text-white hover:bg-slate-800" onClick={() => handleExport('royalties', 'xlsx')}>
                <FileDown className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button variant="outline" className="flex-1 bg-white" onClick={() => handleExport('royalties', 'pdf')}>
                <Download className="w-4 h-4 mr-2" /> PDF
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
