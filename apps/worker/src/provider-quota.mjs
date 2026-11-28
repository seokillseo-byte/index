export function googleQuotaDeferral({
  lastAttemptAt,
  dailyUsed,
  minuteUsed,
  dailyLimit,
  minuteLimit,
  dayStart,
}) {
  const lastAttempt = lastAttemptAt ? new Date(lastAttemptAt) : null;
  if (lastAttempt && lastAttempt >= dayStart) return 'daily';
  if (dailyUsed >= dailyLimit) return 'daily';
  if (minuteUsed >= minuteLimit) return 'minute';
  return null;
}
