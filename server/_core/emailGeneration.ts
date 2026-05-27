import { invokeLLM } from "./llm";

export type EmailType = "discovery" | "value_prop" | "social_proof" | "urgency" | "custom";

interface LeadInfo {
  ownerName: string;
  companyName: string;
  email: string;
  industry?: string;
  website?: string;
  customData?: Record<string, any>;
}

interface GeneratedEmail {
  subject: string;
  body: string;
  weakPoints: string[];
}

/**
 * Analyze lead's weak points based on company info
 */
export async function analyzeLeadWeakPoints(lead: LeadInfo): Promise<string[]> {
  const prompt = `Analyze this company and identify 3-5 key weak points or pain points they likely face:
  
Company: ${lead.companyName}
Owner: ${lead.ownerName}
Industry: ${lead.industry || "Unknown"}
Website: ${lead.website || "Not provided"}

Identify specific business challenges they might face. Be concise and specific.`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are a business analyst. Identify key pain points and challenges for companies.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = typeof response.choices[0]?.message?.content === 'string' ? response.choices[0]?.message?.content : "";
  const weakPoints = content
    .split("\n")
    .filter((line: string) => line.trim().length > 0)
    .slice(0, 5);

  return weakPoints;
}

/**
 * Generate spam-proof subject lines that avoid trigger words
 */
function generateSpamProofSubject(emailType: EmailType, companyName: string, weakPoint: string): string {
  const templates: Record<EmailType, string[]> = {
    discovery: [
      `Quick question about ${companyName}'s {{weakPoint}}`,
      `Thought about {{weakPoint}} at ${companyName}`,
      `One idea for ${companyName}`,
      `${companyName} - {{weakPoint}} opportunity`,
      `Following up on ${companyName}`,
    ],
    value_prop: [
      `How ${companyName} could improve {{weakPoint}}`,
      `${companyName} and {{weakPoint}}: a better approach`,
      `Helping ${companyName} with {{weakPoint}}`,
      `${companyName}'s {{weakPoint}} - we can help`,
      `New approach to {{weakPoint}} for ${companyName}`,
    ],
    social_proof: [
      `${companyName} - {{weakPoint}} case study`,
      `How companies like ${companyName} solve {{weakPoint}}`,
      `${companyName} success story`,
      `{{weakPoint}} results from similar companies`,
      `${companyName} - proven {{weakPoint}} solution`,
    ],
    urgency: [
      `Time-sensitive: {{weakPoint}} for ${companyName}`,
      `${companyName} - {{weakPoint}} window closing`,
      `Quick win for ${companyName}`,
      `${companyName} - {{weakPoint}} update`,
      `Important: {{weakPoint}} changes for ${companyName}`,
    ],
    custom: [
      `${companyName} - {{weakPoint}}`,
      `Re: {{weakPoint}} at ${companyName}`,
      `${companyName} inquiry`,
      `Reaching out about {{weakPoint}}`,
      `${companyName} - partnership opportunity`,
    ],
  };

  const template = templates[emailType][Math.floor(Math.random() * templates[emailType].length)];
  return template.replace("{{weakPoint}}", weakPoint);
}

/**
 * Generate professional email body with weak point focus
 */
export async function generateProfessionalEmail(
  lead: LeadInfo,
  emailType: EmailType,
  weakPoints: string[],
  ctaLink: string,
  signature: string
): Promise<GeneratedEmail> {
  const weakPoint = weakPoints[0] || "business growth";

  const emailPrompts: Record<EmailType, string> = {
    discovery: `Write a professional discovery email to ${lead.ownerName} at ${lead.companyName}. 
Focus on their potential challenge with: "${weakPoint}"
The email should:
- Be personalized and conversational
- Ask a thoughtful question about their ${weakPoint}
- Include 2-3 bullet points about why this matters
- End with a clear CTA to schedule a 30-minute call
- Be under 150 words
- Sound human, not robotic`,

    value_prop: `Write a professional value proposition email to ${lead.ownerName} at ${lead.companyName}.
Focus on their challenge with: "${weakPoint}"
The email should:
- Highlight how we solve their ${weakPoint} challenge
- Include 2-3 specific benefits with bullet points
- Share a brief success metric or result
- End with a CTA to schedule a call
- Be under 150 words
- Sound professional and credible`,

    social_proof: `Write a professional case study email to ${lead.ownerName} at ${lead.companyName}.
Focus on their challenge with: "${weakPoint}"
The email should:
- Reference a similar company that solved ${weakPoint}
- Include 2-3 specific results or metrics
- Explain how their situation is similar
- End with a CTA to discuss their specific situation
- Be under 150 words
- Build confidence through social proof`,

    urgency: `Write a professional time-sensitive email to ${lead.ownerName} at ${lead.companyName}.
Focus on their challenge with: "${weakPoint}"
The email should:
- Create mild urgency without being pushy
- Explain why acting soon on ${weakPoint} matters
- Include 2-3 benefits of taking action
- End with a CTA to schedule a call this week
- Be under 150 words
- Sound professional and credible`,

    custom: `Write a professional business email to ${lead.ownerName} at ${lead.companyName}.
Focus on their challenge with: "${weakPoint}"
The email should:
- Be highly personalized
- Address their specific ${weakPoint} challenge
- Include 2-3 key points with bullet format
- End with a clear CTA
- Be under 150 words
- Sound professional and human`,
  };

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a professional copywriter specializing in B2B outreach emails. 
Write emails that are:
- Personalized and specific
- Professional but conversational
- Action-oriented with clear CTAs
- Free of spam trigger words
- Formatted with bullet points for key benefits
- Under 150 words`,
      },
      {
        role: "user",
        content: emailPrompts[emailType],
      },
    ],
  });

  let emailBody = typeof response.choices[0]?.message?.content === 'string' ? response.choices[0]?.message?.content : "";

  // Replace variables in email body
  if (typeof emailBody === 'string') {
    emailBody = emailBody
      .replace(/{{ownerName}}/g, lead.ownerName)
      .replace(/{{companyName}}/g, lead.companyName)
      .replace(/{{ctaLink}}/g, ctaLink)
      .replace(/{{weakPoint}}/g, weakPoint);
  }

  // Add signature
  if (typeof emailBody === 'string') {
    emailBody = `${emailBody}\n\n${signature}`;
  } else {
    emailBody = `\n\n${signature}`;
  }

  // Generate spam-proof subject
  const subject = generateSpamProofSubject(emailType, lead.companyName, weakPoint);

  return {
    subject,
    body: emailBody,
    weakPoints,
  };
}

/**
 * Generate follow-up email sequence (7 emails)
 */
export async function generateFollowUpSequence(
  lead: LeadInfo,
  weakPoints: string[],
  ctaLink: string,
  signature: string
): Promise<Array<{ subject: string; body: string; dayOffset: number; emailType: EmailType }>> {
  const sequence = [
    { type: "discovery" as EmailType, day: 0 },
    { type: "value_prop" as EmailType, day: 7 },
    { type: "social_proof" as EmailType, day: 14 },
    { type: "urgency" as EmailType, day: 21 },
    { type: "discovery" as EmailType, day: 28 },
    { type: "value_prop" as EmailType, day: 35 },
    { type: "custom" as EmailType, day: 42 },
  ];

  const emails = [];

  for (const item of sequence) {
    const email = await generateProfessionalEmail(lead, item.type, weakPoints, ctaLink, signature);
    emails.push({
      subject: email.subject,
      body: email.body,
      dayOffset: item.day,
      emailType: item.type,
    });
  }

  return emails;
}

/**
 * Validate email subject line for spam score
 */
export function validateSubjectLine(subject: string): { isValid: boolean; score: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 100;

  const spamWords = [
    "free",
    "urgent",
    "limited time",
    "act now",
    "click here",
    "buy now",
    "don't miss",
    "winner",
    "cash",
    "prize",
    "guarantee",
    "no credit card",
    "unsubscribe",
  ];

  const spamPatterns = [
    /[A-Z]{5,}/g, // ALL CAPS words
    /!!!/g, // Multiple exclamation marks
    /\$\d+/g, // Dollar amounts
    /\d{3,}/g, // Long numbers
  ];

  const lowerSubject = subject.toLowerCase();

  // Check for spam words
  for (const word of spamWords) {
    if (lowerSubject.includes(word)) {
      warnings.push(`Contains spam trigger word: "${word}"`);
      score -= 15;
    }
  }

  // Check for spam patterns
  for (const pattern of spamPatterns) {
    if (pattern.test(subject)) {
      warnings.push(`Contains spam pattern: ${pattern}`);
      score -= 10;
    }
  }

  // Check length
  if (subject.length > 60) {
    warnings.push("Subject line is too long (>60 characters)");
    score -= 5;
  }

  if (subject.length < 20) {
    warnings.push("Subject line is too short (<20 characters)");
    score -= 5;
  }

  return {
    isValid: score >= 70,
    score: Math.max(0, score),
    warnings,
  };
}
