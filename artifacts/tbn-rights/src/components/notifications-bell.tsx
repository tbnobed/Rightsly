import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useClearNotifications,
  getListNotificationsQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return "";
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data } = useListNotifications(undefined, {
    query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 60000 },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });

  const markRead = useMarkNotificationRead({
    mutation: { onSuccess: invalidate },
  });
  const markAllRead = useMarkAllNotificationsRead({
    mutation: { onSuccess: invalidate },
  });
  const clearAll = useClearNotifications({
    mutation: { onSuccess: invalidate },
  });

  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleClick = (n: Notification) => {
    if (!n.read) {
      markRead.mutate({ id: n.id });
    }
    setOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
          aria-label="Notifications"
          data-testid="button-notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white"
              data-testid="badge-notifications-unread"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={notifications.length === 0 || unreadCount === 0 || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              data-testid="button-mark-all-read"
            >
              Mark all read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={notifications.length === 0 || clearAll.isPending}
              onClick={() => clearAll.mutate()}
              data-testid="button-clear-notifications"
            >
              Clear all
            </Button>
          </div>
        </div>
        {notifications.length === 0 ? (
          <div
            className="px-4 py-8 text-center text-sm text-muted-foreground"
            data-testid="text-notifications-empty"
          >
            You're all caught up.
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50",
                    !n.read && "bg-amber-50/60",
                  )}
                  data-testid={`notification-item-${n.id}`}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span
                      className={cn(
                        "text-sm text-foreground",
                        !n.read ? "font-semibold" : "font-normal",
                      )}
                    >
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  {n.message && (
                    <span className="text-xs text-muted-foreground">{n.message}</span>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
