import { useState } from "react";
import { useGetDashboard, getGetDashboardQueryKey, GetDashboardPeriod } from "@workspace/api-client-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, FileText, AlertCircle, TrendingUp, Clock, ChevronRight, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [period, setPeriod] = useState<GetDashboardPeriod>("month");
  
  const { data: dashboard, isLoading } = useGetDashboard({
    query: {
      queryKey: getGetDashboardQueryKey({ period }),
    }
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of licensing activity and upcoming events.</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={(v) => setPeriod(v as GetDashboardPeriod)}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200" data-testid="select-period">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !dashboard ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard 
              title="Active Contracts" 
              value={dashboard.activeContracts} 
              icon={<FileText className="w-5 h-5 text-slate-400" />} 
              trend={dashboard.totalRightsIn ? `${dashboard.totalRightsIn} Rights In, ${dashboard.totalRightsOut} Rights Out` : undefined}
            />
            <SummaryCard 
              title="Expiring Soon" 
              value={dashboard.expiringSoon} 
              icon={<AlertCircle className="w-5 h-5 text-amber-500" />} 
              trend="Within 60 days"
              alert={dashboard.expiringSoon > 0}
            />
            <SummaryCard 
              title="Upcoming Reports" 
              value={dashboard.upcomingReports} 
              icon={<TrendingUp className="w-5 h-5 text-slate-400" />} 
              trend="Revenue reports due"
            />
            <SummaryCard 
              title="Draft Contracts" 
              value={dashboard.draftContracts} 
              icon={<Clock className="w-5 h-5 text-slate-400" />} 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="col-span-1 lg:col-span-2 border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarIcon className="w-5 h-5 text-amber-500" />
                  Calendar Events
                </CardTitle>
                <CardDescription>Key dates for the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                {dashboard.calendarEvents && dashboard.calendarEvents.length > 0 ? (
                  <div className="space-y-4">
                    {dashboard.calendarEvents.map((event) => (
                      <div key={event.id} className="flex items-start gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50/50">
                        <div className="flex flex-col items-center justify-center min-w-16 bg-white border border-slate-200 rounded-md p-2 shadow-sm">
                          <span className="text-xs font-semibold text-amber-600 uppercase">{format(parseISO(event.date), 'MMM')}</span>
                          <span className="text-xl font-bold text-slate-900 leading-none">{format(parseISO(event.date), 'dd')}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={event.type === 'contract_expiry' ? 'destructive' : event.type === 'revenue_report_overdue' ? 'destructive' : 'secondary'} className="text-xs">
                              {event.type.replace(/_/g, ' ')}
                            </Badge>
                            {event.status && (
                              <Badge variant="outline" className="text-xs text-slate-500">{event.status}</Badge>
                            )}
                          </div>
                          <h4 className="font-semibold text-slate-900 truncate">{event.title}</h4>
                          {event.partnerName && <p className="text-sm text-slate-500 truncate">{event.partnerName}</p>}
                        </div>
                        {event.contractId && (
                          <Link href={`/contracts/${event.contractId}`} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors self-center">
                            <ChevronRight className="w-5 h-5" />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CalendarIcon className="w-12 h-12 text-slate-200 mb-3" />
                    <p className="text-slate-500 font-medium">No events for this period.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Expiring Soon</CardTitle>
                <CardDescription>Contracts expiring within 60 days</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {dashboard.expiringSoonContracts && dashboard.expiringSoonContracts.length > 0 ? (
                  <div className="space-y-4">
                    {dashboard.expiringSoonContracts.map(contract => (
                      <Link key={contract.id} href={`/contracts/${contract.id}`} className="block group">
                        <div className="p-3 rounded-lg border border-slate-100 hover:border-amber-200 hover:bg-amber-50/50 transition-colors">
                          <div className="flex justify-between items-start mb-1">
                            <h5 className="font-semibold text-sm text-slate-900 group-hover:text-amber-700 truncate pr-2">
                              {contract.partnerName || 'Unknown Partner'}
                            </h5>
                            <Badge variant={contract.direction === 'rights_in' ? 'default' : 'secondary'} className="text-[10px] px-1 py-0 h-4">
                              {contract.direction === 'rights_in' ? 'IN' : 'OUT'}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-end mt-2">
                            <span className="text-xs font-medium text-red-600">
                              Ends {contract.endDate ? format(parseISO(contract.endDate), 'MMM d, yyyy') : 'Unknown'}
                            </span>
                            <span className="text-[10px] text-slate-500">{contract.contentCount || 0} items</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <CheckCircle className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-500 font-medium">No contracts expiring soon.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon, trend, alert = false }: { title: string, value: number, icon: React.ReactNode, trend?: string, alert?: boolean }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex flex-col">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-3xl font-bold tracking-tight ${alert ? 'text-amber-600' : 'text-slate-900'}`}>{value}</span>
            </div>
            {trend && <p className="text-xs text-slate-500 mt-1">{trend}</p>}
          </div>
          <div className={`p-3 rounded-xl ${alert ? 'bg-amber-100' : 'bg-slate-100'}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="p-6 h-28 flex flex-col justify-between">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-8 w-1/4 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="col-span-1 lg:col-span-2 h-96">
          <CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader>
          <CardContent><Skeleton className="h-[280px] w-full rounded-md" /></CardContent>
        </Card>
        <Card className="h-96">
          <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
          <CardContent><Skeleton className="h-[280px] w-full rounded-md" /></CardContent>
        </Card>
      </div>
    </>
  );
}
