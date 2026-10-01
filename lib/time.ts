/** India Standard Time helpers. IST is UTC+05:30 with no daylight saving. */
export const IST_OFFSET_MS = 330 * 60_000;

export function istParts(date: Date) {
  const t = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth(), day: t.getUTCDate(), weekday: t.getUTCDay(), hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}

/** The instant of `hour:minute` IST on the IST calendar day `dayOffset` days from `anchor`. */
export function istAt(anchor: Date, dayOffset: number, hour = 0, minute = 0, second = 0): Date {
  const p = istParts(anchor);
  return new Date(Date.UTC(p.year, p.month, p.day + dayOffset, hour, minute, second) - IST_OFFSET_MS);
}

/** Start of the IST calendar day containing `date`. */
export function istStartOfDay(date: Date): Date {
  return istAt(date, 0);
}
