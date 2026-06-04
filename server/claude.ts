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
  problemAnalysis?: {
    painPoints: string[];
    industryTrends?: string[];
    competitiveThreats?: string[];
  };
}

interface GeneratedEmail {
  subject: string;
  body: string;
  generatedBy: "claude";
  model: string;
}

export async function generateEmailWithClaude(params: GenerateEmailParams): Promise<GeneratedEmail> {
  const client = getClient();
  const modelUsed = "claude-sonnet-4-6";

  // Build problem context from analysis
  const problemContext = params.problemAnalysis
    ? `\n\nPROBLEM ANALYSIS (use these specific pain points in the email):
Pain Points: ${params.problemAnalysis.painPoints.slice(0, 4).join("; ")}
${params.problemAnalysis.industryTrends ? `Industry Trends: ${params.problemAnalysis.industryTrends.slice(0, 3).join("; ")}` : ""}
${params.problemAnalysis.competitiveThreats ? `Competitive Threats: ${params.problemAnalysis.competitiveThreats.slice(0, 2).join("; ")}` : ""}`
    : "";

  const variableInstructions = params.includeVariables
    ? `Use these template variables in the email:
- {{ownerName}} for the recipient's first name
- {{companyName}} for their company name
- {{industry}} for their industry
- {{ctaLink}} for the call-to-action booking link
- {{email}} for their email address`
    : `CRITICAL: Do NOT use any template variables like {{ownerName}}, {{companyName}}, {{industry}}, {{ctaLink}}, or {{email}}. Write the email as a direct, ready-to-send message using the lead's actual name and company. Use "https://calendly.com/nitin-virtualassistant/30min" as the actual booking link URL.`;

  const leadInfo = params.leadContext
    ? `\n\nLead Information:\n${params.leadContext}`
    : "";

  const companyInfo = params.companyContext
    ? `\n\nYour Company/Service Context:\n${params.companyContext}`
    : "";

  const systemPrompt = `You are an elite cold email strategist who writes emails that feel like personal notes from a trusted advisor, NOT marketing emails. Your emails consistently achieve 40%+ open rates and 15%+ reply rates.

CRITICAL EMAIL STRUCTURE (follow this EXACT format):

1. OPENING (1-2 lines): A warm, personal greeting that references something specific about their company or industry. NO generic "I hope this finds you well." Start with an observation or insight.

2. PROBLEM IDENTIFICATION (2-3 lines): Identify 2-3 SPECIFIC problems that owners in their industry commonly face. These should be real, relatable pain points — NOT generic business challenges. Reference the industry directly. Make the reader think "yes, that's exactly what I'm dealing with."

3. OUR SERVICES & SOLUTIONS (3-4 bullet points): Present how Virtual Assistant Group solves these problems. Each bullet should:
   - Start with a relevant emoji (🚀, 📈, 💰, ⏱️, ✅, 🎯, 📊, 💡, 🔥, ⚡)
   - Include a **bold** key benefit/USP
   - Be specific about the outcome, not vague promises

4. CASE STUDY / SOCIAL PROOF (2-3 lines): Reference a specific (realistic) success story from a similar company in their industry. Include concrete numbers: "We helped [similar company type] achieve [specific result] in [timeframe]." Make it believable and relevant.

5. CTA (exactly this format):
   "👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:
   🗓️ 30 Min Free Consultation: [BOOKING_LINK]"
   Where [BOOKING_LINK] is either {{ctaLink}} (if using variables) or "https://calendly.com/nitin-virtualassistant/30min"

STYLE RULES:
- Sound like a knowledgeable friend who genuinely wants to help, NOT a salesperson
- Use conversational language — contractions, short sentences, natural flow
- NEVER use "I wanted to reach out", "I hope this finds you well", "I came across your company"
- Subject lines: lowercase, under 40 characters, curiosity-driven, specific to their industry
- Total email length: 150-200 words (concise but substantive)
- EVERY email must be UNIQUE — vary sentence structure, opening hooks, case studies, and problem angles
- Reference the lead's SPECIFIC industry naturally throughout
- NO sign-off (no "Best,", "Regards,", etc.) — the signature is appended automatically
- Do NOT repeat the same email structure word-for-word across different leads

VARIATION TECHNIQUES (use different ones each time):
- Open with a question vs. an observation vs. a statistic
- Lead with the problem vs. lead with the solution vs. lead with social proof
- Use different case study industries/numbers each time
- Vary bullet point count (3-4) and phrasing style
- Alternate between formal-professional and casual-professional tone

${variableInstructions}

FORMAT: Write the email body as PLAIN TEXT:
- Use line breaks for paragraphs
- Use • (bullet character) for bullet points
- Each bullet MUST start with an emoji icon
- Wrap key USP phrases in **double asterisks** for bold
- Do NOT use any HTML tags
- Do NOT use markdown headers or links
- Just plain readable text with emoji icons and **bold markers**`;

  const userPrompt = `Write a cold outreach email based on this description:

"${params.prompt}"${companyInfo}${leadInfo}${problemContext}

IMPORTANT: Generate a COMPLETELY UNIQUE email. Do not use cookie-cutter templates. Every sentence should feel fresh and specifically written for this recipient.

Return ONLY a JSON object with exactly two fields:
- "subject": the email subject line (lowercase, under 40 chars, specific to their industry)
- "body": the email body as PLAIN TEXT following the structure above (use \\n for line breaks, • for bullet points with emoji icons, **bold** for USPs, NO HTML)`;

  const response = await client.messages.create({
    model: modelUsed,
    max_tokens: 1500,
    temperature: 0.9, // Higher temperature for more variation
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

  let parsed: { subject?: string; body?: string };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Fallback: try to extract subject and body from malformed JSON
    const subjectMatch = rawText.match(/"subject"\s*:\s*"([^"]*)"/);  
    const bodyMatch = rawText.match(/"body"\s*:\s*"([\s\S]*?)"\s*[,}]?\s*$/);
    if (subjectMatch || bodyMatch) {
      parsed = {
        subject: subjectMatch ? subjectMatch[1] : "quick thought about your business",
        body: bodyMatch ? bodyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : rawText,
      };
    } else {
      // Last resort: treat entire response as body
      parsed = {
        subject: "quick thought about your business",
        body: rawText,
      };
    }
  }

  let emailBody = parsed.body || "";
  const subject = parsed.subject || "";

  // Ensure bullet points with icons exist
  if (!emailBody.includes("•") && !emailBody.includes("🚀") && !emailBody.includes("📈")) {
    // Insert some bullet points if Claude missed them
    const lines = emailBody.split("\n");
    const insertIdx = Math.min(4, lines.length - 1);
    const bullets = "\n• 🚀 **Automated lead generation** — 50+ qualified leads per week on autopilot\n• 📈 **3x more booked calls** within 30 days of starting\n• 💰 **No long-term contracts** — cancel anytime, zero risk\n";
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
