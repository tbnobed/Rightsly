import { useMemo, useState } from "react";
import { useGetDashboard, getGetDashboardQueryKey, CalendarEvent, CalendarEventType } from "@workspace/api-client-react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
  [CalendarEventType.contract_start]: { dot: "bg-emerald-500", label: "Contract start" },
  [CalendarEventType.contract_expiry]: { dot: "bg-red-500", label: "Contract expiry" },
  [CalendarEventType.revenue_report_expected]: { dot: "bg-blue-500", label: "Report due" },
  [CalendarEventType.revenue_report_overdue]: { dot: "bg-amber-500", label: "Report overdue" },
};

export function DashboardCalendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());

  const params = { period: "month" as const, referenceDate: format(month, "yyyy-MM-dd") };
  const { data, isLoading } = useGetDashboard(params, {
    query: { queryKey: getGetDashboardQueryKey(params) },
  });

  const events = data?.calendarEvents ?? [];

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = e.date;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      }),
    [month]
  );

  const selectedEvents = eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900" data-testid="text-calendar-month">
          {format(month, "MMMM yyyy")}
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => { const next = addMonths(m, -1); setSelectedDay(next); return next; })} data-testid="button-calendar-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => { const now = new Date(); setMonth(startOfMonth(now)); setSelectedDay(now); }} data-testid="button-calendar-today">
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => { const next = addMonths(m, 1); setSelectedDay(next); return next; })} data-testid="button-calendar-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-md" />
      ) : (
        <>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-400">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border border-slate-200 bg-slate-200">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              const selected = isSameDay(day, selectedDay);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  data-testid={`calendar-day-${key}`}
                  className={`min-h-16 p-1.5 text-left align-top transition-colors focus:outline-none ${
                    selected ? "bg-amber-50 ring-2 ring-inset ring-amber-400" : inMonth ? "bg-white hover:bg-slate-50" : "bg-slate-50/70 hover:bg-slate-100"
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded-full ${
                      isToday(day)
                        ? "bg-amber-500 text-white font-bold"
                        : inMonth
                        ? "text-slate-700 font-medium"
                        : "text-slate-400"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span key={e.id} className={`w-2 h-2 rounded-full ${TYPE_STYLES[e.type]?.dot ?? "bg-slate-400"}`} title={e.title} />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-slate-500 leading-none">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {Object.values(TYPE_STYLES).map(({ dot, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dot}`} /> {label}
              </span>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-sm font-medium text-slate-700 mb-2">
              {format(selectedDay, "EEEE, MMMM d")}
            </p>
            {selectedEvents.length > 0 ? (
              <div className="space-y-2">
                {selectedEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50/50" data-testid={`calendar-event-${event.id}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_STYLES[event.type]?.dot ?? "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{event.title}</p>
                      {event.partnerName && <p className="text-xs text-slate-500 truncate">{event.partnerName}</p>}
                    </div>
                    <Badge variant="outline" className="text-[10px] text-slate-500 shrink-0">
                      {TYPE_STYLES[event.type]?.label ?? event.type.replace(/_/g, " ")}
                    </Badge>
                    {event.contractId && (
                      <Link href={`/contracts/${event.contractId}`} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors shrink-0">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No events on this day.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
