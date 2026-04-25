import { useState, useEffect, useRef } from 'react';
import { useGetBars } from '@/lib/api-client';
import type { OhlcBar } from '@/lib/api-client';

export interface CandleBar {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const toCandle = (bar: OhlcBar): CandleBar => ({
  time: Math.floor(new Date(bar.timestamp).getTime() / 1000),
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: (bar.upVolume || 0) + (bar.downVolume || 0),
});

const getWsUrl = (): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

export function useChartData(symbol: string) {
  const [bars, setBars] = useState<CandleBar[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: historicalBars } = useGetBars({ symbol }, {
    query: { queryKey: [`/api/bars`, { symbol }], staleTime: 30_000, refetchOnWindowFocus: false }
  });

  // Load historical bars on mount
  useEffect(() => {
    if (!historicalBars || historicalBars.length === 0) return;
    const candles = historicalBars.map(toCandle);
    candles.sort((a, b) => a.time - b.time);
    setBars(candles);
  }, [historicalBars]);

  // Real-time bar updates via WebSocket
  useEffect(() => {
    let active = true;

    const connect = () => {
      if (!active) return;
      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.type !== 'bar-update' || !msg.data) return;

            const charts: Array<{ id: number; td: boolean; bars: OhlcBar[] }> =
              msg.data.charts || [];

            for (const chart of charts) {
              if (!Array.isArray(chart.bars)) continue;
              const incoming = chart.bars.map(toCandle);
              setBars(prev => {
                let next = [...prev];
                for (const bar of incoming) {
                  const idx = next.findIndex(b => b.time === bar.time);
                  if (idx >= 0) {
                    next[idx] = bar;
                  } else {
                    next.push(bar);
                    if (next.length > 500) next = next.slice(-500);
                  }
                }
                next.sort((a, b) => a.time - b.time);
                return next;
              });
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          if (!active) return;
          reconnectTimer.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => ws.close();
      } catch {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { bars };
}
