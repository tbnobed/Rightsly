import { ReactNode } from "react";
import { useAuth } from "@/contexts/auth";
import { Link, useLocation } from "wouter";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarFooter } from "@/components/ui/sidebar";
import { LayoutDashboard, FileText, Users, Film, CheckCircle, Calculator, BarChart3, Upload, History, UserCog, LogOut, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationsBell } from "@/components/notifications-bell";

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar className="border-r border-sidebar-border shadow-sm">
          <SidebarHeader className="p-4 flex flex-row items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground font-bold">
              TBN
            </div>
            <span className="font-semibold tracking-tight text-sidebar-foreground">Rights Management</span>
            <div className="ml-auto">
              <NotificationsBell />
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"}>
                  <Link href="/">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <div className="px-4 py-2 mt-4 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                Core
              </div>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/contracts")}>
                  <Link href="/contracts">
                    <FileText className="w-4 h-4 mr-2" />
                    <span>Contracts</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/partners")}>
                  <Link href="/partners">
                    <Briefcase className="w-4 h-4 mr-2" />
                    <span>Partners</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/content")}>
                  <Link href="/content">
                    <Film className="w-4 h-4 mr-2" />
                    <span>Content Catalog</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <div className="px-4 py-2 mt-4 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                Tools
              </div>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/rights-check"}>
                  <Link href="/rights-check">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    <span>Rights Check</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              {(user.role === "admin" || user.role === "finance") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/royalties"}>
                    <Link href="/royalties">
                      <Calculator className="w-4 h-4 mr-2" />
                      <span>Royalties</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/reports"}>
                  <Link href="/reports">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    <span>Reports</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/import"}>
                  <Link href="/import">
                    <Upload className="w-4 h-4 mr-2" />
                    <span>Import</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              {user.role === "admin" && (
                <>
                  <div className="px-4 py-2 mt-4 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                    Admin
                  </div>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/audit-log"}>
                      <Link href="/audit-log">
                        <History className="w-4 h-4 mr-2" />
                        <span>Audit Log</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/users"}>
                      <Link href="/users">
                        <UserCog className="w-4 h-4 mr-2" />
                        <span>Users</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-sidebar-border flex flex-row items-center gap-3">
            <Avatar className="h-8 w-8 bg-sidebar-accent text-sidebar-accent-foreground">
              <AvatarFallback className="text-xs">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 overflow-hidden">
              <span className="text-sm font-medium truncate">{user.name}</span>
              <span className="text-xs text-sidebar-foreground/60 truncate capitalize">{user.role}</span>
            </div>
            <button onClick={logout} className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors" aria-label="Logout" data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </button>
          </SidebarFooter>
        </Sidebar>
        <main className="flex-1 overflow-auto bg-slate-50 relative">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
