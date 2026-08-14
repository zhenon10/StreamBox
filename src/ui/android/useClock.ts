import { useEffect, useState } from 'react';

export function useClock(locale: string): string {
  const [now, setNow] = useState(() => formatClock(new Date(), locale));

  useEffect(() => {
    const tick = (): void => setNow(formatClock(new Date(), locale));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [locale]);

  return now;
}

function formatClock(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale === 'tr' ? 'tr-TR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
