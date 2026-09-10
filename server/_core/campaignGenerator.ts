import { invokeLLM } from "./llm";

export interface CampaignContext {
  industry: string;
  targetAudience: string;
  offer: string;
  companyName: string;
  proofPoints?: string[];
  // User-picked design direction (e.g. "Clean & Professional", "Premium &
  // Modern", "Bold & Conversion-Focused") -- the wizard's own "ask me
  // questions and build accordingly" input, rather than the AI silently
  // picking a look on its own every time.
  stylePreference?: string;
}

export type SectionType =
  | "hero" | "problem" | "solution" | "benefits" | "features"
  | "testimonials" | "pricing" | "faq" | "final-cta" | "footer";

export interface Theme {
  primary: string;
  secondary: string;
  cta: string;
  background: string;
  text: string;
  accent: string;
}

export interface ThemeAndResearch {
  theme: Theme;
  researchNote: string;
  sectionPlan: SectionType[];
}

export interface SectionContent {
  type: SectionType;
  headline?: string;
  subheadline?: string;
  body?: string;
  ctaText?: string;
  bullets?: string[];
  faqs?: Array<{ question: string; answer: string }>;
  imageUrl?: string;
  videoUrl?: string; // YouTube/Vimeo link, rendered as an embed (see server/_core/publicPages.ts)
}

export interface CampaignEmailSlot {
  sequenceNumber: number; // 1-8
  slotPurpose: string;
  dayOffset: number;
}

const DEFAULT_THEME: Theme = {
  primary: "#1e3a5f",
  secondary: "#f5f7fa",
  cta: "#2563eb",
  background: "#ffffff",
  text: "#1a1a1a",
  accent: "#2563eb",
};

// Only used if the LLM call for a theme genuinely fails twice in a row
// (see synthesizeThemeAndResearch's retry below) -- a small set of visually
// distinct fallbacks, picked at random, so even a failed generation doesn't
// produce the exact same navy-blue page every time.
const FALLBACK_THEMES: Theme[] = [
  DEFAULT_THEME,
  { primary: "#0f172a", secondary: "#f8fafc", cta: "#059669", background: "#ffffff", text: "#0f172a", accent: "#059669" },
  { primary: "#3f1d38", secondary: "#faf5fb", cta: "#c026d3", background: "#ffffff", text: "#1f1023", accent: "#c026d3" },
  { primary: "#1c1917", secondary: "#fafaf9", cta: "#ea580c", background: "#ffffff", text: "#1c1917", accent: "#ea580c" },
  { primary: "#052e2b", secondary: "#f0fdf9", cta: "#0d9488", background: "#ffffff", text: "#042f2e", accent: "#0d9488" },
];
function randomFallbackTheme(): Theme {
  return FALLBACK_THEMES[Math.floor(Math.random() * FALLBACK_THEMES.length)];
}

const SECTION_TYPES: SectionType[] = ["hero", "problem", "solution", "benefits", "features", "testimonials", "pricing", "faq", "final-cta", "footer"];
const DEFAULT_SECTION_PLAN: SectionType[] = ["hero", "problem", "solution", "benefits", "faq", "final-cta", "footer"];

function defaultResearchNote(industry: string): string {
  return `Based on common patterns for ${industry || "this industry"}'s landing pages, not a live audit of a specific competitor -- an original design was created using these patterns as inspiration.`;
}

// Extracts a JSON object from an invokeLLM response, tolerating markdown code
// fences and a stray trailing comma -- same defensive pattern used
// throughout this codebase (e.g. leads.generate's AI-estimation path,
// calls.interpretRequest) since the model doesn't always return clean JSON
// even when asked for response_format: json_object.
export function parseJsonContent(rawContent: unknown): any {
  let content: any = rawContent;
  if (Array.isArray(content)) {
    content = content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join("");
  }
  if (!content) return null;
  content = String(content).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0].replace(/,(\s*[\]}])/g, "$1"));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim());
}

export function normalizeTheme(raw: any): Theme {
  const theme = { ...DEFAULT_THEME };
  for (const key of Object.keys(DEFAULT_THEME) as Array<keyof Theme>) {
    if (isValidHexColor(raw?.[key])) theme[key] = raw[key].trim();
  }
  return theme;
}

// For AI-edit: merges validated changes ONTO the page's current theme,
// rather than normalizeTheme's generic DEFAULT_THEME fallback -- an edit
// instruction that only touches one color (or that the model returns
// slightly malformed) must never silently reset every other color back to
// a generic default; anything invalid/missing just keeps its current value.
export function mergeTheme(current: Theme, raw: any): Theme {
  const theme = { ...current };
  for (const key of Object.keys(DEFAULT_THEME) as Array<keyof Theme>) {
    if (isValidHexColor(raw?.[key])) theme[key] = raw[key].trim();
  }
  return theme;
}

// For AI-edit: validates an LLM-returned full sections array (not just a
// type-only plan like sanitizeSectionPlan) -- keeps only entries with a
// recognized `type`, drops anything else the model may have hallucinated.
// Free-form fields (headline/body/bullets/etc.) are passed through as-is,
// same as generateSectionContent's own output shape.
export function sanitizeSectionsContent(raw: any, fallback: SectionContent[]): SectionContent[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const cleaned = raw.filter((s: any) => s && typeof s === "object" && SECTION_TYPES.includes(s.type));
  return cleaned.length > 0 ? cleaned : fallback;
}

function sanitizeSectionPlan(raw: any, hasProofPoints: boolean): SectionType[] {
  const requested: SectionType[] = Array.isArray(raw)
    ? raw.filter((s: any): s is SectionType => SECTION_TYPES.includes(s))
    : [];
  let plan = requested.length > 0 ? requested : DEFAULT_SECTION_PLAN;
  if (!hasProofPoints) plan = plan.filter((s) => s !== "testimonials");
  if (plan[0] !== "hero") plan = ["hero", ...plan.filter((s) => s !== "hero")];
  if (plan[plan.length - 1] !== "footer") plan = [...plan.filter((s) => s !== "footer"), "footer"];
  return plan;
}

const STYLE_DESCRIPTIONS: Record<string, string> = {
  "clean_professional": "Clean & Professional -- restrained palette (2-3 colors max), generous white space, conservative trustworthy tone, subtle CTA color.",
  "premium_modern": "Premium & Modern -- a bolder, richer palette (can be a dark primary with a vivid accent), confident and polished tone, a CTA color that pops against the rest of the page.",
  "bold_conversion": "Bold & Conversion-Focused -- high-contrast, energetic palette, punchy short copy, an unmissable CTA color, urgency-oriented tone without being spammy.",
};

// One invokeLLM call (established response_format: json_object + defensive
// parse pattern) that picks an industry-appropriate color theme, plans which
// sections actually make sense for this campaign, and produces the honest
// "this is closed-book synthesis, not a real competitor audit" disclosure --
// there is no web-search tool or screenshot capability anywhere in this
// codebase (confirmed), so this step never claims to have inspected a real
// page. Retries once on failure/unparseable output before falling back to a
// randomized default theme -- previously a single failure silently produced
// the exact same hardcoded navy-blue theme every time, which is a real part
// of why generated pages could look "the same standard template" repeatedly.
export async function synthesizeThemeAndResearch(ctx: CampaignContext): Promise<ThemeAndResearch> {
  const proofNote = ctx.proofPoints?.length
    ? `The user has supplied these real proof points, which may inform the plan: ${ctx.proofPoints.join("; ")}.`
    : `The user has supplied no real proof points (no testimonials, stats, case studies, or awards) -- the section plan must NOT include "testimonials", and must not plan any section that would need fabricated numbers or names.`;
  const styleNote = ctx.stylePreference && STYLE_DESCRIPTIONS[ctx.stylePreference]
    ? `Requested design direction: ${STYLE_DESCRIPTIONS[ctx.stylePreference]} Build the theme and section choices around this direction specifically.`
    : "No specific style was requested -- pick a direction that best fits the industry and offer, and commit to it fully rather than defaulting to a generic corporate look.";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a conversion-focused marketing design strategist who designs a DIFFERENT, distinctive theme for every brief -- never the same safe navy-and-white \"corporate default\" twice. You work from general knowledge of common, proven landing-page design and copy patterns for a given industry -- you have not browsed any live websites and must never claim to have inspected a specific real competitor's page. Respond with raw JSON only, no markdown formatting, no explanatory text.",
          },
          {
            role: "user",
            content: `Industry: ${ctx.industry}\nTarget audience: ${ctx.targetAudience}\nOffer: ${ctx.offer}\nCompany: ${ctx.companyName}\n${proofNote}\n${styleNote}\n\nReturn a JSON object with exactly these fields:\n{"theme":{"primary":"#hex","secondary":"#hex","cta":"#hex","background":"#hex","text":"#hex","accent":"#hex"},"researchNote":"one or two honest sentences describing the common design patterns you drew on for this industry, explicitly noting this is general knowledge, not a live audit of a specific competitor","sectionPlan":["hero", ...]}\nColors must be genuinely specific to THIS industry/offer/style, not a generic safe default -- vary saturation, consider a dark-primary/light-accent combo or a warmer palette where the industry and style support it, and make sure primary/cta/accent are visually distinct from each other (not three near-identical blues). sectionPlan must be an ordered array using ONLY these values: hero, problem, solution, benefits, features, testimonials, pricing, faq, final-cta, footer -- start with hero, end with footer, and only include sections that genuinely help conversion for this specific campaign (don't include every type). Only include "testimonials" if real proof points were supplied above.`,
          },
        ],
        response_format: { type: "json_object" },
      }) as any;

      const parsed = parseJsonContent(response?.choices?.[0]?.message?.content);
      if (parsed) {
        return {
          theme: normalizeTheme(parsed.theme),
          researchNote: typeof parsed.researchNote === "string" && parsed.researchNote.trim() ? parsed.researchNote.trim() : defaultResearchNote(ctx.industry),
          sectionPlan: sanitizeSectionPlan(parsed.sectionPlan, !!ctx.proofPoints?.length),
        };
      }
    } catch (error) {
      console.error(`[campaignGenerator] synthesizeThemeAndResearch attempt ${attempt + 1} failed:`, error);
    }
  }

  return { theme: randomFallbackTheme(), researchNote: defaultResearchNote(ctx.industry), sectionPlan: sanitizeSectionPlan(null, !!ctx.proofPoints?.length) };
}

const SECTION_INSTRUCTIONS: Record<SectionType, string> = {
  hero: `Return {"headline":"...","subheadline":"...","ctaText":"..."} -- headline is a strong, benefit-driven line under 12 words that says who this is for and what problem is solved; subheadline is one supporting sentence; ctaText is a short action phrase (e.g. "Book a Free Consultation", "Get Started", "Get Your Free Audit").`,
  problem: `Return {"headline":"...","body":"..."} -- headline names the core problem the target audience faces; body is 2-3 sentences making it concrete and relatable, no invented statistics.`,
  solution: `Return {"headline":"...","body":"..."} -- headline names the solution/offer; body is 2-3 benefit-focused sentences on how it solves the problem.`,
  benefits: `Return {"headline":"...","bullets":["...","...","..."]} -- headline introduces the benefits section; bullets is 3-5 short, benefit-focused phrases (outcomes, not features).`,
  features: `Return {"headline":"...","bullets":["...","...","..."]} -- headline introduces what's included; bullets is 3-6 concrete feature/capability descriptions.`,
  testimonials: `Return {"headline":"...","body":"..."} -- use ONLY the real proof points supplied in context, attributed accurately; do NOT invent a name, quote, company, or number.`,
  pricing: `Return {"headline":"...","body":"..."} -- headline introduces the offer; body explains it plainly. Do not invent a specific price/number unless one was supplied in the offer description.`,
  faq: `Return {"headline":"Frequently Asked Questions","faqs":[{"question":"...","answer":"..."}]} -- 3-5 realistic Q&A pairs relevant to this offer/industry, answers grounded only in the offer described, no invented guarantees or certifications.`,
  "final-cta": `Return {"headline":"...","subheadline":"...","ctaText":"..."} -- a final, direct call to action restating the core offer.`,
  footer: `Return {"body":"..."} -- a short one-line footer (e.g. company name), no invented legal/certification claims.`,
};

const PLACEHOLDER_SECTION: Record<SectionType, Partial<SectionContent>> = {
  hero: { headline: "Your headline here", subheadline: "Edit this section to describe your offer.", ctaText: "Get Started" },
  problem: { headline: "The problem", body: "Click Edit to describe the problem your audience faces." },
  solution: { headline: "Our solution", body: "Click Edit to describe how you solve it." },
  benefits: { headline: "Benefits", bullets: ["Edit this section to add your benefits"] },
  features: { headline: "Features", bullets: ["Edit this section to add your features"] },
  testimonials: { headline: "What people say", body: "Add a real testimonial here." },
  pricing: { headline: "Pricing", body: "Click Edit to describe your offer." },
  faq: { headline: "Frequently Asked Questions", faqs: [{ question: "Edit this question", answer: "Edit this answer" }] },
  "final-cta": { headline: "Ready to get started?", ctaText: "Get Started" },
  footer: { body: "Your Company" },
};

// Phrases that show up constantly in generic AI-written marketing copy --
// explicitly banned in the prompt below so the model reaches for something
// actually specific to the offer instead of defaulting to these.
const CLICHE_PHRASES = [
  "take your business to the next level", "unlock your potential", "your trusted partner",
  "we help you succeed", "seamless experience", "in today's fast-paced world",
  "cutting-edge solutions", "one-stop shop", "revolutionize the way",
];

// Per-section-type prompt, called concurrently for every planned section
// (mirrors the Promise.all-with-per-slot-fallback shape already used by
// email.previewFollowUpSchedule) so one failed section doesn't fail the
// whole generation. Retries once before falling back to the generic
// PLACEHOLDER_SECTION text, for the same reason synthesizeThemeAndResearch
// does -- a single transient failure shouldn't be the reason every page
// shows the exact same "Your headline here" placeholder.
export async function generateSectionContent(sectionType: SectionType, ctx: CampaignContext): Promise<SectionContent> {
  const styleNote = ctx.stylePreference && STYLE_DESCRIPTIONS[ctx.stylePreference]
    ? `Match this design direction in tone: ${STYLE_DESCRIPTIONS[ctx.stylePreference]}`
    : "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You write concise, professional, human-sounding, benefit-focused landing page copy that is SPECIFIC to the exact offer and audience described -- not interchangeable with any other business in the same industry. Never invent testimonials, customer counts, reviews, certifications, awards, case studies, or statistics that weren't supplied to you -- omit them instead. Never use these overused phrases or anything that reads like them: ${CLICHE_PHRASES.map((p) => `"${p}"`).join(", ")}. Respond with raw JSON only, no markdown formatting, no explanatory text.`,
          },
          {
            role: "user",
            content: `Industry: ${ctx.industry}\nTarget audience: ${ctx.targetAudience}\nOffer (use these exact specifics, don't generalize them away): ${ctx.offer}\nCompany: ${ctx.companyName}\n${ctx.proofPoints?.length ? `Real proof points you may use: ${ctx.proofPoints.join("; ")}` : "No real proof points were supplied -- do not invent any."}\n${styleNote}\n\n${SECTION_INSTRUCTIONS[sectionType]}`,
          },
        ],
        response_format: { type: "json_object" },
      }) as any;
      const parsed = parseJsonContent(response?.choices?.[0]?.message?.content);
      if (parsed) return { type: sectionType, ...parsed };
    } catch (error) {
      console.error(`[campaignGenerator] generateSectionContent attempt ${attempt + 1} failed for ${sectionType}:`, error);
    }
  }
  return { type: sectionType, ...PLACEHOLDER_SECTION[sectionType] };
}

// The user's exact 8-email narrative arc -- a new, fixed schedule separate
// from FOLLOW_UP_EMAIL_SCHEDULE (server/_core/followUpScheduler.ts), since
// this one has specific, prescriptive per-slot purposes (a breakup email, a
// dedicated objection-handling email) that don't map onto the generic
// discovery/value_prop/social_proof/urgency/custom cycling that scheduler
// uses. Day offsets follow that scheduler's own 2-then-5-day cadence shape.
export const CAMPAIGN_EMAIL_SCHEDULE: CampaignEmailSlot[] = [
  { sequenceNumber: 1, slotPurpose: "initial_outreach", dayOffset: 0 },
  { sequenceNumber: 2, slotPurpose: "followup_angle", dayOffset: 3 },
  { sequenceNumber: 3, slotPurpose: "followup_pain_point", dayOffset: 6 },
  { sequenceNumber: 4, slotPurpose: "social_proof", dayOffset: 9 },
  { sequenceNumber: 5, slotPurpose: "objection_handling", dayOffset: 13 },
  { sequenceNumber: 6, slotPurpose: "alt_value_prop", dayOffset: 17 },
  { sequenceNumber: 7, slotPurpose: "final_nudge", dayOffset: 21 },
  { sequenceNumber: 8, slotPurpose: "breakup", dayOffset: 25 },
];

// followUpEmails.emailType is a required enum (discovery/value_prop/
// social_proof/urgency/custom) on the EXISTING table -- scheduleCampaignEmailsFromSequence
// (followUpScheduler.ts) writes into that same table for slots 2-8, so each
// slotPurpose needs a mapped value. Not a semantically perfect match, but
// emailType isn't read again after generation (content is already generated
// and stored) -- this keeps the existing table's constraint satisfied without
// a new column.
export const SLOT_PURPOSE_TO_EMAIL_TYPE: Record<string, "discovery" | "value_prop" | "social_proof" | "urgency" | "custom"> = {
  initial_outreach: "discovery",
  followup_angle: "discovery",
  followup_pain_point: "value_prop",
  social_proof: "social_proof",
  objection_handling: "urgency",
  alt_value_prop: "value_prop",
  final_nudge: "custom",
  breakup: "custom",
};

// Token vocabulary note: emails 2-8 get fully substituted by
// scheduleCampaignEmailsFromSequence (using shared/personalization.ts's
// superset of tokens) before they're ever stored for sending, so any token
// name would work there -- but email 1 (initial_outreach) is stored as-is
// into campaigns.emailTemplate and sent through the EXISTING, unmodified
// campaigns.launch/email.sendIndividual paths, which only substitute the
// pre-existing {{companyName}}/{{ownerName}}/{{email}}/{{industry}}/
// {{phoneNumber}} tokens. Every prompt below deliberately sticks to that
// existing vocabulary so email 1 doesn't leave a literal "{{...}}" in a
// recipient's inbox.
const SLOT_PROMPTS: Record<string, (ctx: CampaignContext, landingPageUrl: string, proofNote: string) => string> = {
  initial_outreach: (ctx, url) =>
    `Write the FIRST outreach email introducing ${ctx.companyName} to a lead in the ${ctx.industry} industry (target audience: ${ctx.targetAudience}). Identify a relevant problem for this audience, then present this offer as the value proposition: "${ctx.offer}". Include exactly one clear call to action linking to ${url}. Use {{ownerName}} and {{companyName}} as personalization tokens (literally write "{{ownerName}}"/"{{companyName}}"), not a placeholder or an invented name.`,
  followup_angle: (ctx, url) =>
    `Write a SHORT follow-up email (the 2nd email in this sequence) referencing that you reached out before, but from a genuinely DIFFERENT angle than a first "introducing ourselves" email would use -- do not repeat the same pitch. Still about "${ctx.offer}" for someone in ${ctx.industry}. Link to ${url}. Use {{ownerName}}/{{companyName}} tokens.`,
  followup_pain_point: (ctx, url) =>
    `Write a follow-up email highlighting a DIFFERENT important benefit or pain point than a first email would cover, related to "${ctx.offer}" for someone in ${ctx.industry} (audience: ${ctx.targetAudience}). Link to ${url}. Use {{ownerName}}/{{companyName}} tokens.`,
  social_proof: (ctx, url, proofNote) =>
    `Write a follow-up email that provides social proof, a case study, or a genuinely useful credibility-building insight about "${ctx.offer}". ${proofNote} Link to ${url}. Use {{ownerName}}/{{companyName}} tokens.`,
  objection_handling: (ctx, url) =>
    `Write a follow-up email addressing a likely objection someone in ${ctx.industry} might have about "${ctx.offer}" -- pick whichever of cost, time, switching providers, quality, implementation effort, or trust seems most relevant to this offer, and address it directly and honestly, no hype. Link to ${url}. Use {{ownerName}}/{{companyName}} tokens.`,
  alt_value_prop: (ctx, url) =>
    `Write a follow-up email presenting a DIFFERENT value proposition, use case, or angle on the same offer ("${ctx.offer}") than earlier emails in this sequence would use. Link to ${url}. Use {{ownerName}}/{{companyName}} tokens.`,
  final_nudge: (ctx, url) =>
    `Write a SHORT, low-key, not-pushy email giving one final easy opportunity to engage about "${ctx.offer}". Keep it brief. Link to ${url}. Use {{ownerName}}/{{companyName}} tokens.`,
  breakup: (ctx, url) =>
    `Write a polite, professional "breakup" email closing out this outreach sequence for "${ctx.offer}" -- low-pressure tone, something like acknowledging this may not be a priority right now and that you don't want to keep filling their inbox. Include one simple final call to action linking to ${url}, framed as a no-pressure open door for later. Link to ${url}. Use {{ownerName}}/{{companyName}} tokens.`,
};

const FALLBACK_SUBJECTS: Record<string, string> = {
  initial_outreach: "quick idea for {{companyName}}",
  followup_angle: "following up",
  followup_pain_point: "another thought for {{companyName}}",
  social_proof: "how others have approached this",
  objection_handling: "a common question we hear",
  alt_value_prop: "a different way to think about this",
  final_nudge: "still worth a look?",
  breakup: "closing the loop",
};

export function buildCampaignEmailPrompt(slot: CampaignEmailSlot, ctx: CampaignContext, landingPageUrl: string): string {
  const proofNote = ctx.proofPoints?.length
    ? `Use ONLY these real, verified proof points -- do not invent a case study, customer name, or number: ${ctx.proofPoints.join("; ")}.`
    : `No real case study, testimonial, or statistic was supplied for this campaign -- do NOT invent one. Share a genuinely useful insight or observation relevant to ${ctx.industry} instead, with no fabricated numbers or customer references.`;
  const builder = SLOT_PROMPTS[slot.slotPurpose] || SLOT_PROMPTS.followup_angle;
  return builder(ctx, landingPageUrl, proofNote);
}

const CAMPAIGN_EMAIL_SYSTEM_PROMPT = "You are a professional outreach copywriter. Write concise, human-sounding, benefit-focused, trustworthy emails -- avoid generic AI marketing language and hype. Never invent testimonials, customer counts, reviews, certifications, awards, case studies, or statistics. Respond with raw JSON only: {\"subject\":\"...\",\"body\":\"...\"} -- body as plain text using \\n for line breaks and blank lines between paragraphs, no HTML, no markdown headers, no signature/sign-off (one is appended automatically).";

// Follow-up emails are drafted with Claude when a key is configured (the
// same getClient() priority claude.ts's own generateEmailWithClaude uses:
// explicit key -> the owner's saved Settings key -> ANTHROPIC_API_KEY env
// fallback), NOT generateEmailWithClaude itself -- that function hardcodes a
// different sender identity and explicitly instructs the model to invent a
// fake case study every time, which conflicts with "never invent
// testimonials" (confirmed earlier this session). This sends the exact same
// buildCampaignEmailPrompt text, just through the Anthropic SDK directly.
// Returns null (not a throw) on anything short of a clean {subject,body} --
// the caller falls back to invokeLLM, never to the user.
async function generateCampaignEmailWithClaude(prompt: string): Promise<{ subject: string; body: string } | null> {
  const { getClient } = await import("../claude");
  const client = await getClient(); // throws if no key is configured anywhere -- caller catches this as "not available"
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    temperature: 0.8,
    system: CAMPAIGN_EMAIL_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  const db = await import("../db");
  db.trackClaudeApiUsage({
    userId: 1,
    purpose: "campaign_email",
    model: "claude-sonnet-4-6",
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  }).catch(() => {});

  const textBlock = response.content.find((b: any) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  const parsed = parseJsonContent(textBlock.text);
  if (parsed?.subject && parsed?.body) {
    return { subject: String(parsed.subject), body: String(parsed.body) };
  }
  return null;
}

export async function generateCampaignEmail(slot: CampaignEmailSlot, ctx: CampaignContext, landingPageUrl: string): Promise<{ subject: string; body: string }> {
  const prompt = buildCampaignEmailPrompt(slot, ctx, landingPageUrl);

  try {
    const claudeResult = await generateCampaignEmailWithClaude(prompt);
    if (claudeResult) return claudeResult;
  } catch (error) {
    console.log(`[campaignGenerator] Claude not available for slot ${slot.sequenceNumber}, falling back to invokeLLM:`, (error as any)?.message);
  }

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: CAMPAIGN_EMAIL_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }) as any;
    const parsed = parseJsonContent(response?.choices?.[0]?.message?.content);
    if (parsed?.subject && parsed?.body) {
      return { subject: String(parsed.subject), body: String(parsed.body) };
    }
  } catch (error) {
    console.error(`[campaignGenerator] generateCampaignEmail failed for slot ${slot.sequenceNumber} (${slot.slotPurpose}):`, error);
  }
  return {
    subject: FALLBACK_SUBJECTS[slot.slotPurpose] || "following up",
    body: `Hi {{ownerName}},\n\nWanted to follow up about ${ctx.offer || "how we can help"}.\n\nYou can learn more here: ${landingPageUrl}\n\n(This is a fallback message -- use Regenerate to try again.)`,
  };
}

export interface GenerateFullCampaignInput extends CampaignContext {
  landingPageUrl: string;
}

export interface GeneratedCampaignEmail {
  sequenceNumber: number;
  slotPurpose: string;
  dayOffset: number;
  subject: string;
  body: string;
}

export interface GeneratedCampaign {
  theme: Theme;
  researchNote: string;
  sections: SectionContent[];
  emails: GeneratedCampaignEmail[];
}

// Orchestrates the full generation: theme+research -> section plan ->
// concurrent section generation -> concurrent 8-email generation. Sections
// and emails are independent of each other content-wise (both reference the
// same offer/CTA/landingPageUrl, not each other's generated text), so both
// groups run fully concurrently rather than sections-then-emails serially.
export async function generateFullCampaign(input: GenerateFullCampaignInput): Promise<GeneratedCampaign> {
  const ctx: CampaignContext = {
    industry: input.industry,
    targetAudience: input.targetAudience,
    offer: input.offer,
    companyName: input.companyName,
    proofPoints: input.proofPoints,
    stylePreference: input.stylePreference,
  };

  const { theme, researchNote, sectionPlan } = await synthesizeThemeAndResearch(ctx);

  const [sections, emails] = await Promise.all([
    Promise.all(sectionPlan.map((type) => generateSectionContent(type, ctx))),
    Promise.all(CAMPAIGN_EMAIL_SCHEDULE.map(async (slot) => {
      const { subject, body } = await generateCampaignEmail(slot, ctx, input.landingPageUrl);
      return { sequenceNumber: slot.sequenceNumber, slotPurpose: slot.slotPurpose, dayOffset: slot.dayOffset, subject, body };
    })),
  ]);

  return { theme, researchNote, sections, emails };
}
