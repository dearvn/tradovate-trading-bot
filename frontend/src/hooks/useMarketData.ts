import { useState, useEffect, useRef } from 'react';

interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  direction: 'up' | 'down' | 'neutral';
  isLive: boolean;
  rsi: number | null;
  wma11: number | null;
  wma48: number | null;
  wma200: number | null;
  atr: number | null;
  trend: 'up' | 'down' | 'neutral';
  macd_bull: boolean;
  macd_bear: boolean;
  order_type: string | null;
}

const getWsUrl = (): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In dev (Vite proxy), connect via /ws path; in production same host serves WS
  return `${protocol}//${window.location.host}/ws`;
};

export function useMarketData(): MarketData {
  const [data, setData] = useState<MarketData>({
    symbol: 'ES',
    price: 0,
    change: 0,
    changePercent: 0,
    direction: 'neutral',
    isLive: false,
    rsi: null,
    wma11: null,
    wma48: null,
    wma200: null,
    atr: null,
    trend: 'neutral',
    macd_bull: false,
    macd_bear: false,
    order_type: null,
  });

  const baselineRef = useRef<number>(0);
  const prevPriceRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    const connect = () => {
      if (!active) return;

      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          // Request latest snapshot immediately after connecting
          ws.send(JSON.stringify({ command: 'latest', data: {} }));
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            const msg = JSON.parse(event.data as string);

            // price-tick: lightweight update on every TradingView tick
            if (msg.type === 'price-tick' && msg.data) {
              const d = msg.data;
              if (!d.price) return;

              if (!baselineRef.current) baselineRef.current = d.price;
              const change = d.price - baselineRef.current;
              const changePercent = baselineRef.current
                ? (change / baselineRef.current) * 100
                : 0;
              const direction: 'up' | 'down' | 'neutral' =
                d.price > prevPriceRef.current
                  ? 'up'
                  : d.price < prevPriceRef.current
                  ? 'down'
                  : 'neutral';
              prevPriceRef.current = d.price;

              setData(prev => ({
                ...prev,
                price: d.price,
                change,
                changePercent,
                direction,
                isLive: true,
                symbol: d.symbol?.includes('NQ') ? 'NQ' : 'ES',
                trend: d.trend ?? prev.trend,
                order_type: d.order_type ?? prev.order_type,
              }));
              return;
            }

            // price-update: full indicator snapshot on candle close
            if (msg.type === 'price-update' && msg.data) {
              const d = msg.data;
              if (!d.price) return;

              if (!baselineRef.current) baselineRef.current = d.price;
              const change = d.price - baselineRef.current;
              const changePercent = baselineRef.current
                ? (change / baselineRef.current) * 100
                : 0;
              const direction: 'up' | 'down' | 'neutral' =
                d.price > prevPriceRef.current
                  ? 'up'
                  : d.price < prevPriceRef.current
                  ? 'down'
                  : 'neutral';
              prevPriceRef.current = d.price;

              setData({
                symbol: d.symbol?.includes('NQ') ? 'NQ' : 'ES',
                price: d.price,
                change,
                changePercent,
                direction,
                isLive: true,
                rsi: d.rsi ?? null,
                wma11: d.wma11 ?? null,
                wma48: d.wma48 ?? null,
                wma200: d.wma200 ?? null,
                atr: d.atr ?? null,
                trend: d.trend ?? 'neutral',
                macd_bull: d.macd_bull ?? false,
                macd_bear: d.macd_bear ?? false,
                order_type: d.order_type ?? null,
              });
            }
          } catch {
            // ignore JSON parse errors
          }
        };

        ws.onclose = () => {
          if (!active) return;
          setData(prev => ({ ...prev, isLive: false }));
          reconnectTimer.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
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

  return data;
}
