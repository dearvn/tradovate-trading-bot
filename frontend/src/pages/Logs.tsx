import { useState, useEffect, useRef } from "react";
import { useListLogs } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Terminal, Trash2, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Logs() {
  const [filter, setFilter] = useState<"All" | "Orders" | "Risk" | "System">("All");
  const { data: logs, isLoading } = useListLogs({ limit: 500 });
  const [autoScroll, setAutoScroll] = useState(true);
  const [logsClearedAt, setLogsClearedAt] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs?.filter(log => {
    if (logsClearedAt && new Date(log.timestamp).getTime() < logsClearedAt) return false;
    if (filter === "All") return true;

    const msg = log.message.toLowerCase();
    if (filter === "Orders") return msg.includes("order") || msg.includes("filled") || msg.includes("opened") || msg.includes("closed");
    if (filter === "Risk") return msg.includes("risk") || msg.includes("drawdown") || msg.includes("threshold") || msg.includes("margin");
    if (filter === "System") return msg.includes("bot") || msg.includes("strategy") || msg.includes("scan") || msg.includes("recalculated");

    return true;
  }) || [];

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredLogs, autoScroll]);

  const getLogDotColor = (severity: string) => {
    switch (severity) {
      case 'error': return "bg-red-500";
      case 'warning': return "bg-yellow-500";
      case 'info': return "bg-blue-500";
      default: return "bg-slate-500";
    }
  };

  return (
    <div className="h-full pb-8 flex flex-col space-y-6">
      <div className="flex-none">
        <h1 className="text-3xl font-bold tracking-tight mb-2">System Logs</h1>
        <p className="text-slate-400 text-sm font-medium">Detailed execution and operational events.</p>
      </div>

      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl flex flex-col flex-1 min-h-0">
        <CardHeader className="border-b border-white/5 py-4 bg-black/40 flex-none">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center mr-6">
              <Terminal className="w-4 h-4 mr-2" />
              Terminal Output
            </CardTitle>

            <div className="flex items-center justify-between flex-1">
              <div className="flex gap-2">
                {(["All", "Orders", "Risk", "System"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={cn(
                      "text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-sm transition-all",
                      filter === tab ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => setLogsClearedAt(Date.now())} title="Clear Logs">
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className={cn("h-8 w-8 transition-colors", autoScroll ? "text-primary" : "text-slate-500")} onClick={() => setAutoScroll(!autoScroll)} title="Auto-scroll">
                  <ToggleRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 relative bg-black/50 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-6 font-mono text-sm space-y-2 leading-relaxed">
              {isLoading ? (
                Array.from({ length: 20 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full bg-white/5 rounded" />
                ))
              ) : filteredLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-12 font-sans text-sm">
                  No logs match the current filter criteria.
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const date = new Date(log.timestamp);
                  const hh = String(date.getHours()).padStart(2, '0');
                  const mm = String(date.getMinutes()).padStart(2, '0');
                  const ss = String(date.getSeconds()).padStart(2, '0');

                  return (
                    <div key={log.id} className="flex items-start group hover:bg-white/[0.02] p-1.5 -mx-1.5 rounded transition-colors">
                      <div className={cn("w-2 h-2 rounded-full mt-2 mr-3 shrink-0", getLogDotColor(log.severity))} />
                      <span className="text-slate-500 mr-4 shrink-0 select-none">
                        [{hh}:{mm}:{ss}]
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "break-words font-medium",
                          log.severity === 'error' && "text-red-400 font-bold",
                          log.severity === 'warning' && "text-yellow-400",
                          log.severity === 'info' && "text-slate-300"
                        )}>
                          {log.message}
                        </span>
                        {log.context && Object.keys(log.context).length > 0 && (
                          <div className="mt-1.5 text-slate-500 text-[11px] bg-black/40 p-2 rounded border border-white/5 w-fit whitespace-pre-wrap max-w-full">
                            {JSON.stringify(log.context, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
