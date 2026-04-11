import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, History, Settings, Terminal, LayoutDashboard, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const interval = setInterval(() => setUptime(prev => prev + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (mins: number) => {
    const h = Math.floor(mins / 60) + 12;
    const m = (mins % 60) + 34;
    const realH = h + Math.floor(m / 60);
    const realM = m % 60;
    return `${realH}h ${realM}m`;
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/trade-history", label: "Trade History", icon: History },
    { href: "/strategy", label: "Strategy Settings", icon: Settings },
    { href: "/logs", label: "Execution Logs", icon: Terminal },
  ];

  return (
    <aside className={cn(
      "h-screen border-r border-white/10 bg-black/40 backdrop-blur-xl flex-col hidden md:flex sticky top-0 transition-all duration-300 z-20",
      collapsed ? "w-16" : "w-60"
    )}>
      <div className="h-20 flex items-center justify-between px-4 border-b border-white/10 relative">
        <div className={cn("flex items-center overflow-hidden transition-all", collapsed ? "w-0 opacity-0" : "w-full opacity-100")}>
          <Activity className="w-6 h-6 text-primary mr-3 shrink-0" />
          <span className="font-bold text-sm tracking-tight whitespace-nowrap">AUTO-TRADE PRO</span>
        </div>
        {collapsed && <Activity className="w-6 h-6 text-primary shrink-0 mx-auto" />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 hover:bg-white/10 rounded absolute right-2 top-6 z-10"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-6 space-y-2 overflow-hidden">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="block">
              <div
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer overflow-hidden",
                  collapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={cn("w-4 h-4 shrink-0", !collapsed && "mr-3", isActive ? "text-primary" : "text-muted-foreground")} />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 overflow-hidden">
        <div className={cn("text-xs text-muted-foreground flex items-center justify-center", !collapsed && "justify-start")}>
          <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">System Active - {formatUptime(uptime)}</span>}
        </div>
      </div>
    </aside>
  );
}
