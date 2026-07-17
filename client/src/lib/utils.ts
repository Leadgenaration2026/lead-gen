import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// All campaign/email scheduling pickers use Eastern Time (America/New_York),
// regardless of the browser's own local timezone, so a date/time typed into
// the picker means the same instant no matter where it's opened from.
const SCHEDULING_TIMEZONE = "America/New_York";

function partsToMap(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  return parts.reduce((acc: Record<string, string>, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
}

// Converts a wall-clock "YYYY-MM-DD" + "HH:mm" pair -- interpreted as Eastern
// Time -- into a UTC ISO string suitable for storage/sending to the backend.
export function easternDateTimeToISOString(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return "";
  // Guess: treat the wall-clock string as if it were already UTC.
  const naiveUTC = new Date(`${dateStr}T${timeStr}:00Z`);
  // See what that instant actually reads as in America/New_York.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULING_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = partsToMap(fmt.formatToParts(naiveUTC));
  const hour24 = parts.hour === "24" ? "00" : parts.hour;
  const readAsEastern = new Date(`${parts.year}-${parts.month}-${parts.day}T${hour24}:${parts.minute}:${parts.second}Z`);
  // The gap between our guess and how it actually reads in Eastern Time is the UTC offset (handles EST/EDT automatically).
  const offsetMs = naiveUTC.getTime() - readAsEastern.getTime();
  return new Date(naiveUTC.getTime() + offsetMs).toISOString();
}

// Splits a stored UTC ISO string back into the {date, time} a clock in
// Eastern Time would show, for populating the picker inputs.
export function isoStringToEasternDateTime(isoString: string): { date: string; time: string } {
  if (!isoString) return { date: "", time: "" };
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULING_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
  const parts = partsToMap(fmt.formatToParts(new Date(isoString)));
  const hour24 = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour24}:${parts.minute}` };
}

// Human-readable Eastern Time display for a stored UTC ISO string.
export function formatEasternDateTime(isoString: string): string {
  if (!isoString) return "";
  return new Date(isoString).toLocaleString("en-US", {
    timeZone: SCHEDULING_TIMEZONE,
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) + " ET";
}
