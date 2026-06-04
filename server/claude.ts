import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./_core/env";

const getClient = () => {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey: ENV.anthropicApiKey });
};

interface GenerateEmailParams {
  prompt: string;
  emailType?: "discovery" | "value_prop" | "social_proof" | "urgency" | "custom";
  companyContext?: string;
  leadContext?: string; // e.g., "Name: John, Company: Acme, Industry: Tech"
  includeVariables?: boolean;
}

interface GeneratedEmail {
  subject: string;
  body: string;
  generatedBy: "claude"; // Always "claude" to confirm source
  model: string;
}

export async function generateEmailWithClaude(params: GenerateEmailParams): Promise<GeneratedEmail> {
  const client = getClient();
  const modelUsed = "claude-sonnet-4-6";

  const emailTypeGuidance: Record<string, string> = {
    discovery: "Focus on understanding their challenges. Ask an insightful question about their business. Be curious, not salesy.",
    value_prop: "Highlight specific benefits and outcomes. Focus on ROI and measurable results. Use concrete numbers.",
    social_proof: "Reference case studies or success stories. Use specific numbers and outcomes from similar companies.",
    urgency: "Create time-sensitivity without being pushy. Mention limited availability or upcoming deadlines naturally.",
    custom: "Follow the user's instructions precisely while maintaining professional tone.",
  };

  const typeGuidance = params.emailType ? emailTypeGuidance[params.emailType] : emailTypeGuidance["value_prop"];

  const variableInstructions = params.includeVariables
    ? `Use these template variables in the email:
- {{ownerName}} for the recipient's first name
- {{companyName}} for their company name
- {{industry}} for their industry
- {{ctaLink}} for the call-to-action booking link
- {{email}} for their email address`
    : `CRITICAL: Do NOT use any template variables like {{ownerName}}, {{companyName}}, {{industry}}, {{ctaLink}}, or {{email}}. Write the email as a direct, ready-to-send message addressed generically (e.g., "Hi there" or use the lead's name if provided). Use "https://calendly.com/nitin-virtualassistant/30min" as the actual booking link URL.`;

  const leadInfo = params.leadContext
    ? `\n\nLead Information:\n${params.leadContext}`
    : "";

  const companyInfo = params.companyContext
    ? `\n\nYour Company/Service Context:\n${params.companyContext}`
    : "";

  const systemPrompt = `You are an expert cold email copywriter who writes emails that actually get replies. Your emails are:

1. PROFESSIONAL but HUMAN — They sound like a real person wrote them, not a robot. Use conversational language.
2. CONCISE — Maximum 5-7 sentences total. Every word earns its place.
3. BULLET POINT FORMAT with ICONS — Always include 2-4 bullet points. Each bullet point MUST start with a relevant emoji icon followed by the text. Make the key benefit/USP text BOLD using **double asterisks**. Examples:
   • 🚀 **50+ qualified leads per week** generated on autopilot
   • 📈 **3x more booked calls** within 30 days
   • 💰 **Zero long-term contracts** — cancel anytime
   • ⏱️ **Save 20+ hours per week** on manual outreach
4. CLEAR CTA — ALWAYS end with this exact CTA block:
   "👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:
   🗓️ 30 Min Free Consultation: [BOOKING_LINK]"
   Where [BOOKING_LINK] is either {{ctaLink}} (if using variables) or "https://calendly.com/nitin-virtualassistant/30min"
5. NO FLUFF — No "I hope this email finds you well", no "I wanted to reach out", no generic pleasantries.
6. LOWERCASE SUBJECT — Subject lines are all lowercase, under 40 characters, curiosity-driven.
7. PERSONALIZED — Reference something specific about the recipient or their company and their INDUSTRY.
8. INDUSTRY MENTION — Always reference the lead's industry naturally in the email body to show relevance.
9. NO SIGN-OFF — Do NOT include any closing like "Best,", "Regards,", "Cheers," or your name at the end. The email signature is appended automatically by the system. End the email with the CTA block and nothing else.

Email Style: ${typeGuidance}

${variableInstructions}

FORMAT: Write the email body as PLAIN TEXT with these formatting rules:
- Use line breaks for paragraphs
- Use • (bullet character) at the start of lines for bullet points
- Each bullet MUST start with an emoji icon (🚀, 📈, 💰, ⏱️, ✅, 🎯, 📊, 💡, 🔥, ⚡)
- Wrap key USP phrases in **double asterisks** for bold
- Do NOT use any HTML tags
- Do NOT use markdown headers or links
- Just plain readable text with emoji icons and **bold markers**

IMPORTANT: The email must feel like it was written by a human who genuinely wants to help, not by a marketer trying to sell something. Always include the industry context and the CTA booking link at the end.`;

  const userPrompt = `Write a cold outreach email based on this description:

"${params.prompt}"${companyInfo}${leadInfo}

Return ONLY a JSON object with exactly two fields:
- "subject": the email subject line (lowercase, under 40 chars, no quotes)
- "body": the email body as PLAIN TEXT (use \\n for line breaks, • for bullet points with emoji icons, **bold** for USPs, NO HTML)

Example format:
{"subject": "quick thought about your growth", "body": "Hi {{ownerName}},\\n\\nI noticed {{companyName}} is making waves in the {{industry}} space. Most companies at your stage struggle with lead generation — here's how we help:\\n\\n• 🚀 **50+ qualified leads per week** generated on autopilot\\n• 📈 **3x more booked calls** within 30 days\\n• 💰 **Zero long-term contracts** — cancel anytime\\n\\nWe've helped dozens of {{industry}} businesses scale their outreach without hiring extra staff.\\n\\n👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:\\n🗓️ 30 Min Free Consultation: {{ctaLink}}"}`;

  const response = await client.messages.create({
    model: modelUsed,
    max_tokens: 1024,
    messages: [
      { role: "user", content: userPrompt },
    ],
    system: systemPrompt,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return a text response");
  }

  // Parse the JSON response
  let rawText = textBlock.text.trim();
  
  // Handle case where Claude wraps in markdown code block
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(rawText);

  let emailBody = parsed.body || "";
  const subject = parsed.subject || "";

  // Ensure bullet points with icons exist
  if (!emailBody.includes("•")) {
    // Insert some bullet points if Claude missed them
    const lines = emailBody.split("\n");
    const insertIdx = Math.min(3, lines.length - 1);
    const bullets = "\n• 🚀 **Key benefit we deliver** for your business\n• 📈 **Proven results** with similar companies\n• 💰 **No risk to try** — cancel anytime\n";
    lines.splice(insertIdx, 0, bullets);
    emailBody = lines.join("\n");
  }

  // Strip any trailing sign-off that Claude might add despite instructions
  emailBody = emailBody.replace(/\n\n(?:Best|Regards|Cheers|Thanks|Warm regards|Kind regards|Sincerely)[,]?\n[\s\S]*$/, "");

  // Ensure CTA link is present with the required format
  const ctaTarget = params.includeVariables ? "{{ctaLink}}" : "https://calendly.com/nitin-virtualassistant/30min";
  if (!emailBody.includes("30 Min Free Consultation") && !emailBody.includes("free 30-minute consultation")) {
    emailBody += `\n\n👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:\n🗓️ 30 Min Free Consultation: ${ctaTarget}`;
  }

  return {
    subject,
    body: emailBody,
    generatedBy: "claude",
    model: modelUsed,
  };
}
