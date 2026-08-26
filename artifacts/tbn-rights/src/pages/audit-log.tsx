import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { AlertCircle, History, Clock, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuditLog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [action, setAction] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  
  const params = {
    action: action !== "all" ? action : undefined,
    entityType: entityType !== "all" ? entityType : undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const { data: result, isLoading } = useListAuditLogs(params, {
    query: {
      queryKey: getListAuditLogsQueryKey(params),
    }
  });
  const auditEntries = typeof result === "string" ? [] : result?.data ?? [];

  if (user?.role !== 'admin') {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2">Only administrators can access the audit log.</p>
      </div>
    );
  }

  const getActionColor = (a: string) => {
    switch (a) {
      case 'create': return 'bg-emerald-100 text-emerald-800';
      case 'update': return 'bg-blue-100 text-blue-800';
      case 'delete': return 'bg-red-100 text-red-800';
      case 'status_change': return 'bg-amber-100 text-amber-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const exportCsv = async () => {
    try {
      const query = new URLSearchParams({ format: "csv" });
      if (params.action) query.set("action", params.action);
      if (params.entityType) query.set("entityType", params.entityType);
      if (params.from) query.set("from", params.from);
      if (params.to) query.set("to", params.to);
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${import.meta.env.BASE_URL}api/audit-logs?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error(response.status === 403 ? "You don't have permission to export audit logs." : `Export failed (HTTP ${response.status}).`);
      const blob = await response.blob();
      const filename = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ?? "audit-log.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: filename });
    } catch (error) {
      toast({ title: "Export failed", description: error instanceof Error ? error.message : "Unexpected error.", variant: "destructive" });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Audit Log</h1>
          <p className="text-slate-500 mt-1">Immutable record of system changes.</p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/50">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200">
              <SelectValue placeholder="Action Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="status_change">Status Change</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="logout">Logout</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200" data-testid="select-audit-entity-type">
              <SelectValue placeholder="Entity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
              <SelectItem value="content">Content</SelectItem>
              <SelectItem value="revenue_report">Revenue Report</SelectItem>
            </SelectContent>
          </Select>
          <label className="text-xs text-slate-500">
            From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="ml-2 h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" data-testid="input-audit-from" />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="ml-2 h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" data-testid="input-audit-to" />
          </label>
          <Button variant="outline" className="ml-auto bg-white" onClick={exportCsv} data-testid="button-export-audit-csv">
            <FileDown className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Entity</th>
                <th className="px-6 py-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading logs...</td></tr>
              ) : auditEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <History className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">No log entries found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                auditEntries.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors font-mono text-xs">
                    <td className="px-6 py-3 whitespace-nowrap text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {format(parseISO(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                    </td>
                    <td className="px-6 py-3 font-sans font-medium text-slate-900">
                      {log.userName || log.userEmail || 'System'}
                    </td>
                    <td className="px-6 py-3">
                      <Badge className={`uppercase text-[10px] tracking-wider border-none ${getActionColor(log.action)}`}>
                        {log.action.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      <span className="font-semibold uppercase text-slate-800">{log.entityType}</span>
                      {log.entityId && <span className="ml-2 text-slate-400">({log.entityId.slice(0,8)})</span>}
                    </td>
                    <td className="px-6 py-3 font-sans">
                      <span className="text-slate-700">{log.afterSummary || log.beforeSummary || '-'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
