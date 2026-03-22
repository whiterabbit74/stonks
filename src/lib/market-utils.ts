/** Returns true if NYSE is currently in regular trading hours (9:30–16:00 ET, weekdays). */
export function getIsMarketOpen(): boolean {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  const t = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
  const [h, m] = t.split(':').map(Number);
  const mins = h * 60 + m;
  return !['Saturday', 'Sunday'].includes(day) && mins >= 9 * 60 + 30 && mins < 16 * 60;
}
