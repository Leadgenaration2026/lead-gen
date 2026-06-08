import { runDeliverabilityChecks } from './deliverabilityChecks.ts';

// Test with a typical single email body (HTML)
const singleResult = await runDeliverabilityChecks({
  senderEmail: "nitin@virtualassistant-group.com",
  senderName: "Nitin Sharma",
  subject: "quick question about your dental practice",
  body: '<p>Hi John,</p><p>Running a dental practice like Smile Dental means juggling patient scheduling and insurance verification daily.</p><ul><li>Save 20+ hours/week</li></ul><p><a href="https://calendly.com/nitin-virtualassistant/30min">Schedule a quick chat</a></p><div style="margin-top:24px"><strong>Nitin Sharma</strong><br/>Virtual Assistant Group</div>\n\n<p style="font-size:11px;color:#888;margin-top:24px;">If you\'d like to opt out of future emails, simply reply with \'unsubscribe\'.</p>',
  smtpHost: "smtp.gmail.com",
});

console.log("\n=== SINGLE EMAIL RESULTS ===");
console.log("Score:", singleResult.score);
for (const check of singleResult.checks) {
  const icon = check.status === "pass" ? "✅" : check.status === "warning" ? "⚠️" : "❌";
  console.log(`${icon} [${check.category}] ${check.name}: ${check.message}`);
}

// Test with a typical bulk email body (plain text with variables)
const bulkResult = await runDeliverabilityChecks({
  senderEmail: "nitin@virtualassistant-group.com",
  senderName: "Nitin Sharma",
  subject: "quick thought about {{companyName}}",
  body: `Hi {{ownerName}},

I've been researching {{companyName}} and the challenges facing the {{industry}} industry right now.

Here are 3 ways we can help:

• 🚀 **Automated lead generation** — 50+ qualified leads per week
• 📈 **3x more booked calls** within 30 days
• 💰 **Starting at $6/hour** — no long-term contracts

We helped a similar {{industry}} company achieve 40% more efficiency in just 2 weeks.

👉 Click below to schedule your free 30-minute consultation:
🗓️ 30 Min Free Consultation: {{ctaLink}}

Let me know if you have any questions or concerns.

Thank you

Nitin Sharma
Virtual Assistant Group

---
If you'd like to opt out of future emails, simply reply with 'unsubscribe'.`,
  smtpHost: "smtp.gmail.com",
});

console.log("\n=== BULK EMAIL RESULTS ===");
console.log("Score:", bulkResult.score);
for (const check of bulkResult.checks) {
  const icon = check.status === "pass" ? "✅" : check.status === "warning" ? "⚠️" : "❌";
  console.log(`${icon} [${check.category}] ${check.name}: ${check.message}`);
}
