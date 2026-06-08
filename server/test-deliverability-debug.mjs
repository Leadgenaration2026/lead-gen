// Debug script to test deliverability check detection logic against typical AI-generated emails

// Simulate single email body (HTML format from generateAI)
const singleEmailBody = `<p>Hi John,</p><p>I noticed that your dental practice, Smile Dental Group, has been growing rapidly in the competitive dental industry.</p><ul><li>Save 20+ hours per week on patient scheduling</li><li>Reduce no-shows by 40% with automated reminders</li><li>Handle insurance verification at $6/hour</li></ul><p style="margin-top:16px;"><a href="https://calendly.com/nitin-virtualassistant/30min" style="color:#2563eb;font-weight:500;">Schedule a quick chat</a></p><div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:sans-serif;font-size:13px;color:#374151;line-height:1.5;"><strong>Nitin Sharma</strong><br/>Virtual Assistant Group</div>\n\n<p style="font-size:11px;color:#888;margin-top:24px;">If you'd like to opt out of future emails, simply reply with 'unsubscribe'.</p>`;

// Simulate bulk email body (plain text with variables from generateAITemplate + claude.ts)
const bulkEmailBody = `Hi {{ownerName}},

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
If you'd like to opt out of future emails, simply reply with 'unsubscribe'.`;

function testCheck(label, body) {
  console.log(`\n=== ${label} ===`);
  
  // Strip HTML tags
  const bodyTextOnly = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  console.log("First 200 chars of bodyTextOnly:", bodyTextOnly.substring(0, 200));
  
  // Name check
  const hasGreeting = /\b(hi|hello|hey|dear)\s+[A-Z][a-z]+/i.test(bodyTextOnly);
  const hasNameVariable = /\{\{\s*(ownerName|firstName|name|recipientName)\s*\}\}/i.test(body);
  const startsWithName = /^\s*(hi|hello|hey|dear)\b/i.test(bodyTextOnly.trim());
  console.log(`Name check: hasGreeting=${hasGreeting}, hasNameVariable=${hasNameVariable}, startsWithName=${startsWithName}`);
  console.log(`Name PASS: ${hasGreeting || hasNameVariable || startsWithName}`);
  
  // Company check
  const hasCompanyRef = /\b(your company|your team|your business|your organization|your firm|your agency|your practice|your clinic|your store|your shop)\b/i.test(bodyTextOnly) ||
    /\b(at [A-Z][a-zA-Z]+|with [A-Z][a-zA-Z]+)\b/.test(bodyTextOnly) ||
    /\{\{\s*(companyName|company|businessName)\s*\}\}/i.test(body) ||
    /\b(industry|sector|field|niche|market)\b/i.test(bodyTextOnly) ||
    /\b(companies like|businesses like|firms like|practices like|clinics like|agencies like)\b/i.test(bodyTextOnly) ||
    /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(bodyTextOnly);
  console.log(`Company PASS: ${hasCompanyRef}`);
  
  // Unsubscribe check
  const bodyLower = body.toLowerCase();
  const hasUnsubscribe = bodyLower.includes("unsubscribe") || bodyLower.includes("opt out") || bodyLower.includes("opt-out");
  console.log(`Unsubscribe PASS: ${hasUnsubscribe}`);
}

testCheck("SINGLE EMAIL (HTML)", singleEmailBody);
testCheck("BULK EMAIL (Plain text with variables)", bulkEmailBody);

// Now test with a MINIMAL email that might fail
const minimalSingle = `Hi Sarah,\n\nI wanted to discuss how we can help ABC Corp grow.\n\nBest regards`;
testCheck("MINIMAL SINGLE (plain text)", minimalSingle);

// Test with what the AI ACTUALLY generates - plain text that gets converted to HTML by plainTextToHtml
const typicalAIOutput = `Hi Michael,

Running a real estate brokerage like Premier Realty in today's market means juggling transaction coordination, lead follow-up, and compliance paperwork simultaneously.

Here's how we've helped similar real estate companies:

• 🚀 **Transaction coordination** — handle all paperwork from contract to close at $6/hour
• 📈 **Lead follow-up automation** — never miss a hot prospect again  
• 💰 **40% cost reduction** vs hiring full-time admin staff

A similar real estate firm in Phoenix saw 3x more closings within 60 days of partnering with us.

👉 Schedule a quick chat: https://calendly.com/nitin-virtualassistant/30min

Nitin Sharma
Virtual Assistant Group

If you'd like to opt out of future emails, simply reply with 'unsubscribe'.`;

testCheck("TYPICAL AI OUTPUT (before HTML conversion)", typicalAIOutput);
