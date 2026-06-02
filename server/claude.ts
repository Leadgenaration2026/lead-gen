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
}

export async function generateEmailWithClaude(params: GenerateEmailParams): Promise<GeneratedEmail> {
  const client = getClient();

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
    : `CRITICAL: Do NOT use any template variables like {{ownerName}}, {{companyName}}, {{industry}}, {{ctaLink}}, or {{email}}. Write the email as a direct, ready-to-send message addressed generically (e.g., "Hi there" or "Hi [first name]"). Use "https://calendly.com/nitin-virtualassistant/30min" as the actual booking link URL.`;

  const leadInfo = params.leadContext
    ? `\n\nLead Information:\n${params.leadContext}`
    : "";

  const companyInfo = params.companyContext
    ? `\n\nYour Company/Service Context:\n${params.companyContext}`
    : "";

  const systemPrompt = `You are an expert cold email copywriter who writes emails that actually get replies. Your emails are:

1. PROFESSIONAL but HUMAN — They sound like a real person wrote them, not a robot. Use conversational language.
2. CONCISE — Maximum 5-7 sentences total. Every word earns its place.
3. BULLET POINT FORMAT — Always include 2-4 bullet points (using HTML <ul><li>) to highlight key benefits or points. This makes the email scannable.
4. CLEAR CTA — End with ONE clear call-to-action (booking a call).
5. NO FLUFF — No "I hope this email finds you well", no "I wanted to reach out", no generic pleasantries.
6. LOWERCASE SUBJECT — Subject lines are all lowercase, under 40 characters, curiosity-driven.
7. PERSONALIZED — Reference something specific about the recipient or their company.

Email Style: ${typeGuidance}

${variableInstructions}

Format the email body as clean HTML with <p> tags for paragraphs and <ul><li> for bullet points. Keep it simple — no fancy styling, no images, no complex HTML.

IMPORTANT: The email must feel like it was written by a human who genuinely wants to help, not by a marketer trying to sell something.`;

  const userPrompt = `Write a cold outreach email based on this description:

"${params.prompt}"${companyInfo}${leadInfo}

Return ONLY a JSON object with exactly two fields:
- "subject": the email subject line (lowercase, under 40 chars, no quotes)
- "body": the email body as clean HTML

Example format:
{"subject": "quick thought about your growth", "body": "<p>Hi {{ownerName}},</p><p>I noticed...</p><ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul><p>Would you be open to a quick 15-min chat?</p><p><a href=\\"{{ctaLink}}\\">Book a time here</a></p><p>Best,<br/>Nitin</p>"}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
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

  // Ensure bullet points exist
  if (!emailBody.includes("<li") && !emailBody.includes("<ul")) {
    emailBody = emailBody.replace(
      /<\/p>\s*<p/,
      `</p><ul><li>Key benefit we deliver</li><li>Proven results with similar companies</li><li>No risk to try</li></ul><p`
    );
  }

  // Ensure CTA link is present
  const ctaTarget = params.includeVariables ? "{{ctaLink}}" : "https://calendly.com/nitin-virtualassistant/30min";
  if (!emailBody.includes(ctaTarget) && !emailBody.includes("calendly.com") && !emailBody.includes("{{ctaLink}}")) {
    emailBody += `<p><a href="${ctaTarget}">Book a quick chat</a></p>`;
  }

  return {
    subject,
    body: emailBody,
  };
}
