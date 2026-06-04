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
    expect(result).toContain("Hello John,</p>");
    expect(result).toContain("I wanted to reach out.</p>");
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
    expect(result).toContain("Hi there,</p>");
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

  it("should convert **bold** markers to <strong> tags", () => {
    const text = "• 🚀 **50+ qualified leads** generated on autopilot\n• 📈 **3x more booked calls** within 30 days";
    const result = plainTextToHtml(text);
    expect(result).toContain("<strong");
    expect(result).toContain("50+ qualified leads</strong>");
    expect(result).toContain("3x more booked calls</strong>");
  });

  it("should style CTA lines with 👉 emoji as prominent text", () => {
    const text = "👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:";
    const result = plainTextToHtml(text);
    expect(result).toContain("font-weight:600");
    expect(result).toContain("👉");
  });

  it("should render 🗓️ booking link as a styled button", () => {
    const text = "🗓️ 30 Min Free Consultation: https://calendly.com/nitin-virtualassistant/30min";
    const result = plainTextToHtml(text);
    expect(result).toContain('<a href="https://calendly.com/nitin-virtualassistant/30min"');
    expect(result).toContain("background-color");
    expect(result).toContain("30 Min Free Consultation");
  });

  it("should handle a full enhanced email with icons, bold, and CTA", () => {
    const text = `Hi Sarah,

I noticed TechFlow is making waves in the SaaS space. Most companies at your stage struggle with lead generation — here's how we help:

• 🚀 **50+ qualified leads per week** generated on autopilot
• 📈 **3x more booked calls** within 30 days
• 💰 **Zero long-term contracts** — cancel anytime

We've helped dozens of SaaS businesses scale their outreach without hiring extra staff.

👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:
🗓️ 30 Min Free Consultation: https://calendly.com/nitin-virtualassistant/30min

Best,
Nitin`;
    const result = plainTextToHtml(text);
    
    // Valid structure
    expect(result).toContain("<ul");
    expect(result).toContain("</ul>");
    expect(result).toContain("<strong");
    expect(result).toContain("50+ qualified leads per week</strong>");
    expect(result).toContain("background-color");
    expect(result).toContain("calendly.com");
    // No orphan <li> tags
    const liCount = (result.match(/<li/g) || []).length;
    const ulCount = (result.match(/<ul/g) || []).length;
    expect(ulCount).toBeGreaterThanOrEqual(1);
    expect(liCount).toBe(3);
  });
});
