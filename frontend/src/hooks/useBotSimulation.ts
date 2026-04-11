import { useState, useEffect } from 'react';

export function useBotSimulation() {
  const [riskUsagePercent, setRiskUsagePercent] = useState(65);

  useEffect(() => {
    const interval = setInterval(() => {
      setRiskUsagePercent(prev => {
        const delta = (Math.random() * 6 - 3);
        let next = prev + delta;
        if (next < 0) next = 0;
        if (next > 100) next = 100;
        return next;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  let riskUsageColor = 'amber';
  if (riskUsagePercent < 50) riskUsageColor = 'green';
  else if (riskUsagePercent > 80) riskUsageColor = 'red';

  return { riskUsagePercent, riskUsageColor };
}
