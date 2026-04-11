import { useState } from "react";
import { useListTrades } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { History, Search, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TradeHistory() {
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const limit = 20;
  const { data: trades, isLoading } = useListTrades({ limit, offset: page * limit });

  const filteredTrades = trades?.filter(t =>
    searchTerm ? t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) : true
  );

  return (
    <div className="h-full pb-8 flex flex-col space-y-6">
      <div className="flex-none">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Trade History</h1>
        <p className="text-slate-400 text-sm font-medium">Review your past execution records and realized P&L.</p>
      </div>

      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl flex flex-col flex-1 min-h-0">
        <CardHeader className="border-b border-white/5 py-4 bg-black/40 flex-none">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center">
              <History className="w-4 h-4 mr-2" />
              Execution Records
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input
                type="search"
                placeholder="Search symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-9 bg-black/40 border-white/10 rounded-md text-xs font-mono placeholder:font-sans focus-visible:ring-primary/50 text-white"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-auto bg-black/20">
          <Table>
            <TableHeader className="bg-black/60 sticky top-0 z-10 backdrop-blur-md">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 h-10 px-4">Time</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 h-10 px-4">Symbol</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 h-10 px-4">Side</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-10 px-4">Size</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-10 px-4">Entry</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-10 px-4">Exit</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right h-10 px-4">Realized P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <TableRow key={i} className="border-white/5 h-12">
                    <TableCell className="px-4"><Skeleton className="h-4 w-24 bg-white/5 rounded" /></TableCell>
                    <TableCell className="px-4"><Skeleton className="h-4 w-12 bg-white/5 rounded" /></TableCell>
                    <TableCell className="px-4"><Skeleton className="h-4 w-10 bg-white/5 rounded" /></TableCell>
                    <TableCell className="text-right px-4"><Skeleton className="h-4 w-6 bg-white/5 rounded ml-auto" /></TableCell>
                    <TableCell className="text-right px-4"><Skeleton className="h-4 w-14 bg-white/5 rounded ml-auto" /></TableCell>
                    <TableCell className="text-right px-4"><Skeleton className="h-4 w-14 bg-white/5 rounded ml-auto" /></TableCell>
                    <TableCell className="text-right px-4"><Skeleton className="h-4 w-20 bg-white/5 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTrades?.length === 0 ? (
                <TableRow className="border-transparent hover:bg-transparent">
                  <TableCell colSpan={7} className="text-center py-24 text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <ArrowRightLeft className="w-8 h-8 mb-4 opacity-30" />
                      <span className="font-mono text-sm">No trade history found</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTrades?.map((trade) => {
                  const closedDate = new Date(trade.closedAt);
                  return (
                    <TableRow key={trade.id} className="border-white/5 hover:bg-white/5 transition-colors h-12">
                      <TableCell className="px-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-300 font-mono">{closedDate.toLocaleDateString()}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{closedDate.toLocaleTimeString()}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 font-bold font-mono text-xs text-white">{trade.symbol}</TableCell>
                      <TableCell className="px-4">
                        <Badge variant="outline" className={cn(
                          "uppercase text-[9px] tracking-widest px-1.5 py-0 border font-bold rounded-sm",
                          trade.side === 'long' ? "border-green-500/50 text-green-500 bg-green-500/10" : "border-red-500/50 text-red-500 bg-red-500/10"
                        )}>
                          {trade.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right px-4 font-mono text-xs text-slate-300">{trade.size}</TableCell>
                      <TableCell className="text-right px-4 font-mono text-xs text-slate-300">{trade.entryPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right px-4 font-mono text-xs text-slate-300">{trade.exitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right px-4">
                        <div className={cn(
                          "font-mono font-bold text-xs flex items-center justify-end",
                          trade.realizedPnl >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {trade.realizedPnl >= 0 ? "+" : ""}${Math.abs(trade.realizedPnl).toFixed(2)}
                          <span className="text-[10px] ml-1.5 opacity-70 font-normal">
                            ({trade.realizedPnl >= 0 ? "+" : ""}{trade.realizedPnlPercent.toFixed(2)}%)
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="border-t border-white/5 p-3 bg-black/40 flex justify-between items-center flex-none">
          <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
            Showing {filteredTrades?.length || 0} records
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || isLoading}
              className="h-7 text-xs bg-transparent border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
            >
              PREV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!trades || trades.length < limit || isLoading}
              className="h-7 text-xs bg-transparent border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
            >
              NEXT
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
