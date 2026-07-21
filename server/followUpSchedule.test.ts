import { describe, expect, it } from "vitest";
import { getFollowUpCallScheduleDescription, getFollowUpEmailScheduleDescription, normalizePhoneNumber, getHourInTimezone, easternDateAtHour, nextEasternBusinessSlot } from "./_core/followUpScheduler";

function fmtEastern(d: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(d);
}

describe("Follow-Up Email Schedule", () => {
  it("should have exactly 7 follow-up emails", () => {
    const schedule = getFollowUpEmailScheduleDescription();
    expect(schedule.totalEmails).toBe(7);
    expect(schedule.schedule).toHaveLength(7);
  });

  it("should send first 3 emails every 2 days", () => {
    const schedule = getFollowUpEmailScheduleDescription();
    expect(schedule.schedule[0].dayOffset).toBe(2);
    expect(schedule.schedule[1].dayOffset).toBe(4);
    expect(schedule.schedule[2].dayOffset).toBe(6);
  });

  it("should send remaining 4 emails every 5 days after the 3rd", () => {
    const schedule = getFollowUpEmailScheduleDescription();
    expect(schedule.schedule[3].dayOffset).toBe(11); // 6 + 5
    expect(schedule.schedule[4].dayOffset).toBe(16); // 11 + 5
    expect(schedule.schedule[5].dayOffset).toBe(21); // 16 + 5
    expect(schedule.schedule[6].dayOffset).toBe(26); // 21 + 5
  });

  it("should have correct email types in sequence", () => {
    const schedule = getFollowUpEmailScheduleDescription();
    expect(schedule.schedule[0].emailType).toBe("discovery");
    expect(schedule.schedule[1].emailType).toBe("value_prop");
    expect(schedule.schedule[2].emailType).toBe("social_proof");
    expect(schedule.schedule[3].emailType).toBe("urgency");
  });
});

describe("Follow-Up Call Schedule", () => {
  it("should have 8 total calls in the schedule (initial + 7 follow-ups)", () => {
    const schedule = getFollowUpCallScheduleDescription();
    expect(schedule.totalCalls).toBe(7);
    expect(schedule.schedule).toHaveLength(8); // Initial + 7 follow-up calls
  });

  it("should have the initial call as call #1 triggered on email open/click", () => {
    const schedule = getFollowUpCallScheduleDescription();
    expect(schedule.schedule[0].callNumber).toBe(1);
    expect(schedule.schedule[0].label).toBe("Initial Call");
    expect(schedule.schedule[0].timing).toContain("open/click");
  });

  it("should schedule calls 1 day after each follow-up email", () => {
    const schedule = getFollowUpCallScheduleDescription();
    // Call #2 on Day 3 (day after email 1 on Day 2)
    expect(schedule.schedule[1].label).toContain("Day 3");
    // Call #3 on Day 5 (day after email 2 on Day 4)
    expect(schedule.schedule[2].label).toContain("Day 5");
    // Call #4 on Day 7 (day after email 3 on Day 6)
    expect(schedule.schedule[3].label).toContain("Day 7");
  });

  it("should include a note about stopping when client picks up", () => {
    const schedule = getFollowUpCallScheduleDescription();
    expect(schedule.note).toContain("picks up");
  });
});

describe("Phone Number Normalization", () => {
  it("should normalize US phone with parentheses and dashes", () => {
    expect(normalizePhoneNumber("+1(571)470-6684")).toBe("+15714706684");
  });

  it("should normalize phone with dashes", () => {
    expect(normalizePhoneNumber("+1-877-263-6150")).toBe("+18772636150");
  });

  it("should add +1 for 10-digit US numbers", () => {
    expect(normalizePhoneNumber("5714706684")).toBe("+15714706684");
  });

  it("should keep already-normalized numbers unchanged", () => {
    expect(normalizePhoneNumber("+15714706684")).toBe("+15714706684");
  });

  it("should handle 11-digit numbers starting with 1", () => {
    expect(normalizePhoneNumber("18772636150")).toBe("+18772636150");
  });

  it("should handle empty string", () => {
    expect(normalizePhoneNumber("")).toBe("");
  });
});

describe("Eastern Time hour extraction (getHourInTimezone)", () => {
  it("correctly reads midnight as hour 0, not 24 (regression: hour12: false alone can render midnight as '24' depending on ICU locale data, silently breaking any hour < 10 comparison)", () => {
    // 2026-07-16T04:00:00Z is exactly midnight Eastern (EDT, UTC-4) in summer
    expect(getHourInTimezone(new Date("2026-07-16T04:00:00Z"), "America/New_York")).toBe(0);
  });

  it("reads standard daytime hours correctly", () => {
    expect(getHourInTimezone(new Date("2026-07-15T18:00:00Z"), "America/New_York")).toBe(14); // 2 PM EDT
  });
});

describe("Eastern business-hours scheduling (easternDateAtHour / nextEasternBusinessSlot)", () => {
  it("builds 10 AM and 6 PM Eastern correctly in winter (EST, UTC-5)", () => {
    const base = new Date("2026-01-15T12:00:00Z");
    expect(fmtEastern(easternDateAtHour(base, 0, 10))).toContain("10:00 AM");
    expect(fmtEastern(easternDateAtHour(base, 0, 18))).toContain("6:00 PM");
  });

  it("builds 10 AM and 6 PM Eastern correctly in summer (EDT, UTC-4)", () => {
    const base = new Date("2026-07-15T12:00:00Z");
    expect(fmtEastern(easternDateAtHour(base, 0, 10))).toContain("10:00 AM");
    expect(fmtEastern(easternDateAtHour(base, 0, 18))).toContain("6:00 PM");
  });

  it("is correct across the US spring-forward DST transition", () => {
    // Mar 8, 2026 is when US clocks spring forward -- by noon UTC that day
    // Eastern has already switched to EDT.
    const base = new Date("2026-03-08T12:00:00Z");
    expect(fmtEastern(easternDateAtHour(base, 0, 10))).toContain("10:00 AM");
  });

  it("leaves a time already inside the 10 AM - 6 PM Eastern window unchanged", () => {
    const midday = new Date("2026-07-15T18:02:00Z"); // 2:02 PM EDT
    expect(nextEasternBusinessSlot(midday)).toEqual(midday);
  });

  it("rolls a time before 10 AM Eastern forward to 10 AM the SAME day (regression: midnight misread as hour 24 previously rolled this to the wrong day)", () => {
    const earlyMorning = new Date("2026-07-15T13:00:00Z"); // 9:00 AM EDT
    expect(fmtEastern(nextEasternBusinessSlot(earlyMorning))).toBe("Jul 15, 2026, 10:00 AM");

    const midnight = new Date("2026-07-16T04:02:00Z"); // 12:02 AM EDT
    expect(fmtEastern(nextEasternBusinessSlot(midnight))).toBe("Jul 16, 2026, 10:00 AM");
  });

  it("rolls a time at/after 6 PM Eastern forward to 10 AM the NEXT day", () => {
    const pastWindow = new Date("2026-07-15T22:05:00Z"); // 6:05 PM EDT
    expect(fmtEastern(nextEasternBusinessSlot(pastWindow))).toBe("Jul 16, 2026, 10:00 AM");

    const exactlySix = new Date("2026-07-15T22:00:00Z"); // 6:00 PM EDT (boundary, excluded)
    expect(fmtEastern(nextEasternBusinessSlot(exactlySix))).toBe("Jul 16, 2026, 10:00 AM");
  });

  it("keeps a time exactly at 10 AM Eastern unchanged (boundary, included)", () => {
    const exactlyTen = new Date("2026-07-15T14:00:00Z"); // 10:00 AM EDT
    expect(nextEasternBusinessSlot(exactlyTen)).toEqual(exactlyTen);
  });
});
