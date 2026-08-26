import { useMemo, useState } from "react";
import { useGetDashboard, getGetDashboardQueryKey, CalendarEvent, CalendarEventType, RightsInSpan } from "@workspace/api-client-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";

const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
  [CalendarEventType.contract_start]: { dot: "bg-emerald-500", label: "Contract start" },
  [CalendarEventType.contract_expiry]: { dot: "bg-red-500", label: "Contract expiry" },
  [CalendarEventType.revenue_report_expected]: { dot: "bg-blue-500", label: "Report due" },
  [CalendarEventType.revenue_report_overdue]: { dot: "bg-amber-500", label: "Report overdue" },
};

const PLATFORM_COLORS = [
  "bg-indigo-500", "bg-emerald-500", "bg-red-500", "bg-pink-500",
  "bg-amber-500", "bg-violet-500", "bg-cyan-500", "bg-orange-500",
] as const;
const OTHER_PLATFORM_STYLE = { bar: "bg-slate-400", label: "Other" };

/** Stable hash means a platform keeps its color across calendar modes and reloads. */
function platformStyle(platform: string) {
  if (platform === "Other") return OTHER_PLATFORM_STYLE;
  let hash = 0;
  for (let i = 0; i < platform.length; i += 1) hash = ((hash << 5) - hash + platform.charCodeAt(i)) | 0;
  return { bar: PLATFORM_COLORS[Math.abs(hash) % PLATFORM_COLORS.length], label: platform };
}

function spanCoversDay(span: RightsInSpan, dayKey: string) {
  if (span.startDate > dayKey) return false;
  if (span.endType === "date" && span.endDate) return span.endDate >= dayKey;
  return true; // perpetuity / auto-renew
}

export function DashboardCalendar({ period = "month" }: { period?: "month" | "quarter" | "year" }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [mode, setMode] = useState<"events" | "rights_in">("events");
  const [platformFilter, setPlatformFilter] = useState("all");

  const params = { period, referenceDate: format(month, "yyyy-MM-dd") };
  const { data, isLoading } = useGetDashboard(params, {
    query: { queryKey: getGetDashboardQueryKey(params) },
  });

  const events = data?.calendarEvents ?? [];
  const spans = data?.rightsInSpans ?? [];
  const platforms = useMemo(() => [...new Set([
    ...events.flatMap((event) => event.platforms ?? []),
    ...spans.flatMap((span) => span.platforms),
  ])].sort((a, b) => a.localeCompare(b)), [events, spans]);

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

  const matchesPlatformFilter = (platform: string) => platformFilter === "all" || platform === platformFilter;
  const selectedEvents = (eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []).filter((event) =>
    platformFilter === "all" || (event.platforms ?? []).some(matchesPlatformFilter)
  );
  const filteredSpans = (dayKey: string) => spans.filter((span) =>
    spanCoversDay(span, dayKey) &&
    (platformFilter === "all" || span.platforms.some(matchesPlatformFilter))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-slate-900" data-testid="text-calendar-month">
          {format(month, "MMMM yyyy")}
        </h3>
        <div className="flex items-center gap-1">
          <Select value={mode} onValueChange={(v) => setMode(v as "events" | "rights_in")}>
            <SelectTrigger className="h-8 w-44 text-xs bg-white" data-testid="select-calendar-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="events">Key dates</SelectItem>
              <SelectItem value="rights_in">Rights In by platform</SelectItem>
            </SelectContent>
          </Select>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="h-8 w-32 text-xs bg-white" data-testid="select-calendar-platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {platforms.map((platform) => (
                  <SelectItem key={platform} value={platform}>{platform}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
               const dayEvents = (eventsByDay.get(key) ?? []).filter((event) =>
                 platformFilter === "all" || (event.platforms ?? []).some(matchesPlatformFilter)
               );
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
                  {mode === "events" && dayEvents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                       {dayEvents.slice(0, 3).map((e) => (
                         <span key={e.id} className={`w-2 h-2 rounded-full ${e.platforms?.[0] ? platformStyle(e.platforms[0]).bar : TYPE_STYLES[e.type]?.dot ?? "bg-slate-400"}`} title={e.title} />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-slate-500 leading-none">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                  {mode === "rights_in" && (() => {
                    const daySpans = filteredSpans(key);
                    const platforms = [...new Set(daySpans.flatMap((s) =>
                      s.platforms.length ? s.platforms.filter(matchesPlatformFilter) : platformFilter === "all" ? ["Other"] : []
                    ))];
                    return platforms.length > 0 ? (
                      <div className="flex flex-col gap-0.5 mt-1">
                        {platforms.slice(0, 3).map((p) => (
                          <span key={p} className={`h-1 rounded-full ${platformStyle(p).bar}`} title={p} />
                        ))}
                        {platforms.length > 3 && (
                          <span className="text-[10px] text-slate-500 leading-none">+{platforms.length - 3}</span>
                        )}
                      </div>
                    ) : null;
                  })()}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {[...platforms.map(platformStyle), ...(mode === "rights_in" ? [OTHER_PLATFORM_STYLE] : [])].map(({ bar, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`w-4 h-1 rounded-full ${bar}`} /> {label}
              </span>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-sm font-medium text-slate-700 mb-2">
              {format(selectedDay, "EEEE, MMMM d")}
            </p>
            {mode === "rights_in" ? (
              (() => {
                const dayKey = format(selectedDay, "yyyy-MM-dd");
                const daySpans = filteredSpans(dayKey);
                return daySpans.length > 0 ? (
                  <div className="space-y-2">
                    {daySpans.map((span) => (
                      <div key={span.contractId} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50/50" data-testid={`calendar-span-${span.contractId}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{span.partnerName ?? "Unknown partner"}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {span.startDate} — {span.endType === "date" && span.endDate ? span.endDate : span.endType === "perpetuity" ? "In perpetuity" : "Auto-renew"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end max-w-48">
                           {(span.platforms.length ? span.platforms.filter(matchesPlatformFilter) : platformFilter === "all" ? ["Other"] : []).map((p) => (
                            <Badge key={p} variant="outline" className="text-[10px] shrink-0 flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${platformStyle(p).bar}`} /> {p}
                            </Badge>
                          ))}
                        </div>
                        <Link href={`/contracts/${span.contractId}`} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors shrink-0">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No Rights In contracts active on this day.</p>
                );
              })()
            ) : selectedEvents.length > 0 ? (
              <div className="space-y-2">
                {selectedEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50/50" data-testid={`calendar-event-${event.id}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${event.platforms?.[0] ? platformStyle(event.platforms[0]).bar : TYPE_STYLES[event.type]?.dot ?? "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{event.title}</p>
                      {event.partnerName && <p className="text-xs text-slate-500 truncate">{event.partnerName}</p>}
                       {event.platforms?.length ? <p className="text-xs text-slate-500 truncate">{event.platforms.join(", ")}</p> : null}
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
