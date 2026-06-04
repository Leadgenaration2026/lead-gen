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
3. BULLET POINT FORMAT — Always include 2-4 bullet points using the • character to highlight key benefits or points. This makes the email scannable.
4. CLEAR CTA — End with ONE clear call-to-action (booking a call).
5. NO FLUFF — No "I hope this email finds you well", no "I wanted to reach out", no generic pleasantries.
6. LOWERCASE SUBJECT — Subject lines are all lowercase, under 40 characters, curiosity-driven.
7. PERSONALIZED — Reference something specific about the recipient or their company.

Email Style: ${typeGuidance}

${variableInstructions}

FORMAT: Write the email body as PLAIN TEXT. Use line breaks for paragraphs. Use • (bullet character) at the start of lines for bullet points. Do NOT use any HTML tags. Do NOT use markdown formatting. Just plain readable text.

IMPORTANT: The email must feel like it was written by a human who genuinely wants to help, not by a marketer trying to sell something.`;

  const userPrompt = `Write a cold outreach email based on this description:

"${params.prompt}"${companyInfo}${leadInfo}

Return ONLY a JSON object with exactly two fields:
- "subject": the email subject line (lowercase, under 40 chars, no quotes)
- "body": the email body as PLAIN TEXT (use \\n for line breaks, • for bullet points, NO HTML)

Example format:
{"subject": "quick thought about your growth", "body": "Hi {{ownerName}},\\n\\nI noticed {{companyName}} is growing fast in {{industry}}. Most companies at your stage struggle with lead generation — here's how we help:\\n\\n• We generate 50+ qualified leads per week on autopilot\\n• Our clients see 3x more booked calls within 30 days\\n• Zero long-term contracts — cancel anytime\\n\\nWould you be open to a quick 15-min chat to see if this fits?\\n\\nBook a time here: {{ctaLink}}\\n\\nBest,\\nNitin"}`;

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

  // Ensure bullet points exist (plain text • bullets)
  if (!emailBody.includes("•")) {
    // Insert some bullet points if Claude missed them
    const lines = emailBody.split("\n");
    const insertIdx = Math.min(3, lines.length - 1);
    const bullets = "\n• Key benefit we deliver\n• Proven results with similar companies\n• No risk to try\n";
    lines.splice(insertIdx, 0, bullets);
    emailBody = lines.join("\n");
  }

  // Ensure CTA link is present
  const ctaTarget = params.includeVariables ? "{{ctaLink}}" : "https://calendly.com/nitin-virtualassistant/30min";
  if (!emailBody.includes(ctaTarget) && !emailBody.includes("calendly.com") && !emailBody.includes("{{ctaLink}}")) {
    emailBody += `\n\nBook a quick chat: ${ctaTarget}`;
  }

  return {
    subject,
    body: emailBody,
    generatedBy: "claude",
    model: modelUsed,
  };
}
