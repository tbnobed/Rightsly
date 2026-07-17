import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { AlertCircle, History, Clock } from "lucide-react";

export default function AuditLog() {
  const { user } = useAuth();
  const [action, setAction] = useState<string>("all");
  
  const params = { action: action !== 'all' ? action : undefined };
  const { data: result, isLoading } = useListAuditLogs(params, {
    query: {
      queryKey: getListAuditLogsQueryKey(params),
    }
  });

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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Audit Log</h1>
          <p className="text-slate-500 mt-1">Immutable record of system changes.</p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between bg-slate-50/50">
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
            </SelectContent>
          </Select>
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
              ) : !result?.data || result.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <History className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">No log entries found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                result.data.map((log) => (
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
