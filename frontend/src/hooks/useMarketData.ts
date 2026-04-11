import { useState, useEffect } from 'react';

export function useMarketData() {
  const [data, setData] = useState({
    symbol: 'NQ',
    price: 17915.25,
    change: 0,
    changePercent: 0,
    volume: 125430,
    direction: 'neutral' as 'up' | 'down' | 'neutral',
    isLive: true
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => {
        const delta = (Math.random() * 10 - 5);
        const newPrice = prev.price + delta;
        const change = newPrice - 17915.25;
        const changePercent = (change / 17915.25) * 100;

        return {
          ...prev,
          price: newPrice,
          change,
          changePercent,
          volume: prev.volume + Math.floor(Math.random() * 50),
          direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral'
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return data;
}
