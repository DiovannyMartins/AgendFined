// Keep integration bookings inside the configured plan window while leaving
// enough notice for the database-level booking validation.
const BASE_DATE = new Date();
BASE_DATE.setUTCDate(BASE_DATE.getUTCDate() + 7);
BASE_DATE.setUTCHours(12, 0, 0, 0);

export function futureSlot(dayOffset: number, hour: number, minute = 0): string {
  const slot = new Date(BASE_DATE);
  slot.setUTCDate(slot.getUTCDate() + dayOffset);
  slot.setUTCHours(hour, minute, 0, 0);
  return slot.toISOString();
}
