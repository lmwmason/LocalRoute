// datetime-local is a wall-clock value. Do not convert itinerary KST through
// the browser's timezone, and never invent a missing date or visit time.
export function initialBookingDateTime(date?: string, time?: string): string {
  if (
    !date ||
    !time ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return "";
  return `${date}T${time}`;
}
