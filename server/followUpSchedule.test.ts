import { describe, expect, it } from "vitest";
import { getFollowUpCallScheduleDescription } from "./_core/followUpScheduler";

describe("Follow-Up Call Schedule", () => {
  it("should have exactly 7 total calls in the schedule", () => {
    const schedule = getFollowUpCallScheduleDescription();
    expect(schedule.totalCalls).toBe(7);
    expect(schedule.schedule).toHaveLength(7);
  });

  it("should have the initial call as call #1", () => {
    const schedule = getFollowUpCallScheduleDescription();
    expect(schedule.schedule[0].callNumber).toBe(1);
    expect(schedule.schedule[0].label).toBe("Initial Call");
    expect(schedule.schedule[0].timing).toContain("immediately");
  });

  it("should have 2 calls on Day 3 (morning and afternoon)", () => {
    const schedule = getFollowUpCallScheduleDescription();
    const day3Calls = schedule.schedule.filter(s => s.label.includes("Day 3"));
    expect(day3Calls).toHaveLength(2);
    expect(day3Calls[0].timing).toBe("10:00 AM");
    expect(day3Calls[1].timing).toBe("3:00 PM");
  });

  it("should have 2 calls on Day 6 (morning and afternoon)", () => {
    const schedule = getFollowUpCallScheduleDescription();
    const day6Calls = schedule.schedule.filter(s => s.label.includes("Day 6"));
    expect(day6Calls).toHaveLength(2);
    expect(day6Calls[0].timing).toBe("10:00 AM");
    expect(day6Calls[1].timing).toBe("3:00 PM");
  });

  it("should have 2 calls on Day 12 (morning and afternoon)", () => {
    const schedule = getFollowUpCallScheduleDescription();
    const day12Calls = schedule.schedule.filter(s => s.label.includes("Day 12"));
    expect(day12Calls).toHaveLength(2);
    expect(day12Calls[0].timing).toBe("10:00 AM");
    expect(day12Calls[1].timing).toBe("3:00 PM");
  });

  it("should include a note about stopping when client picks up", () => {
    const schedule = getFollowUpCallScheduleDescription();
    expect(schedule.note).toContain("picks up");
  });

  it("should have correct call numbers in sequence", () => {
    const schedule = getFollowUpCallScheduleDescription();
    for (let i = 0; i < schedule.schedule.length; i++) {
      expect(schedule.schedule[i].callNumber).toBe(i + 1);
    }
  });
});
