import { useState, useEffect } from "react";
import { useGetDashboardSummary, useCloseAllPositions, getGetDashboardSummaryQueryKey, getListPositionsQueryKey } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useBotSimulation } from "@/hooks/useBotSimulation";

export function Header() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const closeAllPositions = useCloseAllPositions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { riskUsagePercent, riskUsageColor } = useBotSimulation();

  const [confirmText, setConfirmText] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prevBalance, setPrevBalance] = useState<number | null>(null);
  const [flashClass, setFlashClass] = useState("");

  useEffect(() => {
    if (summary) {
      if (prevBalance !== null && summary.totalBalance !== prevBalance) {
        setFlashClass(summary.totalBalance > prevBalance ? "animate-flash-green" : "animate-flash-red");
        const timer = setTimeout(() => setFlashClass(""), 1000);
        return () => clearTimeout(timer);
      }
      setPrevBalance(summary.totalBalance);
    }
  }, [summary?.totalBalance, prevBalance]);

  const handleKillSwitch = () => {
    closeAllPositions.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey() });
        setDialogOpen(false);
        toast({
          title: "Positions Closed",
          description: "All active positions have been emergency closed.",
          variant: "default",
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to close positions. Please check logs.",
          variant: "destructive",
        });
      }
    });
  };

  const isLive = summary?.botStatus === "live";

  return (
    <header className={cn(
      "h-20 bg-black/30 backdrop-blur-xl border-b flex items-center justify-between px-4 md:px-6 sticky top-0 z-10 transition-all",
      isLive ? "border-t-2 border-red-500/30 shadow-[0_-1px_0_0_rgba(239,68,68,0.2)] border-b-white/10" : "border-white/10"
    )}>
      {/* Left */}
      <div className="hidden md:flex items-center gap-4 w-1/4">
        {isLoading ? (
          <Skeleton className="h-8 w-24 bg-white/10 rounded" />
        ) : summary ? (
          <Badge
            variant="outline"
            className={cn(
              "uppercase tracking-widest font-bold px-4 py-1 text-xs rounded-full border-2",
              isLive ? "border-green-500 text-green-500 bg-green-500/10" :
              summary.botStatus === "simulated" ? "border-blue-500 text-blue-500 bg-blue-500/10" :
              "border-yellow-500 text-yellow-500 bg-yellow-500/10"
            )}
          >
            {summary.botStatus}
          </Badge>
        ) : null}
      </div>

      {/* Center Hero */}
      <div className="flex flex-col items-center justify-center flex-1">
        <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Total Balance</span>
        {isLoading ? (
          <Skeleton className="h-10 w-48 bg-white/10 rounded mt-1" />
        ) : summary ? (
          <>
            <div className={cn("text-4xl font-bold font-mono tracking-tight flex items-center", flashClass)}>
              <DollarSign className="w-6 h-6 text-muted-foreground mr-1 opacity-50" />
              {summary.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={cn(
              "text-xs font-bold font-mono tracking-tight flex items-center mt-1",
              summary.dailyPnl >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {summary.dailyPnl >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {summary.dailyPnl >= 0 ? "+" : ""}${Math.abs(summary.dailyPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} today ({summary.dailyPnl >= 0 ? "+" : ""}{summary.dailyPnlPercent.toFixed(2)}%)
            </div>
          </>
        ) : null}
      </div>

      {/* Right */}
      <div className="flex items-center justify-end gap-6 w-1/4">
        <div className="hidden lg:flex flex-col items-end">
          <div className="flex items-center mb-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mr-2">RISK</span>
            <span className="text-xs font-mono font-bold text-white">{riskUsagePercent.toFixed(1)}%</span>
          </div>
          <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-700 ease-out",
                riskUsageColor === 'green' ? "bg-green-500" :
                riskUsageColor === 'amber' ? "bg-yellow-500" : "bg-red-500"
              )}
              style={{ width: `${riskUsagePercent}%` }}
            />
          </div>
        </div>

        <AlertDialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setConfirmText("");
        }}>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="font-bold uppercase tracking-widest bg-gradient-to-r from-red-600 to-red-700 border-none hover:from-red-500 hover:to-red-600 transition-all duration-300 animate-pulse-glow-red shrink-0"
              disabled={closeAllPositions.isPending}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Kill Switch
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-slate-950 border border-red-900 shadow-2xl shadow-red-900/20">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-500 flex items-center text-xl font-bold uppercase tracking-widest">
                <AlertTriangle className="w-6 h-6 mr-2" />
                Emergency Kill Switch
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-300 text-base mt-4">
                This will immediately close all open positions and disable the bot. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4">
              <label className="text-sm text-slate-400 mb-2 block font-medium">
                Type <strong>CONFIRM</strong> to proceed:
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRM"
                className="bg-black/50 border-red-900/50 focus-visible:ring-red-500 font-mono uppercase"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white">Cancel</AlertDialogCancel>
              <Button
                onClick={handleKillSwitch}
                disabled={confirmText !== "CONFIRM" || closeAllPositions.isPending}
                className={cn(
                  "font-bold uppercase tracking-wider",
                  confirmText === "CONFIRM" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-slate-800 text-slate-500 cursor-not-allowed"
                )}
              >
                {closeAllPositions.isPending ? "Executing..." : "Execute Kill Switch"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
}
