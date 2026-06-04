import { describe, expect, it } from "vitest";
import { getFollowUpCallScheduleDescription, getFollowUpEmailScheduleDescription, normalizePhoneNumber } from "./_core/followUpScheduler";

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
