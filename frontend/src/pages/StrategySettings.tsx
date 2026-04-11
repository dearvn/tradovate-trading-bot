import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetStrategy, useUpdateStrategy, getGetStrategyQueryKey } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const strategySchema = z.object({
  name: z.string().min(1, "Name is required"),
  enabled: z.boolean(),
  maxPositions: z.coerce.number().min(1).max(50),
  riskPerTrade: z.coerce.number().min(0.1).max(10),
  stopLossPercent: z.coerce.number().min(0.1).max(20),
  takeProfitPercent: z.coerce.number().min(0.1).max(50),
  tradingHoursStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:MM format"),
  tradingHoursEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:MM format"),
  instruments: z.string(),
});

export default function StrategySettings() {
  const { data: strategy, isLoading } = useGetStrategy();
  const updateStrategy = useUpdateStrategy();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof strategySchema>>({
    resolver: zodResolver(strategySchema),
    defaultValues: {
      name: "",
      enabled: false,
      maxPositions: 1,
      riskPerTrade: 1,
      stopLossPercent: 1,
      takeProfitPercent: 2,
      tradingHoursStart: "09:30",
      tradingHoursEnd: "16:00",
      instruments: "NQ",
    },
  });

  useEffect(() => {
    if (strategy) {
      form.reset({
        name: strategy.name,
        enabled: strategy.enabled,
        maxPositions: strategy.maxPositions,
        riskPerTrade: strategy.riskPerTrade,
        stopLossPercent: strategy.stopLossPercent,
        takeProfitPercent: strategy.takeProfitPercent,
        tradingHoursStart: strategy.tradingHoursStart,
        tradingHoursEnd: strategy.tradingHoursEnd,
        instruments: strategy.instruments.join(", "),
      });
    }
  }, [strategy, form]);

  const onSubmit = (values: z.infer<typeof strategySchema>) => {
    const payload = {
      ...values,
      instruments: values.instruments.split(",").map(s => s.trim()).filter(Boolean),
    };

    updateStrategy.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetStrategyQueryKey() });
        toast({
          title: "Strategy Updated",
          description: "Your trading strategy parameters have been saved.",
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to update strategy.",
          variant: "destructive",
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-64 bg-white/5 rounded" />
        <Skeleton className="h-[600px] w-full bg-white/5 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="h-full pb-8 flex flex-col space-y-6 max-w-4xl">
      <div className="flex-none">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Strategy Parameters</h1>
        <p className="text-slate-400 text-sm font-medium">Configure your algorithm's risk and operational boundaries.</p>
      </div>

      <Card className="bg-card/50 backdrop-blur-md border-white/5 rounded-xl shadow-2xl flex-1 overflow-hidden">
        <CardHeader className="border-b border-white/5 py-5 bg-black/40">
          <CardTitle className="text-xs font-bold tracking-widest text-slate-400 uppercase flex items-center">
            <Settings2 className="w-4 h-4 mr-2 text-primary" />
            Algorithm Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 md:p-8 bg-black/20">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                {/* General Settings */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/10 pb-2">General</h3>

                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-white/10 bg-black/40 p-4">
                        <div className="space-y-1">
                          <FormLabel className="text-sm font-bold text-white">Bot Engine State</FormLabel>
                          <FormDescription className="text-xs text-slate-400">
                            Enable to allow live execution.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="data-[state=checked]:bg-green-500"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold text-slate-300">Strategy Name</FormLabel>
                        <FormControl>
                          <Input className="bg-black/40 border-white/10 focus-visible:ring-primary text-sm h-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="instruments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold text-slate-300">Instruments (CSV)</FormLabel>
                        <FormControl>
                          <Input className="bg-black/40 border-white/10 focus-visible:ring-primary font-mono text-sm h-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Risk Management */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/10 pb-2">Risk Limits</h3>

                  <FormField
                    control={form.control}
                    name="maxPositions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold text-slate-300">Max Concurrent Positions</FormLabel>
                        <FormControl>
                          <Input type="number" className="bg-black/40 border-white/10 focus-visible:ring-primary font-mono text-sm h-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="riskPerTrade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold text-slate-300">Risk Per Trade (%)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" className="bg-black/40 border-white/10 focus-visible:ring-primary font-mono text-sm h-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="stopLossPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-slate-300">Stop Loss (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="bg-black/40 border-red-500/30 text-red-500 focus-visible:ring-red-500 font-mono text-sm h-10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="takeProfitPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-slate-300">Take Profit (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" className="bg-black/40 border-green-500/30 text-green-500 focus-visible:ring-green-500 font-mono text-sm h-10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Operational Hours */}
                <div className="space-y-6 md:col-span-2 pt-4">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/10 pb-2">Operational Window</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <FormField
                      control={form.control}
                      name="tradingHoursStart"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-slate-300">Session Start (HH:MM)</FormLabel>
                          <FormControl>
                            <Input className="bg-black/40 border-white/10 focus-visible:ring-primary font-mono text-sm h-10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tradingHoursEnd"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-slate-300">Session End (HH:MM)</FormLabel>
                          <FormControl>
                            <Input className="bg-black/40 border-white/10 focus-visible:ring-primary font-mono text-sm h-10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-white/10 flex justify-end">
                <Button
                  type="submit"
                  disabled={updateStrategy.isPending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-6 text-sm tracking-wider uppercase transition-all duration-300"
                >
                  {updateStrategy.isPending ? "Saving..." : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Commit Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
