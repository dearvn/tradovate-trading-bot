import { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts';
import type { CandleBar } from '@/hooks/useChartData';

interface CandlestickChartProps {
  bars: CandleBar[];
  currentPrice?: number;
  className?: string;
}

const CHART_THEME = {
  background: '#070c14',
  text: '#94a3b8',
  grid: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  upColor: '#22c55e',
  downColor: '#ef4444',
  upVolume: 'rgba(34,197,94,0.35)',
  downVolume: 'rgba(239,68,68,0.35)',
  wma11: '#f59e0b',   // amber — fast
  wma48: '#60a5fa',   // blue — medium
  wma200: '#f43f5e',  // rose — slow trend
};

function calcWMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const weightSum = (period * (period + 1)) / 2;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let wma = 0;
    for (let j = 0; j < period; j++) wma += closes[i - period + 1 + j] * (j + 1);
    result.push(wma / weightSum);
  }
  return result;
}

function toLineData(values: (number | null)[], times: Time[]): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) out.push({ time: times[i], value: values[i] as number });
  }
  return out;
}

export function CandlestickChart({ bars, currentPrice, className }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const wma11Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const wma48Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const wma200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);
  const initialFitDone = useRef(false);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    chartRef.current = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_THEME.background },
        textColor: CHART_THEME.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_THEME.grid },
        horzLines: { color: CHART_THEME.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: CHART_THEME.border,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: CHART_THEME.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    candleSeriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: CHART_THEME.upColor,
      downColor: CHART_THEME.downColor,
      borderVisible: false,
      wickUpColor: CHART_THEME.upColor,
      wickDownColor: CHART_THEME.downColor,
    });

    volumeSeriesRef.current = chartRef.current.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chartRef.current.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    const lineOpts = {
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      lineWidth: 1 as const,
    };

    wma11Ref.current = chartRef.current.addSeries(LineSeries, {
      ...lineOpts,
      color: CHART_THEME.wma11,
      title: 'W11',
    });
    wma48Ref.current = chartRef.current.addSeries(LineSeries, {
      ...lineOpts,
      color: CHART_THEME.wma48,
      title: 'W48',
    });
    wma200Ref.current = chartRef.current.addSeries(LineSeries, {
      ...lineOpts,
      lineWidth: 2,
      color: CHART_THEME.wma200,
      title: 'W200',
    });

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      chartRef.current?.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      initialFitDone.current = false;
    };
  }, []);

  useEffect(() => {
    const cleanup = initChart();
    return cleanup;
  }, [initChart]);

  // Load / update bars + WMA overlay
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || bars.length === 0) return;

    const times = bars.map(b => b.time as Time);
    const closes = bars.map(b => b.close);

    const candleData: CandlestickData<Time>[] = bars.map(b => ({
      time: b.time as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const volumeData: HistogramData<Time>[] = bars.map(b => ({
      time: b.time as Time,
      value: b.volume,
      color: b.close >= b.open ? CHART_THEME.upVolume : CHART_THEME.downVolume,
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    wma11Ref.current?.setData(toLineData(calcWMA(closes, 11), times));
    wma48Ref.current?.setData(toLineData(calcWMA(closes, 48), times));
    wma200Ref.current?.setData(toLineData(calcWMA(closes, 200), times));

    if (!initialFitDone.current) {
      chartRef.current?.timeScale().fitContent();
      initialFitDone.current = true;
    } else {
      chartRef.current?.timeScale().scrollToRealTime();
    }
  }, [bars]);

  // Live price tick — update last candle + price line
  useEffect(() => {
    if (!candleSeriesRef.current || !currentPrice || bars.length === 0) return;

    const last = bars[bars.length - 1];
    candleSeriesRef.current.update({
      time: last.time as Time,
      open: last.open,
      high: Math.max(last.high, currentPrice),
      low: Math.min(last.low, currentPrice),
      close: currentPrice,
    });

    if (!priceLineRef.current) {
      priceLineRef.current = candleSeriesRef.current.createPriceLine({
        price: currentPrice,
        color: 'rgba(148,163,184,0.6)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      });
    } else {
      priceLineRef.current.applyOptions({ price: currentPrice });
    }
  }, [currentPrice, bars]);

  const isEmpty = bars.length === 0;

  return (
    <div className={`relative w-full h-full ${className ?? ''}`}>
      <div ref={containerRef} className="w-full h-full" />
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
          <span className="text-primary font-mono text-[10px] tracking-widest opacity-60">
            AWAITING MARKET DATA...
          </span>
        </div>
      )}
    </div>
  );
}
