import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Link2Off, User, Clock, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { customFetch } from "@/lib/api-client/custom-fetch";

type OAuthStatus = {
  connected: boolean;
  user: { name: string; ID: number; status: string } | null;
  expiration: string | null;
};

const getOAuthStatus = (): Promise<OAuthStatus> =>
  customFetch<OAuthStatus>("/api/tradovate/oauth/status", { method: "GET" });

const disconnectTradovate = (): Promise<{ disconnected: boolean }> =>
  customFetch<{ disconnected: boolean }>("/api/tradovate/oauth/disconnect", { method: "DELETE" });

export default function ConnectAccount() {
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const justConnected = searchParams.get("connected") === "true";
  const oauthError = searchParams.get("error");

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["/api/tradovate/oauth/status"],
    queryFn: getOAuthStatus,
    refetchInterval: 30000,
  });

  const disconnect = useMutation({
    mutationFn: disconnectTradovate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tradovate/oauth/status"] });
    },
  });

  // Clean URL after OAuth redirect (remove ?connected=true or ?error=...)
  useEffect(() => {
    if ((justConnected || oauthError) && typeof window !== "undefined") {
      window.history.replaceState({}, "", "/connect");
    }
  }, [justConnected, oauthError]);

  const handleConnect = () => {
    window.location.href = "/api/tradovate/oauth/start";
  };

  const formatExpiry = (expiration: string | null) => {
    if (!expiration) return "—";
    const d = new Date(expiration);
    return d.toLocaleString();
  };

  const isConnected = status?.connected ?? false;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect Tradovate Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Authorize the bot to trade on your behalf using Tradovate's secure OAuth login.
          No passwords are stored.
        </p>
      </div>

      {/* OAuth result banners */}
      {justConnected && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Successfully connected to Tradovate.
        </div>
      )}
      {oauthError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Connection failed: {decodeURIComponent(oauthError)}
        </div>
      )}

      {/* Connection status card */}
      <Card className="bg-black/40 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {isConnected
              ? <Link2 className="w-4 h-4 text-green-400" />
              : <Link2Off className="w-4 h-4 text-muted-foreground" />
            }
            Account Status
          </CardTitle>
          <CardDescription>
            {isConnected ? "Your Tradovate account is connected and active." : "No account connected."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Checking connection…</div>
          ) : isConnected && status?.user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{status.user.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {status.user.ID}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    status.user.status === "Active"
                      ? "border-green-500/40 text-green-400"
                      : "border-yellow-500/40 text-yellow-400"
                  }
                >
                  {status.user.status}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Token expires: {formatExpiry(status.expiration)}
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => refetch()}
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                >
                  <Link2Off className="w-3 h-3" />
                  {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={handleConnect} className="gap-2">
              <Link2 className="w-4 h-4" />
              Connect with Tradovate
            </Button>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="bg-black/40 border-white/10">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Click <strong className="text-foreground">Connect with Tradovate</strong> — you'll be taken to Tradovate's secure login page.</p>
          <p>2. Log in with your Tradovate credentials and approve the bot's access.</p>
          <p>3. You're redirected back here. The bot receives an access token and can trade on your behalf.</p>
          <p className="pt-1 text-xs">
            Your username and password are entered directly on Tradovate's website and are never seen by this bot.
            Only an <span className="text-foreground font-mono">accessToken</span> is stored in Redis cache.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
