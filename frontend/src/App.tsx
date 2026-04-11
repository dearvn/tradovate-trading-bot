import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import TradeHistory from "@/pages/TradeHistory";
import StrategySettings from "@/pages/StrategySettings";
import Logs from "@/pages/Logs";
import ConnectAccount from "@/pages/ConnectAccount";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-sm">Page not found</p>
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/trade-history" component={TradeHistory} />
        <Route path="/strategy" component={StrategySettings} />
        <Route path="/logs" component={Logs} />
        <Route path="/connect" component={ConnectAccount} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
