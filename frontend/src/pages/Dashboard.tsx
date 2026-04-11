import { useState, useEffect, useRef } from "react";
import { useListPositions, useClosePosition, getListPositionsQueryKey, useGetStrategyPerformance, useListLogs } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, TrendingUp, RefreshCw, Target, Activity, Trash2, ToggleRight, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMarketData } from "@/hooks/useMarketData";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";

const MOCK_EQUITY_DATA = [
  { value: 100000 }, { value: 100500 }, { value: 100200 }, { value: 101000 },
  { value: 100800 }, { value: 101500 }, { value: 102000 }, { value: 101900 },
  { value: 102500 }, { value: 103000 }
];

export default function Dashboard() {
  const { data: positions, isLoading: isLoadingPositions } = useListPositions();
  const { data: performance, isLoading: isLoadingPerformance } = useGetStrategyPerformance();
  const { data: logs, isLoading: isLoadingLogs } = useListLogs({ limit: 100 });
  const closePosition = useClosePosition();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const marketData = useMarketData();

  const [logFilter, setLogFilter] = useState<"All" | "Orders" | "Risk" | "System">("All");
  const [autoScroll, setAutoScroll] = useState(true);
  const [logsClearedAt, setLogsClearedAt] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const handleClosePosition = (id: string) => {
    closePosition.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey() });
      }
    });
  };

  const handleSoon = () => {
    toast({ title: "Feature coming soon", description: "This action is not yet implemented.", variant: "default" });
  };

  const filteredLogs = logs?.filter(log => {
    if (logsClearedAt && new Date(log.timestamp).getTime() < logsClearedAt) return false;
    if (logFilter === "All") return true;
    const msg = log.message.toLowerCase();
    if (logFilter === "Orders") return msg.includes("order") || msg.includes("filled") || msg.includes("opened") || msg.includes("closed");
    if (logFilter === "Risk") return msg.includes("risk") || msg.includes("drawdown") || msg.includes("threshold") || msg.includes("margin");
    if (logFilter === "System") return msg.includes("bot") || msg.includes("strategy") || msg.includes("scan") || msg.includes("recalculated");
    return true;
  }) || [];

  useEffect(() => {
    if (!autoScroll || !scrollAreaRef.current) return;
    const viewport = scrollAreaRef.current.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport]'
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full pb-8">
      {/* Panel A: Chart */}
      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[450px]">
        <CardHeader className="border-b border-white/5 py-3 bg-black/40 flex-none">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg tracking-wider text-white flex items-center">
                {marketData.symbol}
                {marketData.isLive && <div className="ml-2 w-2 h-2 rounded-full bg-green-500 animate-blink" />}
              </span>
              <span className={cn(
                "font-mono text-xl font-bold tracking-tight",
                marketData.direction === 'up' ? "text-green-500" : marketData.direction === 'down' ? "text-red-500" : "text-white"
              )}>
                {marketData.price.toFixed(2)}
              </span>
              <span className={cn(
                "font-mono text-sm font-medium",
                marketData.direction === 'up' ? "text-green-500" : marketData.direction === 'down' ? "text-red-500" : "text-slate-400"
              )}>
                {marketData.direction === 'up' ? '▲' : marketData.direction === 'down' ? '▼' : '▬'} {marketData.change > 0 ? '+' : ''}{marketData.change.toFixed(2)} ({marketData.changePercent > 0 ? '+' : ''}{marketData.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono">VOL: {(marketData.volume / 1000).toFixed(1)}K</div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 relative bg-[#070c14] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.05)_0%,_transparent_60%)] pointer-events-none" />
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <div className="text-primary font-mono text-xs tracking-widest font-bold opacity-70">INITIALIZING TRADINGVIEW ENGINE...</div>
          </div>
        </CardContent>
      </Card>

      {/* Panel B: Strategy Performance */}
      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[450px]">
        <CardHeader className="border-b border-white/5 py-3 bg-black/40 flex-none">
          <CardTitle className="text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center">
            <Target className="w-4 h-4 mr-2 text-primary" />
            Strategy Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 flex-1 overflow-auto bg-black/20">
          {isLoadingPerformance ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full bg-white/5 rounded-lg" />
              <Skeleton className="h-24 w-full bg-white/5 rounded-lg" />
            </div>
          ) : performance ? (
            <div className="space-y-5">
              <div className="h-20 w-full mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={MOCK_EQUITY_DATA}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <YAxis domain={['dataMin', 'dataMax']} hide />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEquity)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Win Rate", value: `${performance.winRate.toFixed(1)}%`, color: "text-white", bar: performance.winRate, barColor: "bg-primary" },
                  { label: "Max Drawdown", value: `${performance.maxDrawdown.toFixed(2)}%`, color: "text-red-500", bar: Math.min(performance.maxDrawdown, 100), barColor: "bg-red-500" },
                  { label: "Current DD", value: `${performance.currentDrawdown.toFixed(2)}%`, color: performance.currentDrawdown > 5 ? "text-red-500" : "text-yellow-500" },
                  { label: "Risk/Reward", value: performance.riskRewardRatio.toFixed(2), color: "text-white" },
                  { label: "Profit Factor", value: performance.profitFactor.toFixed(2), color: performance.profitFactor >= 1.5 ? "text-green-500" : "text-white" },
                  { label: "Sharpe", value: performance.sharpeRatio.toFixed(2), color: "text-white" },
                ].map(({ label, value, color, bar, barColor }) => (
                  <div key={label} className="bg-black/40 p-3 rounded-lg border border-white/5">
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{label}</div>
                    <div className={cn("text-xl font-bold font-mono mb-2", color)}>{value}</div>
                    {bar !== undefined && barColor && (
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className={cn("h-full", barColor)} style={{ width: `${bar}%` }} />
                      </div>
                    )}
                  </div>
                ))}
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Avg Win</div>
                  <div className="text-xl font-bold font-mono text-green-500 flex items-center">
                    <DollarSign className="w-3 h-3 opacity-50" />{performance.avgWin.toFixed(2)}
                  </div>
                </div>
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Avg Loss</div>
                  <div className="text-xl font-bold font-mono text-red-500 flex items-center">
                    <DollarSign className="w-3 h-3 opacity-50" />{performance.avgLoss.toFixed(2)}
                  </div>
                </div>
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Expectancy</div>
                  <div className={cn("text-xl font-bold font-mono flex items-center",
                    ((performance.winRate/100 * performance.avgWin) - ((1 - performance.winRate/100) * performance.avgLoss)) >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {((performance.winRate/100 * performance.avgWin) - ((1 - performance.winRate/100) * performance.avgLoss)) >= 0 ? '+' : '-'}
                    <DollarSign className="w-3 h-3 opacity-50" />
                    {Math.abs((performance.winRate/100 * performance.avgWin) - ((1 - performance.winRate/100) * performance.avgLoss)).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Panel C: Active Positions */}
      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[400px]">
        <CardHeader className="border-b border-white/5 py-3 bg-black/40 flex-none">
          <CardTitle className="text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center">
            <Activity className="w-4 h-4 mr-2 text-primary" />
            Active Positions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-auto bg-black/20">
          <Table>
            <TableHeader className="bg-black/40 sticky top-0 z-10 backdrop-blur-md">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 h-8">Symbol</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 h-8">Side</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-8">Size</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-8">Entry</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-8">Current</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-8">Unrealized P&L</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-8">Duration</TableHead>
                <TableHead className="w-[100px] h-8 text-right text-[10px] uppercase tracking-widest font-bold text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingPositions ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-white/5">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full bg-white/5 rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : positions?.length === 0 ? (
                <TableRow className="border-transparent hover:bg-transparent">
                  <TableCell colSpan={8} className="text-center py-16 text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Activity className="w-8 h-8 text-slate-600 mb-3 opacity-50" />
                      <span className="font-mono text-sm tracking-tight">No active positions</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                positions?.map((position) => {
                  const durationMs = Date.now() - new Date(position.openedAt).getTime();
                  const durationH = Math.floor(durationMs / 3600000);
                  const durationM = Math.floor((durationMs % 3600000) / 60000);
                  return (
                    <TableRow key={position.id} className="border-white/5 hover:bg-white/5 transition-colors group cursor-default h-14">
                      <TableCell className="font-bold font-mono text-xs">{position.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "uppercase text-[9px] tracking-widest px-1.5 py-0 border font-bold rounded-sm",
                          position.side === 'long' ? "border-green-500/50 text-green-500 bg-green-500/10" : "border-red-500/50 text-red-500 bg-red-500/10"
                        )}>
                          {position.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-300">{position.size}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-300">{position.entryPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-300">{position.currentPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <div className={cn("font-mono font-bold text-xs flex items-center", position.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500")}>
                            {position.unrealizedPnl >= 0 ? "+" : ""}${Math.abs(position.unrealizedPnl).toFixed(2)}
                            <span className="text-[10px] ml-1.5 opacity-70 font-normal">
                              ({position.unrealizedPnl >= 0 ? "+" : ""}{position.unrealizedPnlPercent.toFixed(2)}%)
                            </span>
                          </div>
                          <div className="h-0.5 w-16 bg-white/10 rounded-full mt-1 overflow-hidden">
                            <div className={cn("h-full", position.unrealizedPnl >= 0 ? "bg-green-500" : "bg-red-500")}
                                 style={{ width: `${Math.min(Math.abs(position.unrealizedPnlPercent) * 10, 100)}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-400">{durationH}h {durationM}m</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white hover:bg-white/10" onClick={handleSoon}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white hover:bg-white/10" onClick={handleSoon}>
                            <TrendingUp className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                            onClick={() => handleClosePosition(position.id)} disabled={closePosition.isPending}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Panel D: Execution Logs */}
      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[400px]">
        <CardHeader className="border-b border-white/5 py-3 bg-black/40 flex-none">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {(["All", "Orders", "Risk", "System"] as const).map(tab => (
                <button key={tab} onClick={() => setLogFilter(tab)}
                  className={cn("text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-sm transition-all",
                    logFilter === tab ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  )}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setLogsClearedAt(Date.now())} title="Clear Logs">
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className={cn("h-6 w-6 transition-colors", autoScroll ? "text-primary" : "text-slate-500")} onClick={() => setAutoScroll(!autoScroll)} title="Auto-scroll">
                <ToggleRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 relative bg-black/50 overflow-hidden">
          <ScrollArea ref={scrollAreaRef} className="h-full">
            <div className="p-4 space-y-1 font-mono text-[10px] leading-tight">
              {isLoadingLogs ? (
                <div className="text-slate-600 px-2">Loading logs...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-slate-600 px-2 font-sans text-xs">No logs match the current filter.</div>
              ) : (
                filteredLogs.map((log) => {
                  const date = new Date(log.timestamp);
                  const hh = String(date.getHours()).padStart(2, '0');
                  const mm = String(date.getMinutes()).padStart(2, '0');
                  const ss = String(date.getSeconds()).padStart(2, '0');
                  return (
                    <div key={log.id} className="flex items-start hover:bg-white/[0.02] px-2 py-0.5 rounded">
                      <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 mr-2 shrink-0", getLogDotColor(log.severity))} />
                      <span className="text-slate-500 mr-3 shrink-0">[{hh}:{mm}:{ss}]</span>
                      <span className={cn("break-words font-medium",
                        log.severity === 'error' && "text-red-400",
                        log.severity === 'warning' && "text-yellow-400",
                        log.severity === 'info' && "text-slate-300"
                      )}>{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
