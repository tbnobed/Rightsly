import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useListContracts, getListContractsQueryKey, useRequestUploadUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, FileText, Paperclip, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/upload-file";

function formatCurrency(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Report = {
  id: string; period: string; expectedDate: string | null; receivedDate: string | null;
  amountReceived: number | null; costAmount: number | null; status: "expected" | "received" | "overdue";
  documentPath: string | null; documentName: string | null; reviewStatus: "pending" | "reviewed" | "approved";
  reviewedBy: string | null; reviewedAt: string | null;
};
type ReportForm = Omit<Report, "id" | "documentPath" | "documentName" | "reviewStatus" | "reviewedBy" | "reviewedAt">;
const emptyForm: ReportForm = { period: "", expectedDate: null, receivedDate: null, amountReceived: null, costAmount: null, status: "expected" };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(`/api${url}`, {
    ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message || body?.error || "Request failed"); }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export default function Royalties() {
  const { user } = useAuth();
  const { toast } = useToast();
  const initialContractId = new URLSearchParams(window.location.search).get("contractId") || "";
  const [selectedContractId, setSelectedContractId] = useState(initialContractId);
  const [reports, setReports] = useState<Report[]>([]);
  const [form, setForm] = useState<ReportForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingReportId, setPendingReportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestUploadUrl = useRequestUploadUrl();
  const contractsParams = { pageSize: 100 };
  const { data: contractsData } = useListContracts(contractsParams, { query: { queryKey: getListContractsQueryKey(contractsParams) } });
  const contracts = contractsData?.data ?? [];

  const load = async () => {
    if (!selectedContractId) { setReports([]); return; }
    setLoading(true);
    try {
      const data = await api<{ reports: Report[] }>(`/royalties/${selectedContractId}`);
      setReports(data.reports ?? []);
    } catch (error) { toast({ variant: "destructive", title: "Could not load reports", description: error instanceof Error ? error.message : undefined }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [selectedContractId]);

  const setField = <K extends keyof ReportForm>(key: K, value: ReportForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedContractId) return;
    setSaving(true);
    try {
      const body = { ...form, period: form.period.trim(), expectedDate: form.expectedDate || null, receivedDate: form.receivedDate || null };
      await api(editingId ? `/revenue-reports/${editingId}` : `/contracts/${selectedContractId}/revenue-reports`, {
        method: editingId ? "PUT" : "POST", body: JSON.stringify(body),
      });
      toast({ title: editingId ? "Report updated" : "Report created", description: "The report is now awaiting review." });
      setForm(emptyForm); setEditingId(null); await load();
    } catch (error) { toast({ variant: "destructive", title: "Could not save report", description: error instanceof Error ? error.message : undefined }); }
    finally { setSaving(false); }
  };
  const edit = (report: Report) => {
    setEditingId(report.id);
    setForm({ period: report.period, expectedDate: report.expectedDate, receivedDate: report.receivedDate, amountReceived: report.amountReceived, costAmount: report.costAmount, status: report.status });
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this revenue report?")) return;
    try { await api(`/revenue-reports/${id}`, { method: "DELETE" }); toast({ title: "Report deleted" }); await load(); }
    catch (error) { toast({ variant: "destructive", title: "Could not delete report", description: error instanceof Error ? error.message : undefined }); }
  };
  const review = async (reportId: string, status: "reviewed" | "approved") => {
    try { await api(`/royalties/${selectedContractId}/approve`, { method: "POST", body: JSON.stringify({ reportId, status }) }); toast({ title: status === "approved" ? "Report approved" : "Report marked reviewed" }); await load(); }
    catch (error) { toast({ variant: "destructive", title: "Could not update review", description: error instanceof Error ? error.message : undefined }); }
  };
  const upload = async (file: File) => {
    if (!pendingReportId) return;
    try {
      const { objectPath } = await uploadFile(requestUploadUrl, file);
      await api(`/revenue-reports/${pendingReportId}`, { method: "PUT", body: JSON.stringify({ documentPath: objectPath, documentName: file.name }) });
      toast({ title: "Document attached", description: file.name }); await load();
    } catch { toast({ variant: "destructive", title: "Upload failed", description: "We couldn't upload that file. Please confirm it is an allowed document under 50 MB and try again." }); }
    finally { setPendingReportId(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };
  const download = async (report: Report) => {
    if (!report.documentPath) return;
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/storage${report.documentPath}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!response.ok) throw new Error("Download failed");
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = report.documentName || "revenue-report"; anchor.click(); URL.revokeObjectURL(url);
    } catch { toast({ variant: "destructive", title: "Could not download document" }); }
  };

  if (user?.role !== "admin" && user?.role !== "finance") return <div className="p-12 text-center"><AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" /><h2 className="text-2xl font-bold">Access Denied</h2><p className="text-slate-500 mt-2">Only Finance and Admin roles can manage revenue reports.</p></div>;
  return <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
    <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />
    <div><h1 className="text-3xl font-bold tracking-tight">Revenue Reports</h1><p className="text-slate-500 mt-1">Record received revenue and costs, then complete the review workflow.</p></div>
    <Card><CardContent className="p-6 max-w-md"><Label>Contract</Label><Select value={selectedContractId} onValueChange={setSelectedContractId}><SelectTrigger className="mt-2"><SelectValue placeholder="Choose a contract" /></SelectTrigger><SelectContent>{contracts.map((contract) => <SelectItem key={contract.id} value={contract.id}>{contract.partnerName || contract.id}</SelectItem>)}</SelectContent></Select></CardContent></Card>
    {selectedContractId && <><Card><CardHeader><CardTitle>{editingId ? "Edit report" : "New report"}</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div><Label>Period</Label><Input required value={form.period} onChange={(event) => setField("period", event.target.value)} placeholder="2025 Q1" /></div>
      <div><Label>Amount received</Label><Input type="number" min="0" step="0.01" value={form.amountReceived ?? ""} onChange={(event) => setField("amountReceived", event.target.value === "" ? null : Number(event.target.value))} /></div>
      <div><Label>Cost amount</Label><Input type="number" min="0" step="0.01" value={form.costAmount ?? ""} onChange={(event) => setField("costAmount", event.target.value === "" ? null : Number(event.target.value))} /></div>
      <div><Label>Expected date</Label><Input type="date" value={form.expectedDate ?? ""} onChange={(event) => setField("expectedDate", event.target.value || null)} /></div>
      <div><Label>Received date</Label><Input type="date" value={form.receivedDate ?? ""} onChange={(event) => setField("receivedDate", event.target.value || null)} /></div>
      <div><Label>Status</Label><Select value={form.status} onValueChange={(value) => setField("status", value as ReportForm["status"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expected">Expected</SelectItem><SelectItem value="received">Received</SelectItem><SelectItem value="overdue">Overdue</SelectItem></SelectContent></Select></div>
      <div className="md:col-span-3 flex gap-2"><Button disabled={saving}>{editingId ? "Save changes" : "Create report"}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</Button>}</div>
    </form></CardContent></Card>
    <Card><CardHeader><CardTitle>Reports and approvals</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-4">Period</th><th className="p-4 text-right">Received</th><th className="p-4 text-right">Costs</th><th className="p-4">Review</th><th className="p-4">Document</th><th className="p-4" /></tr></thead><tbody>
      {reports.map((report) => <tr key={report.id} className="border-t"><td className="p-4">{report.period}<div className="text-xs text-slate-500">{report.status}</div></td><td className="p-4 text-right">{report.amountReceived == null ? "—" : formatCurrency(report.amountReceived)}</td><td className="p-4 text-right">{report.costAmount == null ? "—" : formatCurrency(report.costAmount)}</td><td className="p-4"><Badge>{report.reviewStatus}</Badge><div className="mt-2 flex gap-1">{report.reviewStatus === "pending" && <Button size="sm" variant="outline" onClick={() => void review(report.id, "reviewed")}>Mark reviewed</Button>}{report.reviewStatus !== "approved" && <Button size="sm" onClick={() => void review(report.id, "approved")}><CheckCircle className="w-3 h-3 mr-1" />Approve</Button>}</div></td><td className="p-4"><div className="flex gap-1">{report.documentPath && <Button variant="ghost" size="sm" onClick={() => void download(report)}><FileText className="w-4 h-4" /></Button>}<Button variant="ghost" size="sm" onClick={() => { setPendingReportId(report.id); fileInputRef.current?.click(); }} disabled={requestUploadUrl.isPending}><Paperclip className="w-4 h-4" /></Button></div></td><td className="p-4 text-right"><Button variant="ghost" size="sm" onClick={() => edit(report)}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="sm" onClick={() => void remove(report.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button></td></tr>)}
      {!loading && reports.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-500">No reports yet. Create the first report above.</td></tr>}
    </tbody></table></div></CardContent></Card></>}
  </div>;
}