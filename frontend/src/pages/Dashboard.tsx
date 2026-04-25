import { useState, useEffect, useRef } from "react";
import { useListPositions, useClosePosition, getListPositionsQueryKey, useGetStrategyPerformance, useListLogs } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, TrendingUp, RefreshCw, Target, Activity, Trash2, ToggleRight, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMarketData } from "@/hooks/useMarketData";
import { useOrderFlow } from "@/hooks/useOrderFlow";
import { useChartData } from "@/hooks/useChartData";
import { CandlestickChart } from "@/components/CandlestickChart";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";

const MOCK_EQUITY_DATA = [
  { value: 100000 }, { value: 100500 }, { value: 100200 }, { value: 101000 },
  { value: 100800 }, { value: 101500 }, { value: 102000 }, { value: 101900 },
  { value: 102500 }, { value: 103000 }
];

function IndicatorChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 border border-white/8">
      <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</span>
      <span className="text-[11px] font-mono font-semibold">{children}</span>
    </div>
  );
}

function Pill({ up, children }: { up: boolean; children: React.ReactNode }) {
  return (
    <span className={cn(
      "text-[10px] font-bold px-1.5 py-0.5 rounded-sm font-mono tracking-wide",
      up ? "text-green-400 bg-green-500/15" : "text-red-400 bg-red-500/15"
    )}>{children}</span>
  );
}

function Dash() {
  return <span className="text-slate-600 font-mono text-xs">—</span>;
}

export default function Dashboard() {
  const { data: positions, isLoading: isLoadingPositions } = useListPositions();
  const { data: performance, isLoading: isLoadingPerformance } = useGetStrategyPerformance();
  const { data: logs, isLoading: isLoadingLogs } = useListLogs({ limit: 100 });
  const closePosition = useClosePosition();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const marketData = useMarketData();
  const orderFlow = useOrderFlow();
  const { bars } = useChartData(marketData.symbol);

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
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [filteredLogs, autoScroll]);

  const getLogDotColor = (severity: string) => {
    switch (severity) {
      case 'error': return "bg-red-500";
      case 'warning': return "bg-yellow-500";
      case 'info': return "bg-blue-500";
      default: return "bg-slate-500";
    }
  };

  const rsi = marketData.rsi ?? 0;
  const trend = marketData.trend ?? "";
  const macdBull = marketData.macd_bull ?? false;
  const macdBear = marketData.macd_bear ?? false;
  const atr = marketData.atr ?? 0;
  const wma11 = marketData.wma11 ?? 0;
  const wma48 = marketData.wma48 ?? 0;
  const currentPrice = marketData.price;
  const orderType = marketData.order_type ?? "";

  return (
    <div className="flex flex-col gap-3 h-full pb-6">
      {/* Row 1: Chart + Performance side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_310px] gap-3">

        {/* Chart Panel */}
        <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[520px]">
          {/* Symbol / price header */}
          <div className="border-b border-white/5 py-2.5 px-4 bg-black/40 flex-none flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="font-bold text-base tracking-wider text-white flex items-center gap-2">
                {marketData.symbol}
                {marketData.isLive && <span className="w-2 h-2 rounded-full bg-green-500 animate-blink inline-block" />}
              </span>
              <span className={cn(
                "font-mono text-xl font-bold tracking-tight",
                marketData.direction === 'up' ? "text-green-400" : marketData.direction === 'down' ? "text-red-400" : "text-white"
              )}>
                {marketData.price > 0 ? marketData.price.toFixed(2) : <span className="text-slate-500">—</span>}
              </span>
              {marketData.price > 0 && (
              <span className={cn(
                "font-mono text-xs font-medium",
                marketData.direction === 'up' ? "text-green-400" : marketData.direction === 'down' ? "text-red-400" : "text-slate-400"
              )}>
                {marketData.direction === 'up' ? '▲' : marketData.direction === 'down' ? '▼' : '▬'}{' '}
                {marketData.change > 0 ? '+' : ''}{marketData.change.toFixed(2)} ({marketData.changePercent > 0 ? '+' : ''}{marketData.changePercent.toFixed(2)}%)
              </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              VOL {bars.length > 0 ? ((bars[bars.length - 1].volume) / 1000).toFixed(1) : '0.0'}K
            </div>
          </div>

          {/* Indicator bar */}
          <div className="border-b border-white/5 bg-black/30 flex-none px-3 py-1.5 flex items-center gap-2 flex-wrap">
            <IndicatorChip label="RSI">
              {rsi > 0
                ? <span className={cn(rsi >= 70 ? "text-red-400" : rsi <= 30 ? "text-green-400" : "text-slate-200")}>{rsi.toFixed(1)}</span>
                : <Dash />}
            </IndicatorChip>

            <IndicatorChip label="WMA">
              {wma11 > 0 && wma48 > 0
                ? <Pill up={wma11 > wma48}>{wma11 > wma48 ? "BULL" : "BEAR"}</Pill>
                : <Dash />}
            </IndicatorChip>

            <IndicatorChip label="MACD">
              {macdBull || macdBear
                ? <Pill up={macdBull}>{macdBull ? "BULL X" : "BEAR X"}</Pill>
                : <Dash />}
            </IndicatorChip>

            <IndicatorChip label="TREND">
              {trend
                ? <Pill up={trend === 'up'}>{trend.toUpperCase()}</Pill>
                : <Dash />}
            </IndicatorChip>

            <IndicatorChip label="ATR">
              {atr > 0
                ? <span className="text-slate-200">{atr.toFixed(2)}</span>
                : <Dash />}
            </IndicatorChip>

            <div className="ml-auto">
              {orderType
                ? <span className={cn(
                    "text-[10px] font-bold px-2.5 py-1 rounded font-mono tracking-widest border",
                    orderType === 'CALL' ? "text-green-300 bg-green-500/20 border-green-500/30" : "text-red-300 bg-red-500/20 border-red-500/30"
                  )}>{orderType}</span>
                : <span className="text-[10px] text-slate-600 font-mono tracking-widest border border-white/8 px-2.5 py-1 rounded">NO SIGNAL</span>}
            </div>
          </div>

          {/* Chart canvas */}
          <CardContent className="p-0 flex-1 relative bg-[#070c14] overflow-hidden">
            <CandlestickChart bars={bars} currentPrice={currentPrice > 0 ? currentPrice : undefined} className="absolute inset-0" />
          </CardContent>
        </Card>

        {/* Performance Panel */}
        <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[520px]">
          <div className="border-b border-white/5 py-2.5 px-4 bg-black/40 flex-none flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Strategy Performance</span>
          </div>
          <CardContent className="p-4 flex-1 overflow-auto bg-black/20">
            {isLoadingPerformance ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full bg-white/5 rounded-lg" />
                <Skeleton className="h-32 w-full bg-white/5 rounded-lg" />
              </div>
            ) : performance ? (
              <div className="space-y-4">
                {/* Equity sparkline */}
                <div className="h-20 w-full rounded-lg bg-black/30 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={MOCK_EQUITY_DATA} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <YAxis domain={['dataMin', 'dataMax']} hide />
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5}
                        fillOpacity={1} fill="url(#colorEquity)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Win Rate", value: `${performance.winRate.toFixed(1)}%`, color: "text-white", bar: performance.winRate, barColor: "bg-primary" },
                    { label: "Profit Factor", value: performance.profitFactor.toFixed(2), color: performance.profitFactor >= 1.5 ? "text-green-400" : "text-white" },
                    { label: "Max Drawdown", value: `${performance.maxDrawdown.toFixed(2)}%`, color: "text-red-400", bar: Math.min(performance.maxDrawdown, 100), barColor: "bg-red-500" },
                    { label: "Sharpe Ratio", value: performance.sharpeRatio.toFixed(2), color: "text-white" },
                    { label: "Risk/Reward", value: performance.riskRewardRatio.toFixed(2), color: "text-white" },
                    { label: "Cur. Drawdown", value: `${performance.currentDrawdown.toFixed(2)}%`, color: performance.currentDrawdown > 5 ? "text-red-400" : "text-yellow-400" },
                  ].map(({ label, value, color, bar, barColor }) => (
                    <div key={label} className="bg-black/40 p-2.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">{label}</div>
                      <div className={cn("text-lg font-bold font-mono mb-1.5", color)}>{value}</div>
                      {bar !== undefined && barColor && (
                        <div className="h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
                          <div className={cn("h-full", barColor)} style={{ width: `${bar}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Avg Win / Avg Loss / Expectancy */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-black/40 p-2.5 rounded-lg border border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Avg Win</div>
                    <div className="text-base font-bold font-mono text-green-400 flex items-center">
                      <DollarSign className="w-3 h-3 opacity-50" />{performance.avgWin.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-black/40 p-2.5 rounded-lg border border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Avg Loss</div>
                    <div className="text-base font-bold font-mono text-red-400 flex items-center">
                      <DollarSign className="w-3 h-3 opacity-50" />{performance.avgLoss.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-black/40 p-2.5 rounded-lg border border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Expect.</div>
                    {(() => {
                      const exp = (performance.winRate / 100 * performance.avgWin) - ((1 - performance.winRate / 100) * performance.avgLoss);
                      return (
                        <div className={cn("text-base font-bold font-mono flex items-center", exp >= 0 ? "text-green-400" : "text-red-400")}>
                          {exp >= 0 ? '+' : '-'}<DollarSign className="w-3 h-3 opacity-50" />{Math.abs(exp).toFixed(2)}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 font-mono text-xs">No performance data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Market Intelligence */}
      {(() => {
        const regime = orderFlow.regime;
        const flow   = orderFlow.flow;
        const profile = orderFlow.profile;

        const regimeColors: Record<string, string> = {
          DEAD_PINNING: 'text-slate-400 bg-slate-500/15 border-slate-500/30',
          SIDEWAY:      'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
          MIXED:        'text-blue-300 bg-blue-500/15 border-blue-500/30',
          ACTION:       'text-green-300 bg-green-500/15 border-green-500/30',
          HARD_ACTION:  'text-emerald-300 bg-emerald-500/20 border-emerald-400/40',
        };
        const regimeCls = regime?.regime ? (regimeColors[regime.regime] ?? 'text-slate-400 bg-white/5 border-white/10') : 'text-slate-600 bg-white/5 border-white/8';

        const hintColors: Record<string, string> = {
          EXPANDING_UP:   'text-green-400',
          EXPANDING_DOWN: 'text-red-400',
          PINNING:        'text-yellow-400',
          FLAT:           'text-slate-400',
        };
        const hintCls = regime?.regimeHint ? (hintColors[regime.regimeHint] ?? 'text-slate-400') : 'text-slate-600';

        const pressureVal = regime?.pressure ?? flow?.pressure ?? null;
        const cvdVal      = regime?.cvd ?? flow?.cvd ?? null;
        const pocVal      = regime?.poc ?? profile?.poc ?? null;
        const vahVal      = regime?.vah ?? profile?.vah ?? null;
        const valVal      = regime?.val ?? profile?.val ?? null;

        return (
          <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden">
            <div className="border-b border-white/5 py-2 px-4 bg-black/40 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Market Intelligence</span>
              {regime && (
                <span className="ml-1 text-[9px] text-slate-500 font-mono">
                  {regime.sessionPhase ?? flow?.sessionPhase ?? ''}
                </span>
              )}
            </div>
            <CardContent className="p-3 bg-black/20">
              <div className="flex flex-wrap gap-2 items-center">
                {/* Regime badge */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Regime</span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded border font-mono tracking-widest",
                    regimeCls
                  )}>
                    {regime?.regime ?? '—'}
                  </span>
                </div>

                {/* Regime hint */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Signal</span>
                  <span className={cn("text-[10px] font-mono font-semibold", hintCls)}>
                    {regime?.regimeHint ?? flow?.regimeHint ?? '—'}
                  </span>
                </div>

                <div className="w-px h-4 bg-white/8" />

                {/* Pressure */}
                <IndicatorChip label="Pressure">
                  {pressureVal !== null
                    ? <span className={pressureVal >= 0.15 ? "text-green-400" : pressureVal <= -0.15 ? "text-red-400" : "text-slate-300"}>
                        {pressureVal >= 0 ? '+' : ''}{pressureVal.toFixed(3)}
                      </span>
                    : <Dash />}
                </IndicatorChip>

                {/* CVD */}
                <IndicatorChip label="CVD">
                  {cvdVal !== null
                    ? <span className={cvdVal >= 0 ? "text-green-400" : "text-red-400"}>
                        {cvdVal >= 0 ? '+' : ''}{cvdVal.toLocaleString()}
                      </span>
                    : <Dash />}
                </IndicatorChip>

                <div className="w-px h-4 bg-white/8" />

                {/* Volume profile */}
                <IndicatorChip label="VAH">
                  {vahVal ? <span className="text-slate-200">{vahVal.toFixed(2)}</span> : <Dash />}
                </IndicatorChip>

                <IndicatorChip label="POC">
                  {pocVal ? <span className="text-yellow-300">{pocVal.toFixed(2)}</span> : <Dash />}
                </IndicatorChip>

                <IndicatorChip label="VAL">
                  {valVal ? <span className="text-slate-200">{valVal.toFixed(2)}</span> : <Dash />}
                </IndicatorChip>

                {/* Price vs value area */}
                {regime?.priceVsValueArea && (
                  <div className="ml-auto">
                    <span className={cn(
                      "text-[9px] font-bold px-2 py-0.5 rounded font-mono tracking-widest border",
                      regime.priceVsValueArea === 'ABOVE_VAH' ? "text-green-300 bg-green-500/10 border-green-500/20" :
                      regime.priceVsValueArea === 'BELOW_VAL' ? "text-red-300 bg-red-500/10 border-red-500/20" :
                      "text-slate-400 bg-white/5 border-white/8"
                    )}>
                      {regime.priceVsValueArea.replace('_', ' ')}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Row 3: Active Positions */}
      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[260px]">
        <div className="border-b border-white/5 py-2.5 px-4 bg-black/40 flex-none flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Active Positions</span>
          {positions && positions.length > 0 && (
            <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">{positions.length}</span>
          )}
        </div>
        <CardContent className="p-0 flex-1 overflow-auto bg-black/20">
          <Table>
            <TableHeader className="bg-black/40 sticky top-0 z-10 backdrop-blur-md">
              <TableRow className="border-white/5 hover:bg-transparent">
                {["Symbol", "Side", "Size", "Entry", "Current", "Unrealized P&L", "Duration", ""].map(h => (
                  <TableHead key={h} className={cn(
                    "text-[9px] uppercase tracking-widest font-bold text-slate-500 h-7",
                    ["Size", "Entry", "Current", "Unrealized P&L", "Duration", ""].includes(h) && "text-right"
                  )}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingPositions ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i} className="border-white/5">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full bg-white/5 rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !positions || positions.length === 0 ? (
                <TableRow className="border-transparent hover:bg-transparent">
                  <TableCell colSpan={8} className="text-center py-10 text-slate-600">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Activity className="w-6 h-6 opacity-30" />
                      <span className="font-mono text-xs">No active positions</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                positions.map((position) => {
                  const durationMs = Date.now() - new Date(position.openedAt).getTime();
                  const durationH = Math.floor(durationMs / 3600000);
                  const durationM = Math.floor((durationMs % 3600000) / 60000);
                  return (
                    <TableRow key={position.id} className="border-white/5 hover:bg-white/5 transition-colors group cursor-default h-12">
                      <TableCell className="font-bold font-mono text-xs">{position.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "uppercase text-[9px] tracking-widest px-1.5 py-0 border font-bold rounded-sm",
                          position.side === 'long' ? "border-green-500/50 text-green-400 bg-green-500/10" : "border-red-500/50 text-red-400 bg-red-500/10"
                        )}>
                          {position.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-300">{position.size}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-300">{position.entryPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-300">{position.currentPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <div className={cn("font-mono font-bold text-xs flex items-center gap-1", position.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400")}>
                            {position.unrealizedPnl >= 0 ? "+" : ""}${Math.abs(position.unrealizedPnl).toFixed(2)}
                            <span className="text-[9px] opacity-60 font-normal">
                              ({position.unrealizedPnl >= 0 ? "+" : ""}{position.unrealizedPnlPercent.toFixed(2)}%)
                            </span>
                          </div>
                          <div className="h-0.5 w-14 bg-white/10 rounded-full mt-0.5 overflow-hidden">
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

      {/* Row 4: Execution Logs */}
      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[200px]">
        <div className="border-b border-white/5 py-2 px-4 bg-black/40 flex-none flex items-center justify-between">
          <div className="flex gap-1.5">
            {(["All", "Orders", "Risk", "System"] as const).map(tab => (
              <button key={tab} onClick={() => setLogFilter(tab)}
                className={cn("text-[9px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-sm transition-all",
                  logFilter === tab ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                )}>
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setLogsClearedAt(Date.now())} title="Clear">
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className={cn("h-6 w-6 transition-colors", autoScroll ? "text-primary" : "text-slate-500")} onClick={() => setAutoScroll(!autoScroll)} title="Auto-scroll">
              <ToggleRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardContent className="p-0 flex-1 relative bg-black/50 overflow-hidden">
          <ScrollArea ref={scrollAreaRef} className="h-full">
            <div className="p-3 space-y-0.5 font-mono text-[10px] leading-tight">
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
                      <span className="text-slate-600 mr-3 shrink-0">[{hh}:{mm}:{ss}]</span>
                      <span className={cn("break-words",
                        log.severity === 'error' && "text-red-400 font-semibold",
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
