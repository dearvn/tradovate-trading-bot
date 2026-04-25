import { useState, useEffect, useRef } from 'react';

export interface OrderFlowData {
  contractId: string;
  cvd: number;
  pressure: number;
  regimeHint: 'EXPANDING_UP' | 'EXPANDING_DOWN' | 'PINNING' | 'FLAT' | null;
  sessionPhase: string | null;
  ts: number;
}

export interface VolProfileData {
  contractId: string;
  poc: number;
  vah: number;
  val: number;
  hvn: number[];
  lvn: number[];
  totalVolume: number;
  ts: number;
}

export interface RegimeData {
  contractId: string;
  regime: 'DEAD_PINNING' | 'SIDEWAY' | 'MIXED' | 'ACTION' | 'HARD_ACTION' | null;
  regimeHint: string | null;
  sessionPhase: string | null;
  pressure: number;
  slope: number;
  cvd: number;
  poc: number;
  vah: number;
  val: number;
  priceVsValueArea: 'ABOVE_VAH' | 'BELOW_VAL' | 'INSIDE_VA' | null;
  ts: number;
}

interface OrderFlowState {
  flow: OrderFlowData | null;
  profile: VolProfileData | null;
  regime: RegimeData | null;
}

const getWsUrl = (): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

export function useOrderFlow(): OrderFlowState {
  const [state, setState] = useState<OrderFlowState>({
    flow: null,
    profile: null,
    regime: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;

      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        let msg: { type: string; data: unknown };
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'order-flow' && msg.data) {
          setState(prev => ({ ...prev, flow: msg.data as OrderFlowData }));
        } else if (msg.type === 'vol-profile' && msg.data) {
          setState(prev => ({ ...prev, profile: msg.data as VolProfileData }));
        } else if (msg.type === 'regime' && msg.data) {
          setState(prev => ({ ...prev, regime: msg.data as RegimeData }));
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  return state;
}
