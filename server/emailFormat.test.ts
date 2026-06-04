import { describe, it, expect } from "vitest";
import { plainTextToHtml } from "@shared/emailFormat";

describe("plainTextToHtml", () => {
  it("should return HTML as-is if already contains HTML tags", () => {
    const html = "<p>Hello world</p><ul><li>Item</li></ul>";
    expect(plainTextToHtml(html)).toBe(html);
  });

  it("should convert plain text lines to <p> tags", () => {
    const text = "Hello John,\nI wanted to reach out.";
    const result = plainTextToHtml(text);
    expect(result).toContain('<p style="margin:0 0 8px 0;">Hello John,</p>');
    expect(result).toContain('<p style="margin:0 0 8px 0;">I wanted to reach out.</p>');
  });

  it("should convert empty lines to <br/> tags", () => {
    const text = "Line 1\n\nLine 2";
    const result = plainTextToHtml(text);
    expect(result).toContain("<br/>");
  });

  it("should wrap bullet points in proper <ul><li> structure", () => {
    const text = "Benefits:\n• Save 10 hours per week\n• Reduce costs by 40%\n• Scale faster";
    const result = plainTextToHtml(text);
    expect(result).toContain("<ul");
    expect(result).toContain("</ul>");
    expect(result).toContain("<li");
    expect(result).toContain("Save 10 hours per week");
    expect(result).toContain("Reduce costs by 40%");
    expect(result).toContain("Scale faster");
  });

  it("should close list when non-bullet line follows bullets", () => {
    const text = "• Point 1\n• Point 2\nRegular text after";
    const result = plainTextToHtml(text);
    // The </ul> should come before the regular text paragraph
    const ulClose = result.indexOf("</ul>");
    const regularP = result.indexOf("Regular text after");
    expect(ulClose).toBeLessThan(regularP);
  });

  it("should handle mixed content: text, bullets, text", () => {
    const text = "Hi there,\n\nHere's what we offer:\n• Fast delivery\n• Great support\n\nLet me know if interested.";
    const result = plainTextToHtml(text);
    
    // Should have paragraphs
    expect(result).toContain('<p style="margin:0 0 8px 0;">Hi there,</p>');
    // Should have list
    expect(result).toContain("<ul");
    expect(result).toContain("Fast delivery");
    expect(result).toContain("Great support");
    // Should have closing paragraph
    expect(result).toContain("Let me know if interested.");
    // Should NOT have nested or malformed HTML
    expect(result).not.toContain("<li><li");
  });

  it("should not produce <li> without wrapping <ul>", () => {
    const text = "• Item 1\n• Item 2";
    const result = plainTextToHtml(text);
    const firstLi = result.indexOf("<li");
    const ulOpen = result.indexOf("<ul");
    expect(ulOpen).toBeLessThan(firstLi);
  });

  it("should handle a real Claude-generated email", () => {
    const text = `Hi Sarah,

I noticed TechFlow is growing fast — congrats on the recent funding round.

Here's how we've helped similar SaaS companies:

• Reduced churn by 35% in 90 days for DataPipe
• Saved $120k/year in support costs for CloudSync
• Increased NPS from 32 to 67 for MetricHub

Would a quick 15-minute call make sense to explore this?

Book a time here: https://calendly.com/nitin-virtualassistant/30min

Best,
Nitin`;
    const result = plainTextToHtml(text);
    
    // Valid structure
    expect(result).toContain("<ul");
    expect(result).toContain("</ul>");
    expect(result).toContain("Reduced churn by 35%");
    expect(result).toContain("calendly.com");
    // No orphan <li> tags
    const liCount = (result.match(/<li/g) || []).length;
    const ulCount = (result.match(/<ul/g) || []).length;
    expect(ulCount).toBeGreaterThanOrEqual(1);
    expect(liCount).toBe(3);
  });
});
