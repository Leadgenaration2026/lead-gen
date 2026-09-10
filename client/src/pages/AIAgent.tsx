import { useState, useRef, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";
import { TagPicker } from "@/components/TagPicker";
import { LeadVerificationReviewDialog, type LeadReviewRow } from "@/components/LeadVerificationReviewDialog";
import { EmailEditorDialog } from "@/components/EmailEditorDialog";
import { EmailApprovalCard } from "@/components/EmailApprovalCard";
import { MediaPickerDialog } from "@/components/MediaPickerDialog";
import { Sparkles, User, Loader2, Send, Eye, RotateCcw, Pencil, Check, ArrowRight, X, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { WIZARD_STORAGE_KEY } from "@/lib/aiAgentStorage";

// Same fixed value lists the Leads page uses for these same selects (Leads.tsx
// ~2716-2819) -- kept identical since Seamless.AI only accepts these exact
// strings for country/companySize.
const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "India", "Germany",
  "France", "Singapore", "UAE", "Netherlands", "Japan", "Brazil", "South Africa",
  "New Zealand", "Ireland",
];
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
];
const COMPANY_SIZES = [
  "0 - 1 (Self-employed)", "2 - 10", "11 - 50", "51 - 200", "201 - 500",
  "501 - 1,000", "1,001 - 5,000", "5,001 - 10,000", "10,001+",
];

// The FULL list of industry values Seamless.AI accepts -- mirrors
// SEAMLESS_INDUSTRY_OPTIONS in server/seamlessAI.ts exactly (kept as a
// client-side literal since server modules can't be imported into the
// client bundle). Picking from this list lets the request skip the
// free-text industry parser entirely and go straight to a valid Seamless
// filter. This used to be trimmed down to only the ~30 broad "umbrella"
// entries (the first of each line below) -- but Seamless's own data is
// mostly tagged with the SPECIFIC categories ("Law Practice", "Real
// Estate", "Restaurants", "Computer Software"...), which weren't
// selectable, forcing every search into the broad parent term instead
// and often returning far fewer (sometimes zero) real matches than
// picking the specific category would have.
const INDUSTRY_OPTIONS = [
  "Aerospace & Defense", "Airlines & Aviation", "Aviation & Aerospace", "Defense & Space", "Military",
  "Agriculture", "Farming", "Horticulture", "Ranching", "Tobacco",
  "Apparel & Fashion", "Textiles",
  "Automotive",
  "Chemicals & Materials", "Chemicals", "Plastics",
  "Consumer Goods & Retail", "Consumer Goods", "Luxury Goods & Jewelry", "Retail", "Sporting Goods",
  "Education & Training", "E-Learning", "Education Management", "Higher Education", "Libraries", "Primary/Secondary Education",
  "Electronics & Hardware", "Computer Hardware", "Consumer Electronics", "Electrical & Electronic Manufacturing", "Semiconductors",
  "Energy & Utilities", "Oil & Energy", "Utilities",
  "Entertainment", "Animation", "Arts & Crafts", "Computer Games", "Fine Art", "Gambling & Casinos", "Mobile Games", "Motion Pictures & Film", "Music", "Performing Arts", "Photography", "Recreational Facilities & Services", "Sports",
  "Environmental", "Environmental Services", "Renewables & Environment",
  "Finance & Banking", "Banking", "Capital Markets", "Financial Services", "Investment Banking", "Investment Management", "Venture Capital & Private Equity",
  "Food & Beverage", "Dairy", "Fishery", "Food & Beverages", "Food Production", "Restaurants", "Supermarkets", "Wine & Spirits",
  "Government & Public Policy", "Executive Office", "Government Administration", "Government Relations", "Judiciary", "Law Enforcement", "Legislative Office", "Political Organization", "Public Policy", "Public Safety",
  "Health & Wellness", "Alternative Medicine", "Health, Wellness and Fitness", "Hospital & Health Care", "Medical Practice", "Mental Health Care", "Veterinary",
  "Hospitality & Tourism", "Events Services", "Hospitality", "Leisure, Travel & Tourism", "Museums & Institutions",
  "Household, Personal, & Beauty", "Consumer Services", "Cosmetics", "Furniture", "Individual & Family Services",
  "Insurance",
  "Internet & E-Commerce", "Internet",
  "Manufacturing & Engineering", "Civil Engineering", "Industrial Automation", "Machinery", "Mechanical or Industrial Engineering", "Railroad Manufacture", "Shipbuilding",
  "Marketing & Media", "Broadcast Media", "Graphic Design", "Marketing & Advertising", "Media Production", "Newspapers", "Online Media", "Printing", "Public Relations & Communications", "Publishing", "Writing & Editing",
  "Metals, Mining & Materials", "Building Materials", "Glass, Ceramics & Concrete", "Mining & Metals", "Paper & Forest Products",
  "Non-Profit", "Fund-Raising", "Non-Profit Organization Management", "Philanthropy", "Religious Institutions",
  "Pharmaceuticals & Medical Devices", "Biotechnology", "Medical Devices", "Nanotechnology", "Pharmaceuticals",
  "Professional Services & Consulting", "Accounting", "Alternative Dispute Resolution", "Civic & Social Organization", "Design", "Human Resources", "International Affairs", "International Trade & Development", "Law Practice", "Legal Services", "Management Consulting", "Market Research", "Outsourcing/Offshoring", "Professional Training & Coaching", "Program Development", "Research", "Security & Investigations", "Staffing & Recruiting", "Think Tanks",
  "Real Estate & Construction", "Architecture & Planning", "Commercial Real Estate", "Construction", "Facilities Services", "Real Estate",
  "Software & Information Technology", "Computer & Network Security", "Computer Software", "Information Services", "Information Technology & Services", "Software Development",
  "Telecommunications & Networking", "Computer Networking", "Telecommunications", "Wireless",
  "Transportation & Logistics", "Logistics & Supply Chain", "Maritime", "Package/Freight Delivery", "Packaging & Containers", "Translation & Localization", "Transportation/Trucking/Railroad",
  "Wholesale & Distribution", "Business Supplies & Equipment", "Import & Export", "Warehousing", "Wholesale",
];

// Common job titles covering the groups in TITLE_EXPANSION_MAP
// (server/titleExpansionMap.ts) -- picking from this list is passed as
// titlesOverride, so Seamless matches on these exact titles instead of
// leaving title extraction to the free-text parser.
const JOB_TITLE_OPTIONS = [
  "Owner", "Founder", "CEO", "President", "COO", "CFO", "CTO", "CMO",
  "VP of Sales", "Sales Manager", "VP of Marketing", "Marketing Manager",
  "VP of Engineering", "Engineering Manager", "IT Director", "HR Director",
  "Operations Manager", "General Manager", "Director", "Manager",
  "Business Development Manager", "Account Executive",
];

type Step =
  | "resumeConfirm"
  | "location" | "companySize" | "industry" | "jobTitles" | "otherCriteria" | "count" | "leadSetName"
  | "searchingLeads"
  | "outreachMode"
  // AI landing page + verified 8-email pipeline (the "MASTER IMPLEMENTATION
  // INSTRUCTION" flow: verify -> tag gate -> auto-continue -> landing page +
  // 8 emails -> pre-flight -> launch gate). Branches off after leads are
  // saved, alongside the pre-existing "classic single email" steps below,
  // which stay completely unchanged for that path.
  | "verifyingEmails" | "verificationSummary" | "tagAssignment"
  | "landingPageChoice" | "existingLandingPagePicker"
  | "offerPrompt" | "stylePrompt" | "logoPrompt" | "heroMediaPrompt" | "buildingLandingPage" | "sequenceReview" | "reviewSequenceEmails" | "publishLandingPage" | "preflightCheck"
  | "emailPrompt" | "generatingEmail" | "emailReview" | "editingEmail"
  | "followUpCount" | "generatingFollowUpPreview" | "followUpPreview" | "templateName" | "savingTemplate"
  | "scheduleChoice" | "scheduleDatetime" | "campaignName"
  | "summary" | "launching" | "done";

interface ChatMessage {
  id: number;
  role: "agent" | "user";
  text?: string;
  content?: ReactNode;
}

interface WizardData {
  country: string;
  state: string;
  companySize: string;
  industries: string[];
  jobTitles: string[];
  otherCriteria: string;
  // Combined, human-readable form of industries/jobTitles/otherCriteria --
  // built once all three are collected, then used everywhere a free-text
  // instruction is needed (search instruction, email context, template name).
  criteria: string;
  count: number;
  leadSetName: string;
  // Set when this run was launched via "Continue with AI Agent" from a saved
  // Seamless search (Seamless Leads > Search History) -- carries the saved
  // pagination cursor/progress so runLeadGeneration resumes instead of
  // starting a brand-new search from scratch.
  resumeSearchId: number | null;
  resumeNextToken: string | null;
  resumeExtractedSoFar: number;
  usedSeamless: boolean;
  leadSetId: number | null;
  leadIds: number[];
  leadsSummary: string;
  // First lead in the newly-saved batch, if any -- used as a representative
  // example for the follow-up preview step, so the sample reads like a real
  // email instead of "Hi there, at your company".
  sampleLeadName: string;
  sampleLeadCompany: string;
  sampleLeadIndustry: string;
  emailPrompt: string;
  subject: string;
  body: string;
  followUpCount: number;
  followUpPreviews: Array<{ sequenceNumber: number; dayOffset: number; emailType: string; subject: string; body: string }>;
  templateName: string;
  templateId: number | null;
  scheduleNow: boolean;
  scheduledAt: string; // datetime-local value
  campaignName: string;
  campaignId: number | null;
  // AI landing page + verified 8-email pipeline fields
  pipelineMode: "classic" | "landing_page" | null;
  verificationJobId: string | null;
  verifiedLeadIds: number[]; // leads the user kept selected in the verification review dialog
  verifiedLeadSetId: number | null; // the TAG assigned via the approval gate (distinct from leadSetId, the source list)
  // Lightweight lead info (not the full row) captured once right after
  // generation, purely so the verification-review dialog can show a name/
  // company next to each email without a second round-trip.
  leadDetails: Array<{ id: number; ownerName: string; companyName: string }>;
  logoUrl: string;
  heroImageUrl: string;
  heroVideoUrl: string;
  stylePreference: string;
  generatedLandingPageId: number | null;
  publishedUrl: string | null;
  preflightPassed: boolean;
}

const DEFAULTS: WizardData = {
  country: "United States", state: "", companySize: "",
  industries: [], jobTitles: [], otherCriteria: "", criteria: "", count: 25,
  leadSetName: "", resumeSearchId: null, resumeNextToken: null, resumeExtractedSoFar: 0,
  usedSeamless: false, leadSetId: null, leadIds: [], leadsSummary: "",
  pipelineMode: null, verificationJobId: null, verifiedLeadIds: [], verifiedLeadSetId: null,
  leadDetails: [], logoUrl: "", heroImageUrl: "", heroVideoUrl: "", stylePreference: "",
  generatedLandingPageId: null, publishedUrl: null, preflightPassed: false,
  sampleLeadName: "", sampleLeadCompany: "", sampleLeadIndustry: "",
  emailPrompt: "", subject: "", body: "", followUpCount: 7, followUpPreviews: [], templateName: "", templateId: null,
  scheduleNow: true, scheduledAt: "", campaignName: "", campaignId: null,
};

// A pasted hero-media URL from a recognized video host routes into
// heroVideoUrl (rendered as an embed) instead of heroImageUrl -- everything
// else is treated as a plain image URL.
const HERO_VIDEO_HOST_PATTERN = /(?:youtube\.com|youtu\.be|vimeo\.com)/i;

// Persists the wizard so navigating to another page and back (or an
// accidental tab close) doesn't lose an in-progress conversation --
// previously this was purely in-memory React state, lost the instant the
// component unmounted. localStorage (not sessionStorage) so it survives a
// closed tab too, not just SPA navigation. Only step+data+messages are
// saved; ChatMessage.content (rich cards like TagPicker/SequenceReviewCard)
// is a ReactNode and can't be serialized, so it's intentionally dropped --
// renderInputArea() drives the actual interactive UI off `step`/`data`
// alone, not off message history, so those cards work correctly again the
// moment a step re-renders; only their PAST occurrences in the transcript
// are what's lost on resume. WIZARD_STORAGE_KEY lives in a shared file
// (not here) so DashboardLayout.tsx can check for a resumable conversation
// too, and show a "Resume" indicator on the nav item itself -- the
// literal "a link should be there" ask, visible from anywhere in the app,
// not just after already navigating back to this page.
type SerializableChatMessage = { id: number; role: "agent" | "user"; text?: string };
interface PersistedWizardState {
  step: Step;
  data: WizardData;
  messages: SerializableChatMessage[];
  savedAt: number;
}

function loadPersistedWizardState(): PersistedWizardState | null {
  try {
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWizardState;
    // Nothing worth offering to resume if it never got past the opening
    // question, or if it already finished.
    if (!parsed || parsed.step === "location" || parsed.step === "done" || (parsed.messages?.length || 0) <= 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function AIAgentPage() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState<Step>("location");
  const [data, setData] = useState<WizardData>(DEFAULTS);
  const [textInput, setTextInput] = useState("");
  // Search box for the industry/job-title multi-select steps -- industry
  // alone has ~185 options, too many to just scroll through.
  const [filterText, setFilterText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  // Read synchronously (not in a useEffect) so it's correct on the very
  // first render -- the "generic greeting" effect below checks this same
  // value on mount, and a useEffect-set value wouldn't be visible there
  // until a second render.
  const [resumeSearchId] = useState<number | null>(() => {
    const id = new URLSearchParams(window.location.search).get("resumeSearchId");
    return id ? parseInt(id, 10) : null;
  });

  // Held (not applied) until the user explicitly chooses to continue or
  // delete -- a saved conversation is never silently auto-resumed. Ignored
  // entirely when arriving via resumeSearchId (that flow has its own,
  // unrelated resume prompt and takes priority).
  const [pendingResume, setPendingResume] = useState<PersistedWizardState | null>(() => (resumeSearchId !== null ? null : loadPersistedWizardState()));

  const utils = trpc.useUtils();
  const settingsQuery = trpc.settings.get.useQuery();
  const searchPreviewMutation = trpc.leads.searchSeamlessPreview.useMutation();
  const enrichMutation = trpc.leads.enrichSeamlessSelection.useMutation();
  const generateLeadsMutation = trpc.leads.generate.useMutation();
  const generateEmailMutation = trpc.email.generateAITemplate.useMutation();
  const previewFollowUpsMutation = trpc.email.previewFollowUpSchedule.useMutation();
  const createTemplateMutation = trpc.campaignTemplates.create.useMutation();
  const createCampaignMutation = trpc.campaigns.create.useMutation();
  const launchCampaignMutation = trpc.campaigns.launch.useMutation();
  const resumeSearchQuery = trpc.seamlessSearches.getById.useQuery(
    { id: resumeSearchId as number },
    { enabled: resumeSearchId !== null }
  );
  const createSeamlessSearchMutation = trpc.seamlessSearches.create.useMutation();
  const updateSeamlessSearchProgressMutation = trpc.seamlessSearches.updateProgress.useMutation();

  // AI landing page + verified 8-email pipeline mutations
  const startVerificationMutation = trpc.verification.startJob.useMutation();
  const [pollingVerificationJobId, setPollingVerificationJobId] = useState<string | null>(null);
  const [showLeadReviewDialog, setShowLeadReviewDialog] = useState(false);
  const [leadReviewRows, setLeadReviewRows] = useState<LeadReviewRow[]>([]);
  const verificationJobStatusQuery = trpc.verification.getJobStatus.useQuery(
    { jobId: pollingVerificationJobId as string },
    { enabled: !!pollingVerificationJobId, refetchInterval: (query) => (query.state.data?.status === "in_progress" || query.state.data?.status === "pending" ? 1500 : false) }
  );
  const generateLandingPageMutation = trpc.landingPages.generate.useMutation();
  const existingLandingPagesQuery = trpc.landingPages.list.useQuery(undefined, { enabled: step === "existingLandingPagePicker" });
  const createCampaignFromSequenceMutation = trpc.landingPages.createCampaignFromSequence.useMutation();
  const scheduleExistingCampaignMutation = trpc.campaigns.scheduleExisting.useMutation();
  const updateLandingPageSectionsMutation = trpc.landingPages.updateSections.useMutation();
  const publishLandingPageMutation = trpc.landingPages.publish.useMutation();
  const applyLandingPageAiEditMutation = trpc.landingPages.applyAiEdit.useMutation();
  const updateCampaignMutation = trpc.campaigns.update.useMutation();

  const nextId = () => ++idCounter.current;
  const addAgent = (text?: string, content?: ReactNode) => {
    setMessages((prev) => [...prev, { id: nextId(), role: "agent", text, content }]);
  };
  const addUser = (text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Opening question -- runs once, unless we're resuming a saved search (that
  // flow shows its own greeting once the search record loads, below) or
  // there's a saved conversation still awaiting a continue/delete decision
  // (handleResumeChatContinue/Delete take it from there instead).
  useEffect(() => {
    if (resumeSearchId !== null || pendingResume !== null) return;
    addAgent(
      "Hi! I'm your AI Agent. I'll find leads matching your criteria, write an email to reach out to them, set up follow-ups, and schedule the campaign -- all in one go.\n\nLet's start: what location are you targeting?"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saves the conversation on every meaningful change so navigating away and
  // back (or an accidental tab close) can offer to resume it. Skipped while
  // a save/delete decision is still pending (don't overwrite what the user
  // hasn't chosen yet), for a not-yet-started conversation, and once done
  // (a finished campaign has nothing left to resume).
  useEffect(() => {
    if (pendingResume) return;
    if (step === "location" && messages.length <= 1) {
      localStorage.removeItem(WIZARD_STORAGE_KEY);
      return;
    }
    if (step === "done") {
      localStorage.removeItem(WIZARD_STORAGE_KEY);
      return;
    }
    try {
      const serializableMessages: SerializableChatMessage[] = messages.map((m) => ({ id: m.id, role: m.role, text: m.text }));
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step, data, messages: serializableMessages, savedAt: Date.now() }));
    } catch {
      // localStorage can throw (quota, private browsing) -- losing the
      // ability to resume isn't worth surfacing an error over.
    }
  }, [step, data, messages, pendingResume]);

  const handleResumeChatContinue = () => {
    if (!pendingResume) return;
    setData(pendingResume.data);
    // Rich-content-only messages (a card with no accompanying text) can't be
    // restored -- their content was never serializable -- so they're dropped
    // rather than rendered as an empty bubble. renderInputArea() drives the
    // actual next action off `step`, not message history, so nothing
    // functional is lost, only some of the past transcript.
    setMessages(pendingResume.messages.filter((m) => !!m.text).map((m) => ({ id: m.id, role: m.role, text: m.text })));
    setStep(pendingResume.step);
    idCounter.current = pendingResume.messages.reduce((max, m) => Math.max(max, m.id), 0);
    setPendingResume(null);
  };

  const handleResumeChatDelete = () => {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
    setPendingResume(null);
  };

  // "Continue with AI Agent" from Seamless Leads > Search History -- hydrates
  // the wizard from the saved search (criteria, saved pagination cursor, and
  // how many leads have been extracted so far / are still available) and
  // jumps straight to a confirm step instead of re-asking every question.
  useEffect(() => {
    if (!resumeSearchQuery.data) return;
    const s: any = resumeSearchQuery.data;
    setData((d) => ({
      ...d,
      country: s.country || "",
      state: s.state || "",
      companySize: s.companySize || "",
      industries: s.industryOverride ? [s.industryOverride] : [],
      jobTitles: s.titlesOverride || [],
      criteria: s.instruction || "",
      count: s.requestedCount || 25,
      leadSetName: s.leadSetName || "",
      resumeSearchId: s.id,
      resumeNextToken: s.nextToken || null,
      resumeExtractedSoFar: s.extractedSoFar || 0,
    }));
    const remaining = typeof s.totalAvailable === "number" ? Math.max(0, s.totalAvailable - (s.extractedSoFar || 0)) : null;
    addAgent(
      `Welcome back! I found your saved search: "${s.instruction}"${s.leadSetName ? ` (list: ${s.leadSetName})` : ""}.\n\n` +
      `${s.extractedSoFar || 0} lead(s) extracted so far` +
      `${typeof s.totalAvailable === "number" ? ` out of ~${s.totalAvailable} total available` : ""}` +
      `${remaining !== null ? ` (~${remaining} remaining).` : "."}`
    );
    setStep("resumeConfirm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSearchQuery.data]);

  // ---- Step 1: location ----
  const submitLocation = () => {
    const label = data.country === "United States" && data.state ? `${data.state}, United States` : (data.country || "Any location");
    addUser(label);
    addAgent("Got it. What company size (employee count) are you targeting? Pick one, or skip to search any size.");
    setStep("companySize");
  };

  // ---- Step 2: company size ----
  const submitCompanySize = (size: string) => {
    setData((d) => ({ ...d, companySize: size }));
    addUser(size || "Any size");
    addAgent("Which industries should I target? Pick as many as fit, or skip for any industry.");
    setStep("industry");
  };

  // ---- Step 3: industry (multi-select) ----
  const toggleIndustry = (name: string) => {
    setData((d) => ({
      ...d,
      industries: d.industries.includes(name) ? d.industries.filter((i) => i !== name) : [...d.industries, name],
    }));
  };

  const continueFromIndustry = () => {
    addUser(data.industries.length ? data.industries.join(", ") : "Any industry");
    addAgent("Good. Which job titles are you trying to reach? Pick as many as fit, or skip for any title.");
    setStep("jobTitles");
  };

  // ---- Step 4: job titles (multi-select) ----
  const toggleJobTitle = (name: string) => {
    setData((d) => ({
      ...d,
      jobTitles: d.jobTitles.includes(name) ? d.jobTitles.filter((t) => t !== name) : [...d.jobTitles, name],
    }));
  };

  const continueFromJobTitles = () => {
    addUser(data.jobTitles.length ? data.jobTitles.join(", ") : "Any title");
    addAgent("Anything else I should know -- keywords, company stage, etc.? Or just say \"skip\".");
    setStep("otherCriteria");
  };

  // ---- Step 5: any other free-text criteria, then combine everything ----
  const buildCriteriaText = (industries: string[], jobTitles: string[], other: string) => {
    const parts: string[] = [];
    if (jobTitles.length) parts.push(jobTitles.join(", "));
    parts.push(industries.length ? `in the ${industries.join(", ")} industry` : "in any industry");
    if (other.trim()) parts.push(other.trim());
    return parts.join(" ").trim();
  };

  const submitOtherCriteria = (text: string) => {
    const other = text.trim().toLowerCase() === "skip" ? "" : text.trim();
    addUser(other || "(nothing else)");
    setTextInput("");
    const combined = buildCriteriaText(data.industries, data.jobTitles, other);
    setData((d) => ({ ...d, otherCriteria: other, criteria: combined }));
    addAgent("How many leads should I find?");
    setStep("count");
  };

  // ---- Step 4: count ----
  const submitCount = (text: string) => {
    const n = Math.min(1000, Math.max(1, parseInt(text, 10) || 25));
    setData((d) => ({ ...d, count: n }));
    addUser(String(n));
    addAgent("What should I name this list of leads? (or just say \"skip\" and I'll pick a name)");
    setStep("leadSetName");
    setTextInput("");
  };

  // ---- Step 5: lead set name, then kick off the search ----
  const submitLeadSetName = async (text: string) => {
    const name = text.trim().toLowerCase() === "skip" ? "" : text.trim();
    setData((d) => ({ ...d, leadSetName: name }));
    addUser(name || "(let the agent pick a name)");
    setTextInput("");
    await runLeadGeneration(name);
  };

  const runLeadGeneration = async (leadSetName: string) => {
    setStep("searchingLeads");
    setBusy(true);
    // settings.get deliberately never returns the raw seamlessApiKey value
    // (sensitive data isn't sent to the frontend) -- hasSeamlessApiKey is the
    // boolean flag it returns instead, same pattern as hasRetellApiKey/
    // hasClaudeApiKey. Checking the (always-absent) raw key here previously
    // meant this was permanently false regardless of what was configured in
    // Settings, silently forcing every generation through the AI-estimation
    // fallback instead of Seamless.
    const useSeamless = !!(settingsQuery.data as any)?.hasSeamlessApiKey;
    addAgent(useSeamless ? "Searching Seamless.AI for matching leads..." : "Generating leads with AI (Seamless.AI isn't configured in Settings, so I'm using AI estimation instead)...");
    // Local, not read back from `data` state after setData -- state updates
    // are async, so the closure below would still see the pre-update value.
    let resolvedLeadSetId: number | null = null;
    let resolvedSummary = "";
    try {
      if (useSeamless) {
        const preview = await searchPreviewMutation.mutateAsync({
          instruction: data.criteria,
          count: data.count,
          country: data.country || undefined,
          state: data.state || undefined,
          companySize: data.companySize || undefined,
          // Only a single industry can override the parser's own multi-industry
          // read (server/routers.ts replaces the whole filter, not merges) -- with
          // more than one selected, the exact canonical names already embedded in
          // `criteria` let the free-text parser pick them all up correctly.
          industryOverride: data.industries.length === 1 ? data.industries[0] : undefined,
          titlesOverride: data.jobTitles.length ? data.jobTitles.slice(0, 10) : undefined,
          // Resumes from a saved search's pagination cursor when launched via
          // "Continue with AI Agent" from Seamless Leads > Search History --
          // undefined (a brand-new search) otherwise.
          nextToken: data.resumeNextToken || undefined,
        });
        const totalAvailable = typeof preview.totalAvailable === "number" ? preview.totalAvailable : null;
        if (preview.candidates.length === 0) {
          setBusy(false);
          const totalNote = totalAvailable !== null
            ? ` Seamless reports ${totalAvailable} total matching lead(s) for this criteria, but none of them are new right now.`
            : "";
          // rawFetchedTotal/rejectedByX are only present on the empty-candidates
          // response (see leads.searchSeamlessPreview) -- they say WHY Seamless
          // results got filtered down to zero, so the message can point at the
          // actual narrowing filter instead of a dead-end "0 candidates" with
          // no next step.
          const raw = (preview as any).rawFetchedTotal ?? 0;
          const rejectedByTitle = (preview as any).rejectedByTitle ?? 0;
          const rejectedByIndustry = (preview as any).rejectedByIndustry ?? 0;
          const rejectedByCountry = (preview as any).rejectedByCountry ?? 0;
          let causeNote = "";
          if (raw > 0 && preview.skippedAlreadyOwned === 0 && preview.skippedExcluded === 0) {
            if (rejectedByTitle >= raw) {
              causeNote = ` Seamless found ${raw} raw match(es), but ALL were rejected because none had a job title that exactly matched what you picked -- try removing job titles or picking broader ones.`;
            } else if (rejectedByIndustry >= raw) {
              causeNote = ` Seamless found ${raw} raw match(es), but ALL were rejected by the industry filter -- try a broader/different industry, or Skip industry entirely.`;
            } else if (rejectedByCountry >= raw) {
              causeNote = ` Seamless found ${raw} raw match(es), but ALL were outside the selected location -- try a broader location.`;
            } else if (rejectedByTitle + rejectedByIndustry + rejectedByCountry > 0) {
              causeNote = ` Seamless found ${raw} raw match(es), but the combination of location/industry/job-title filters together narrowed it down to zero -- try removing one of them.`;
            }
          }
          addAgent(
            `I couldn't find any new candidates for that criteria (${preview.skippedAlreadyOwned} already in your system, ${preview.skippedExcluded} previously discarded).${totalNote}${causeNote} Want to try different criteria? Let's pick again.`
          );
          setStep("industry");
          return;
        }
        const enrichResult = await enrichMutation.mutateAsync({
          leadSetName: leadSetName || undefined,
          candidates: preview.candidates.map((c: any) => ({
            searchResultId: c.searchResultId,
            ownerName: c.ownerName,
            companyName: c.companyName,
            jobTitle: c.jobTitle,
            email: c.email,
            city: c.city,
            state: c.state,
            country: c.country,
            website: c.website,
            industry: c.industry,
            linkedinUrl: c.linkedinUrl,
          })),
        });
        // Enrichment drops any candidate missing a complete phone number,
        // email, AND owner name -- a real, separate narrowing step after the
        // preview/search stage above, and previously never explained here.
        // A user searching a small state + narrow title/employee-size
        // combo (e.g. Delaware, "Owner", 2-10 employees) can easily see
        // Seamless preview 30-40 raw candidates, then watch more than half
        // of them get dropped here for incomplete contact data -- with no
        // message, that reads as "the extraction undercounted" when it's
        // actually this completeness filter doing its job.
        const droppedForMissingContact = (enrichResult as any).droppedForMissingContact || 0;
        const missingContactNote = droppedForMissingContact > 0
          ? ` ${droppedForMissingContact} of the ${preview.candidates.length} candidate(s) found were dropped for missing a complete phone number, email, or name.`
          : "";
        if (enrichResult.count === 0) {
          setBusy(false);
          addAgent(`All ${enrichResult.duplicatesSkipped} matching contacts are already in your system.${missingContactNote} Want to try different criteria?`);
          setStep("industry");
          return;
        }
        resolvedLeadSetId = enrichResult.leadSetId ?? null;
        const totalExtracted = (data.resumeExtractedSoFar || 0) + enrichResult.count;
        const remaining = totalAvailable !== null ? Math.max(0, totalAvailable - totalExtracted) : null;
        resolvedSummary = `${enrichResult.count} lead(s) extracted from Seamless.AI (${enrichResult.enrichmentCreditsUsed} credit(s) used)${enrichResult.duplicatesSkipped ? `, ${enrichResult.duplicatesSkipped} duplicate(s) skipped` : ""}.${missingContactNote}` +
          (remaining !== null && remaining > 0
            ? ` ~${remaining} more may still be available for this criteria -- find it later under Seamless Leads > Search History to extract more.`
            : "");
        setData((d) => ({ ...d, usedSeamless: true, leadSetId: resolvedLeadSetId, leadsSummary: resolvedSummary }));

        // Save/update this search's progress so it shows up (with a real
        // remaining count) on Seamless Leads > Search History, resumable
        // either from there or by coming back into the AI Agent later. Best
        // effort -- the leads themselves are already saved successfully
        // above regardless of whether this bookkeeping call succeeds.
        try {
          if (data.resumeSearchId) {
            await updateSeamlessSearchProgressMutation.mutateAsync({
              id: data.resumeSearchId,
              nextToken: preview.nextToken,
              totalAvailable: totalAvailable ?? undefined,
              extractedSoFar: totalExtracted,
              leadSetName: leadSetName || undefined,
            });
          } else {
            await createSeamlessSearchMutation.mutateAsync({
              instruction: data.criteria,
              country: data.country || undefined,
              state: data.state || undefined,
              companySize: data.companySize || undefined,
              industryOverride: data.industries.length === 1 ? data.industries[0] : undefined,
              titlesOverride: data.jobTitles.length ? data.jobTitles.slice(0, 10) : undefined,
              requestedCount: data.count,
              leadSetName: leadSetName || undefined,
              nextToken: preview.nextToken,
              totalAvailable: totalAvailable ?? undefined,
              extractedSoFar: enrichResult.count,
            });
          }
        } catch (historyError) {
          console.error("Failed to save search history:", historyError);
        }
      } else {
        const criteriaWithSize = data.companySize ? `${data.criteria} (company size: ${data.companySize})` : data.criteria;
        const result = await generateLeadsMutation.mutateAsync({
          instruction: criteriaWithSize,
          count: data.count,
          leadSetName: leadSetName || undefined,
          source: "ai",
          country: data.country || undefined,
          state: data.state || undefined,
          industryOverride: data.industries.length === 1 ? data.industries[0] : undefined,
          titlesOverride: data.jobTitles.length ? data.jobTitles.slice(0, 10) : undefined,
        });
        if (result.count === 0) {
          setBusy(false);
          addAgent(`Everything AI found for that criteria is already in your system (${(result as any).duplicatesSkipped || 0} duplicate(s)). Want to try different criteria?`);
          setStep("industry");
          return;
        }
        resolvedLeadSetId = (result as any).leadSetId ?? null;
        resolvedSummary = `${result.count} lead(s) generated with AI${(result as any).duplicatesSkipped ? `, ${(result as any).duplicatesSkipped} duplicate(s) skipped` : ""}.`;
        setData((d) => ({ ...d, usedSeamless: false, leadSetId: resolvedLeadSetId, leadsSummary: resolvedSummary }));
      }

      // Fetch the real saved lead rows now that we have a leadSetId, so we
      // have real leadIds to attach to the campaign later. Uses utils.fetch
      // (imperative, explicit input) rather than a useQuery + refetch(),
      // since a useQuery's refetch() re-runs with whatever input was set on
      // the LAST render -- resolvedLeadSetId isn't reflected in component
      // state yet at this point (setData above hasn't re-rendered), so a
      // plain refetch() would still query with the previous (null) id.
      const leadRows = resolvedLeadSetId
        ? await utils.leads.listBySourceListOrTag.fetch({ sourceListId: resolvedLeadSetId })
        : [];
      const ids = (leadRows || []).map((l: any) => l.id);
      const firstLead: any = (leadRows || [])[0];
      const details = (leadRows || []).map((l: any) => ({ id: l.id, ownerName: l.ownerName || "", companyName: l.companyName || "" }));
      setData((d) => ({
        ...d,
        leadIds: ids,
        leadDetails: details,
        sampleLeadName: firstLead?.ownerName || "",
        sampleLeadCompany: firstLead?.companyName || "",
        sampleLeadIndustry: firstLead?.industry || "",
      }));

      setBusy(false);
      addAgent(
        undefined,
        <div className="space-y-2">
          <p className="text-sm">{resolvedSummary || "Leads saved."} They're filed under a new list you can see on the Leads page.</p>
        </div>
      );
      addAgent(
        "How do you want to reach these leads?\n\n1. Build a full landing page + verified 8-email campaign (recommended) -- I'll verify every email address, ask which tag to file the verified ones under, then research the market, design a landing page, and write all 8 emails.\n2. Just write one email the classic way -- no landing page, no verification gate."
      );
      setStep("outreachMode");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I ran into a problem finding leads: ${error?.message || "unknown error"}. Want to try again, or adjust the criteria?`);
      setStep("industry");
    }
  };

  // ---- Outreach mode branch: landing page + verified pipeline, or classic single email ----
  const submitOutreachMode = (mode: "landing_page" | "classic") => {
    setData((d) => ({ ...d, pipelineMode: mode }));
    if (mode === "classic") {
      addUser("Just write one email the classic way");
      addAgent("Now let's write the email. What should it say -- your value proposition, what you're offering, or the angle you want to take?");
      setStep("emailPrompt");
      return;
    }
    addUser("Build a full landing page + verified 8-email campaign");
    runVerification();
  };

  const runVerification = async () => {
    setStep("verifyingEmails");
    setBusy(true);
    addAgent("Verifying email addresses (in-house checks, plus a Bouncer cross-check if you have one configured)...");
    try {
      const result = await startVerificationMutation.mutateAsync({ leadIds: data.leadIds.map(String) });
      setData((d) => ({ ...d, verificationJobId: result.jobId }));
      setPollingVerificationJobId(result.jobId);
      setBusy(false);
    } catch (error: any) {
      setBusy(false);
      addAgent(`I couldn't start verification: ${error?.message || "unknown error"}. Want to try again, or use the classic single-email flow instead?`);
      setStep("outreachMode");
    }
  };

  // Fires when the polled verification job (see verificationJobStatusQuery
  // below) reaches a terminal state -- this can't be inline in
  // runVerification() since the job runs server-side, fire-and-forget, and
  // this component only learns about its progress via polling.
  const handleVerificationSettled = async (job: any) => {
    setPollingVerificationJobId(null);
    if (job.status === "failed") {
      addAgent(`Verification failed: ${job.errorMessage || "unknown error"}. Want to try again, or use the classic flow instead?`);
      setStep("outreachMode");
      return;
    }
    addAgent(
      undefined,
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
        <div><strong>{job.validCount}</strong> Valid</div>
        <div><strong>{job.invalidCount}</strong> Invalid</div>
        <div><strong>{job.catchAllCount}</strong> Catch-All</div>
        <div><strong>{job.roleBasedCount}</strong> Role-Based</div>
        <div><strong>{job.disposableCount}</strong> Disposable</div>
        <div><strong>{job.unknownCount}</strong> Unknown</div>
      </div>
    );
    // Every result, not just "valid" -- the review dialog shows the full
    // picture (verified AND not) so the user picks who actually proceeds,
    // same as doing this by hand, instead of a silent valid-only filter.
    const results = await utils.verification.listResults.fetch({ jobId: job.jobId, limit: 1000 });
    const detailsById = new Map(data.leadDetails.map((d) => [d.id, d]));
    const rows: LeadReviewRow[] = (results || [])
      .filter((r: any) => typeof r.leadId === "number")
      .map((r: any) => ({
        leadId: r.leadId,
        email: r.email,
        normalizedStatus: r.normalizedStatus,
        ownerName: detailsById.get(r.leadId)?.ownerName,
        companyName: detailsById.get(r.leadId)?.companyName,
      }));
    if (rows.length === 0) {
      addAgent("None of these leads came back with a usable result, so there's nothing to review yet. Want to try different criteria?");
      setStep("outreachMode");
      return;
    }
    setLeadReviewRows(rows);
    setShowLeadReviewDialog(true);
    addAgent(`${rows.length} lead(s) verified. Review the list and pick which ones to proceed with.`);
  };

  const handleLeadReviewConfirm = (selectedLeadIds: number[]) => {
    setShowLeadReviewDialog(false);
    addUser(`Proceed with ${selectedLeadIds.length} lead(s)`);
    setData((d) => ({ ...d, verifiedLeadIds: selectedLeadIds }));
    if (selectedLeadIds.length === 0) {
      addAgent("No leads selected, so there's nothing to tag or build a campaign for yet. Want to try different criteria?");
      setStep("outreachMode");
      return;
    }
    addAgent(`${selectedLeadIds.length} lead(s) selected. Which tag should they go to?`);
    setStep("tagAssignment");
  };

  // Fires once the polled verification job (verificationJobStatusQuery,
  // driven by pollingVerificationJobId) reaches a terminal state.
  useEffect(() => {
    const job = verificationJobStatusQuery.data;
    if (!job || !pollingVerificationJobId) return;
    if (job.status === "completed" || job.status === "failed") {
      handleVerificationSettled(job);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationJobStatusQuery.data]);

  const handleTagConfirmed = (leadSetId: number, tagName: string) => {
    addUser(`Assign to "${tagName}"`);
    setData((d) => ({ ...d, verifiedLeadSetId: leadSetId }));
    addAgent(`${data.verifiedLeadIds.length} lead(s) assigned to "${tagName}".\n\nWould you like me to build a brand new landing page, or reuse one you already have?`);
    setStep("landingPageChoice");
  };

  const chooseNewLandingPage = () => {
    addUser("Create a new one");
    addAgent("Great -- what's your offer? Your value proposition, what you're offering, or the angle you want to take.");
    setStep("offerPrompt");
  };

  const chooseExistingLandingPage = () => {
    addUser("Use an existing one");
    setStep("existingLandingPagePicker");
  };

  const useExistingLandingPage = async (landingPageId: number, name: string) => {
    addUser(`Use "${name}"`);
    setStep("buildingLandingPage");
    setBusy(true);
    addAgent("Setting up your campaign with that landing page...");
    try {
      setData((d) => ({ ...d, generatedLandingPageId: landingPageId }));
      const industry = data.industries.join(", ") || data.otherCriteria || "general business";
      const campaignResult = await createCampaignFromSequenceMutation.mutateAsync({
        landingPageId,
        campaignName: data.leadSetName || `${industry} Campaign`,
        leadIds: data.verifiedLeadIds,
      });
      const campaignId = (campaignResult as any).campaignId;
      if (!campaignId) throw new Error("Campaign creation did not return an id");
      setData((d) => ({ ...d, campaignId }));

      setBusy(false);
      addAgent(
        undefined,
        <SequenceReviewCard landingPageId={landingPageId} onEdited={() => addAgent("Updated -- let me know if you want anything else changed, or continue when it looks good.")} />
      );
      addAgent("Here's that landing page and its emails. Use the AI edit box if you want anything changed, then continue when it looks good.");
      setStep("sequenceReview");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I ran into a problem setting up the campaign: ${error?.message || "unknown error"}. Want to try again?`);
      setStep("existingLandingPagePicker");
    }
  };

  const submitOfferPrompt = async (text: string) => {
    if (!text.trim()) return;
    setData((d) => ({ ...d, emailPrompt: text.trim() }));
    addUser(text.trim());
    setTextInput("");
    addAgent("What kind of look and feel do you want for the landing page?");
    setStep("stylePrompt");
  };

  const submitStylePreference = (style: string, label: string) => {
    setData((d) => ({ ...d, stylePreference: style }));
    addUser(label);
    addAgent("Want to add your logo? Paste a URL, upload a file, or skip.");
    setStep("logoPrompt");
  };

  const submitLogoUrl = (url: string) => {
    setData((d) => ({ ...d, logoUrl: url.trim() }));
    addUser(url.trim());
    setTextInput("");
    addAgent("Want a hero image or video for the landing page? Paste an image URL, a YouTube/Vimeo link, upload an image, or skip.");
    setStep("heroMediaPrompt");
  };

  const skipLogo = () => {
    addUser("Skip");
    addAgent("Want a hero image or video for the landing page? Paste an image URL, a YouTube/Vimeo link, upload an image, or skip.");
    setStep("heroMediaPrompt");
  };

  const submitHeroImageUrl = async (url: string) => {
    const trimmed = url.trim();
    const isVideo = HERO_VIDEO_HOST_PATTERN.test(trimmed);
    setData((d) => (isVideo ? { ...d, heroVideoUrl: trimmed } : { ...d, heroImageUrl: trimmed }));
    addUser(trimmed);
    setTextInput("");
    await runLandingPageGeneration(data.emailPrompt, isVideo ? "" : trimmed, isVideo ? trimmed : "");
  };

  const skipHeroMedia = async () => {
    addUser("Skip");
    await runLandingPageGeneration(data.emailPrompt, "", "");
  };

  const runLandingPageGeneration = async (offer: string, heroImageUrl: string, heroVideoUrl: string) => {
    setStep("buildingLandingPage");
    setBusy(true);
    addAgent("Researching the market, designing a landing page, and writing all 8 emails -- this takes a minute...");
    try {
      const industry = data.industries.join(", ") || data.otherCriteria || "general business";
      const pageResult = await generateLandingPageMutation.mutateAsync({
        name: `${data.leadSetName || data.criteria.slice(0, 40) || "AI Agent"} Landing Page`,
        industry,
        targetAudience: data.criteria || "business decision-makers",
        offer,
        logoUrl: data.logoUrl || undefined,
        stylePreference: data.stylePreference || undefined,
      });
      const landingPageId = pageResult.landingPageId;
      setData((d) => ({ ...d, generatedLandingPageId: landingPageId }));

      // Drop the hero image/video straight into the generated hero section,
      // if one was provided -- landingPages.generate itself has no media
      // input, so this is a small additive patch via the existing
      // updateSections mutation right after generation.
      if ((heroImageUrl || heroVideoUrl) && Array.isArray((pageResult.landingPage as any)?.sections)) {
        const sections = [...(pageResult.landingPage as any).sections];
        const heroIndex = sections.findIndex((s: any) => s.type === "hero");
        if (heroIndex >= 0) {
          sections[heroIndex] = {
            ...sections[heroIndex],
            ...(heroVideoUrl ? { videoUrl: heroVideoUrl } : { imageUrl: heroImageUrl }),
          };
          await updateLandingPageSectionsMutation.mutateAsync({ id: landingPageId, sections });
        }
      }

      const campaignResult = await createCampaignFromSequenceMutation.mutateAsync({
        landingPageId,
        campaignName: data.leadSetName || `${industry} Campaign`,
        leadIds: data.verifiedLeadIds,
      });
      const campaignId = (campaignResult as any).campaignId;
      if (!campaignId) throw new Error("Campaign creation did not return an id");
      setData((d) => ({ ...d, campaignId }));

      setBusy(false);
      addAgent(
        undefined,
        <SequenceReviewCard landingPageId={landingPageId} onEdited={() => addAgent("Updated -- let me know if you want anything else changed, or continue when it looks good.")} />
      );
      addAgent("Here's the generated landing page and all 8 emails. Use the AI edit box if you want anything changed, preview each email, then continue to publish.");
      setStep("sequenceReview");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I ran into a problem building the landing page/campaign: ${error?.message || "unknown error"}. Want to try again?`);
      setStep("offerPrompt");
    }
  };

  const continueFromSequenceReview = () => {
    addUser("Looks good, review the emails");
    const landingPageId = data.generatedLandingPageId as number;
    addAgent(
      undefined,
      <EmailApprovalCard landingPageId={landingPageId} onAllApproved={handleAllEmailsApproved} />
    );
    addAgent("Here are the 8 emails -- step through and approve each one, or edit it first.");
    setStep("reviewSequenceEmails");
  };

  const handleAllEmailsApproved = () => {
    addUser("All emails approved");
    runPublishStep();
  };

  const runPublishStep = async () => {
    setStep("publishLandingPage");
    setBusy(true);
    addAgent("Publishing the landing page...");
    try {
      const result = await publishLandingPageMutation.mutateAsync(data.generatedLandingPageId as number);
      setData((d) => ({ ...d, publishedUrl: (result as any).url || null }));
      setBusy(false);
      addAgent(`Published${(result as any).url ? `: ${(result as any).url}` : "."}`);
      runPreflightCheckStep();
    } catch (error: any) {
      setBusy(false);
      addAgent(`I couldn't publish the landing page: ${error?.message || "unknown error"}. Want to try again?`);
    }
  };

  const runPreflightCheckStep = async () => {
    setStep("preflightCheck");
    setBusy(true);
    addAgent("Running a pre-flight check...");
    try {
      const result = await utils.campaigns.runPreflightCheck.fetch(data.campaignId as number);
      setBusy(false);
      addAgent(
        undefined,
        <div className="space-y-1">
          {result.checks.map((c: any) => (
            <p key={c.name} className={`text-xs ${c.status === "pass" ? "text-green-600" : "text-red-600"}`}>
              {c.status === "pass" ? "✓" : "✗"} <strong>{c.name}:</strong> {c.message}
            </p>
          ))}
        </div>
      );
      setData((d) => ({ ...d, preflightPassed: result.passed }));
      addAgent(result.passed ? "Everything checks out. Approve to continue to scheduling?" : "Some checks failed -- fix the issues above (e.g. from the Landing Pages page or Settings), then come back and re-run the check.");
    } catch (error: any) {
      setBusy(false);
      addAgent(`Pre-flight check failed to run: ${error?.message || "unknown error"}.`);
    }
  };

  const approvePreflight = () => {
    addUser("Approve & continue");
    addAgent("Last step: when should this campaign send -- now, or later?");
    setStep("scheduleChoice");
  };

  // ---- Step 6: email prompt ----
  const submitEmailPrompt = async (text: string) => {
    if (!text.trim()) return;
    setData((d) => ({ ...d, emailPrompt: text.trim() }));
    addUser(text.trim());
    setTextInput("");
    await generateEmail(text.trim());
  };

  const generateEmail = async (prompt: string) => {
    setStep("generatingEmail");
    setBusy(true);
    addAgent("Writing the email with Claude...");
    try {
      const companyContext = `Target audience: ${data.criteria}. Company size: ${data.companySize || "any"}. Location: ${data.state ? `${data.state}, ` : ""}${data.country || "any"}.`;
      const result = await generateEmailMutation.mutateAsync({
        prompt,
        emailType: "custom",
        companyContext,
        includeVariables: true,
      });
      setData((d) => ({ ...d, subject: result.subject, body: result.bodyWithoutSignature || result.body }));
      setBusy(false);
      addAgent(
        undefined,
        <EmailReviewCard subject={result.subject} body={result.bodyWithoutSignature || result.body} />
      );
      addAgent("How does that look? Say \"looks good\" to continue, \"regenerate\" for a different version, or \"edit\" to change it yourself.");
      setStep("emailReview");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I couldn't generate the email: ${error?.message || "unknown error"}. Want to try again with a different description?`);
      setStep("emailPrompt");
    }
  };

  const handleEmailReviewReply = (text: string) => {
    const lower = text.trim().toLowerCase();
    addUser(text.trim());
    setTextInput("");
    if (lower.includes("regen") || lower.includes("again") || lower.includes("redo")) {
      generateEmail(`${data.emailPrompt} (write a different version)`);
      return;
    }
    if (lower.includes("edit")) {
      setStep("editingEmail");
      addAgent("No problem -- edit the subject and body below, then save.");
      return;
    }
    // Anything else (including "looks good") is treated as approval.
    addAgent(`How many follow-up emails should I schedule after this one? (0-20, default 7)`);
    setStep("followUpCount");
  };

  const submitEditedEmail = () => {
    addUser("Saved my edits.");
    addAgent("How many follow-up emails should I schedule after this one? (0-20, default 7)");
    setStep("followUpCount");
  };

  // ---- Step 7: follow-up count ----
  const submitFollowUpCount = async (text: string) => {
    const n = Math.min(20, Math.max(0, parseInt(text, 10)));
    const count = isNaN(n) ? 7 : n;
    setData((d) => ({ ...d, followUpCount: count }));
    addUser(text.trim() || "7");
    setTextInput("");

    if (count === 0) {
      addAgent("No follow-ups, got it. What should I call this email template, so it's saved for reuse?");
      setStep("templateName");
      return;
    }

    setStep("generatingFollowUpPreview");
    setBusy(true);
    addAgent(`Writing a sample of each of the ${count} follow-up(s), so you can see the pattern before we save it...`);
    try {
      const result = await previewFollowUpsMutation.mutateAsync({
        followUpCount: count,
        ownerName: data.sampleLeadName || undefined,
        companyName: data.sampleLeadCompany || undefined,
        industry: data.sampleLeadIndustry || undefined,
      });
      setData((d) => ({ ...d, followUpPreviews: result.previews }));
      setBusy(false);
      addAgent(
        undefined,
        <FollowUpPreviewList previews={result.previews} sampleName={data.sampleLeadName} sampleCompany={data.sampleLeadCompany} />
      );
      addAgent("These are samples using one lead as an example -- each real lead gets their own personalized version generated the same way when it's actually due to send. Ready to continue?");
      setStep("followUpPreview");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I couldn't generate the follow-up previews: ${error?.message || "unknown error"}. That's fine -- I'll still schedule ${count} follow-up(s) for real leads at send time. What should I call this email template?`);
      setStep("templateName");
    }
  };

  const continueFromFollowUpPreview = () => {
    addUser("Looks good, continue");
    addAgent("What should I call this email template, so it's saved for reuse?");
    setStep("templateName");
  };

  // ---- Step 8: template name -> save template ----
  const submitTemplateName = async (text: string) => {
    const name = text.trim() || data.leadSetName || data.criteria.slice(0, 60) || "AI Agent Template";
    setData((d) => ({ ...d, templateName: name }));
    addUser(name);
    setTextInput("");
    setStep("savingTemplate");
    setBusy(true);
    addAgent("Saving the template...");
    try {
      const result = await createTemplateMutation.mutateAsync({
        name,
        subject: data.subject,
        emailTemplate: data.body,
        emailType: "custom",
        followUpCount: data.followUpCount,
      });
      setData((d) => ({ ...d, templateId: (result as any).id }));
      setBusy(false);
      addAgent("Template saved. Last step: when should this campaign send -- now, or later?");
      setStep("scheduleChoice");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I couldn't save the template: ${error?.message || "unknown error"}. Want to try a different name?`);
      setStep("templateName");
    }
  };

  // ---- Step 9: schedule choice ----
  const submitScheduleChoice = (now: boolean) => {
    setData((d) => ({ ...d, scheduleNow: now }));
    addUser(now ? "Send now" : "Schedule for later");
    if (now) {
      addAgent("What should I name this campaign?");
      setStep("campaignName");
    } else {
      addAgent("Pick a date and time to launch.");
      setStep("scheduleDatetime");
    }
  };

  const submitScheduleDatetime = () => {
    if (!data.scheduledAt) return;
    addUser(new Date(data.scheduledAt).toLocaleString());
    addAgent("What should I name this campaign?");
    setStep("campaignName");
  };

  // ---- Step 10: campaign name -> summary ----
  const submitCampaignName = async (text: string) => {
    const name = text.trim() || data.templateName || data.leadSetName || "AI Agent Campaign";
    setData((d) => ({ ...d, campaignName: name }));
    addUser(name);
    setTextInput("");
    // The landing-page pipeline's campaign already exists (created during
    // buildingLandingPage with a placeholder name) -- keep it in sync with
    // whatever the user actually types here.
    if (data.pipelineMode === "landing_page" && data.campaignId) {
      updateCampaignMutation.mutateAsync({ id: data.campaignId, data: { name } }).catch(() => {});
    }
    addAgent(
      undefined,
      <SummaryCard data={{ ...data, campaignName: name }} />
    );
    addAgent("Ready to launch this campaign?");
    setStep("summary");
  };

  // ---- Final: launch ----
  const confirmLaunch = async () => {
    addUser("Confirm & launch");
    setStep("launching");
    setBusy(true);
    const isLandingPagePipeline = data.pipelineMode === "landing_page";
    addAgent(isLandingPagePipeline ? "Finalizing the campaign..." : "Creating the campaign...");
    try {
      let campaignId = data.campaignId;
      if (isLandingPagePipeline && campaignId) {
        // The campaign already exists -- created during buildingLandingPage
        // via landingPages.createCampaignFromSequence, before the schedule
        // choice was even asked. Just schedule it if needed; launch below
        // is the same call either way.
        if (!data.scheduleNow) {
          await scheduleExistingCampaignMutation.mutateAsync({ campaignId, scheduledAt: new Date(data.scheduledAt).toISOString() });
        }
      } else {
        const createResult = await createCampaignMutation.mutateAsync({
          name: data.campaignName,
          subject: data.subject,
          emailTemplate: data.body,
          leadIds: data.leadIds,
          templateId: data.templateId || undefined,
          scheduledAt: data.scheduleNow ? undefined : new Date(data.scheduledAt).toISOString(),
        });
        campaignId = (createResult as any).campaignId;
        setData((d) => ({ ...d, campaignId }));
      }

      const sentToCount = isLandingPagePipeline ? data.verifiedLeadIds.length : data.leadIds.length;
      if (data.scheduleNow && campaignId) {
        await launchCampaignMutation.mutateAsync(campaignId);
        setBusy(false);
        addAgent(`Done! The campaign is launched -- emails are going out to ${sentToCount} lead(s) now, with follow-ups scheduled after that.`);
      } else {
        setBusy(false);
        addAgent(`Done! The campaign is scheduled to launch at ${new Date(data.scheduledAt).toLocaleString()}, sending to ${sentToCount} lead(s).`);
      }
      setStep("done");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I couldn't finalize the campaign: ${error?.message || "unknown error"}. Want to try again?`);
      setStep("summary");
    }
  };

  const restart = () => {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
    setData(DEFAULTS);
    setMessages([]);
    setStep("location");
    setTextInput("");
    setFilterText("");
    setPollingVerificationJobId(null);
    setShowLeadReviewDialog(false);
    setLeadReviewRows([]);
    setBusy(false);
    idCounter.current = 0;
    setTimeout(() => addAgent("Let's set up another campaign. What location are you targeting?"), 0);
  };

  // Whether restarting/cancelling now would actually discard anything --
  // used to decide whether a confirmation is worth showing.
  const hasProgress = step !== "location" || messages.length > 1;

  const handleRestartClick = () => {
    if (hasProgress && !confirm("Restart the AI Agent? This discards everything entered so far.")) return;
    restart();
  };

  const handleCancelClick = () => {
    if (hasProgress && !confirm("Leave the AI Agent? Everything entered so far will be lost.")) return;
    navigate("/dashboard");
  };

  // ---------- Render helpers for the input area ----------

  const renderInputArea = () => {
    if (busy) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Working...
        </div>
      );
    }

    switch (step) {
      case "resumeConfirm":
        return (
          <div className="flex flex-wrap gap-2 p-4 border-t">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => { addUser("Continue extracting"); runLeadGeneration(data.leadSetName); }}
            >
              <Sparkles className="w-3.5 h-3.5" /> Continue Extraction
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                addUser("Start fresh instead");
                setData((d) => ({ ...d, resumeSearchId: null, resumeNextToken: null, resumeExtractedSoFar: 0 }));
                addAgent("No problem -- let's start fresh. What location are you targeting?");
                setStep("location");
              }}
            >
              Start Fresh Instead
            </Button>
          </div>
        );

      case "outreachMode":
        return (
          <div className="flex flex-wrap gap-2 p-4 border-t">
            <Button size="sm" className="gap-1.5" onClick={() => submitOutreachMode("landing_page")}>
              <Sparkles className="w-3.5 h-3.5" /> Landing Page + Verified 8-Email Campaign
            </Button>
            <Button size="sm" variant="outline" onClick={() => submitOutreachMode("classic")}>
              Just One Email (Classic)
            </Button>
          </div>
        );

      case "verifyingEmails": {
        const job = verificationJobStatusQuery.data as any;
        const processed = job?.processedCount || 0;
        const total = job?.totalEmails || data.leadIds.length;
        return (
          <div className="p-4 border-t space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying emails...</span>
              <span>{processed} / {total}</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${total ? Math.min(100, (processed / total) * 100) : 0}%` }} />
            </div>
          </div>
        );
      }

      case "verificationSummary":
        return (
          <div className="p-4 border-t">
            <Button size="sm" onClick={() => { addUser("Continue"); setStep("tagAssignment"); }} className="gap-1.5">
              Continue <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        );

      case "tagAssignment":
        return (
          <div className="p-4 border-t">
            <TagPicker leadIds={data.verifiedLeadIds} recommendedName={data.leadSetName || undefined} onConfirm={handleTagConfirmed} />
          </div>
        );

      case "landingPageChoice":
        return (
          <div className="p-4 border-t flex flex-wrap gap-2">
            <Button size="sm" onClick={chooseNewLandingPage} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Create a new one
            </Button>
            <Button size="sm" variant="outline" onClick={chooseExistingLandingPage}>
              Use an existing one
            </Button>
          </div>
        );

      case "existingLandingPagePicker":
        return (
          <div className="p-4 border-t space-y-2 max-h-72 overflow-y-auto">
            {existingLandingPagesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading your landing pages...</div>
            ) : !existingLandingPagesQuery.data?.length ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">You don't have any saved landing pages yet.</p>
                <Button size="sm" onClick={chooseNewLandingPage} className="gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Create one now
                </Button>
              </div>
            ) : (
              existingLandingPagesQuery.data.map((page: any) => (
                <button
                  key={page.id}
                  type="button"
                  className="w-full text-left border rounded-md px-3 py-2 hover:border-primary hover:bg-muted/40 transition-colors"
                  onClick={() => useExistingLandingPage(page.id, page.name)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{page.name}</p>
                    <Badge variant={page.status === "published" ? "default" : "outline"} className="shrink-0 text-[10px]">{page.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{page.industry || "No industry set"}</p>
                </button>
              ))
            )}
          </div>
        );

      case "offerPrompt":
        return renderTextInputArea(submitOfferPrompt, "Type your answer...");

      case "stylePrompt":
        return (
          <div className="p-4 border-t space-y-2">
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start h-auto py-2.5 text-left"
                onClick={() => submitStylePreference("clean_professional", "Clean & Professional")}
              >
                <div>
                  <div className="font-medium text-sm">Clean & Professional</div>
                  <div className="text-xs text-muted-foreground">Restrained palette, lots of white space, trustworthy tone</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-2.5 text-left"
                onClick={() => submitStylePreference("premium_modern", "Premium & Modern")}
              >
                <div>
                  <div className="font-medium text-sm">Premium & Modern</div>
                  <div className="text-xs text-muted-foreground">Bolder palette, confident and polished tone</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-2.5 text-left"
                onClick={() => submitStylePreference("bold_conversion", "Bold & Conversion-Focused")}
              >
                <div>
                  <div className="font-medium text-sm">Bold & Conversion-Focused</div>
                  <div className="text-xs text-muted-foreground">High-contrast, punchy copy, unmissable CTA</div>
                </div>
              </Button>
            </div>
          </div>
        );

      case "logoPrompt":
        return (
          <div className="p-4 border-t space-y-2">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (textInput.trim()) submitLogoUrl(textInput); }}>
              <Input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Paste a logo URL..." className="flex-1" autoFocus />
              <Button type="submit" size="sm" disabled={!textInput.trim()}>Use URL</Button>
            </form>
            <div className="flex items-center gap-2">
              <MediaPickerDialog
                value={data.logoUrl || undefined}
                onSelect={submitLogoUrl}
                recommendedSize="Recommended: ~400x120px PNG, transparent background works best"
                aspect={null}
                triggerLabel="Upload or choose from gallery"
              />
              <Button size="sm" variant="ghost" onClick={skipLogo}>Skip</Button>
            </div>
          </div>
        );

      case "heroMediaPrompt":
        return (
          <div className="p-4 border-t space-y-2">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (textInput.trim()) submitHeroImageUrl(textInput); }}>
              <Input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Paste an image URL or YouTube/Vimeo link..." className="flex-1" autoFocus />
              <Button type="submit" size="sm" disabled={!textInput.trim()}>Use URL</Button>
            </form>
            <div className="flex items-center gap-2">
              <MediaPickerDialog
                value={data.heroImageUrl || undefined}
                onSelect={submitHeroImageUrl}
                recommendedSize="Recommended: 1600x900px (16:9), landscape"
                aspect={16 / 9}
                triggerLabel="Upload or choose from gallery"
              />
              <Button size="sm" variant="ghost" onClick={skipHeroMedia}>Skip</Button>
            </div>
          </div>
        );

      case "sequenceReview":
        return (
          <div className="flex flex-wrap gap-2 p-4 border-t">
            <Button size="sm" onClick={continueFromSequenceReview} className="gap-1.5">
              <Check className="w-3.5 h-3.5" /> Looks good, review the emails
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.open(`/landing-pages/${data.generatedLandingPageId}`, "_blank")}>
              Open Full Editor
            </Button>
          </div>
        );

      case "reviewSequenceEmails":
        return (
          <div className="p-4 border-t">
            <p className="text-xs text-muted-foreground">Review each email above, then approve it to move to the next one.</p>
          </div>
        );

      case "publishLandingPage":
        return (
          <div className="p-4 border-t">
            {data.publishedUrl && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(data.publishedUrl as string, "_blank")}>
                View Live Page
              </Button>
            )}
          </div>
        );

      case "preflightCheck":
        return (
          <div className="p-4 border-t">
            {data.preflightPassed ? (
              <Button size="sm" onClick={approvePreflight} className="gap-1.5">
                <Check className="w-3.5 h-3.5" /> Approve & Continue to Scheduling
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={runPreflightCheckStep} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Re-run Check
              </Button>
            )}
          </div>
        );

      case "location":
        return (
          <div className="flex flex-wrap items-end gap-2 p-4 border-t">
            <div>
              <label className="text-xs text-muted-foreground">Country</label>
              <Select value={data.country || "any"} onValueChange={(v) => setData((d) => ({ ...d, country: v === "any" ? "" : v, state: "" }))}>
                <SelectTrigger className="w-44 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any country</SelectItem>
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {data.country === "United States" && (
              <div>
                <label className="text-xs text-muted-foreground">State</label>
                <Select value={data.state || "any"} onValueChange={(v) => setData((d) => ({ ...d, state: v === "any" ? "" : v }))}>
                  <SelectTrigger className="w-44 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any state</SelectItem>
                    {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={submitLocation} className="gap-1.5">Continue <ArrowRight className="w-3.5 h-3.5" /></Button>
          </div>
        );

      case "companySize":
        return (
          <div className="flex flex-wrap items-end gap-2 p-4 border-t">
            <Select value={data.companySize || "any"} onValueChange={(v) => submitCompanySize(v === "any" ? "" : v)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Any size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any size</SelectItem>
                {COMPANY_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );

      case "industry":
        return renderMultiSelectArea(INDUSTRY_OPTIONS, data.industries, toggleIndustry, continueFromIndustry, "Skip -- any industry");

      case "jobTitles":
        return renderMultiSelectArea(JOB_TITLE_OPTIONS, data.jobTitles, toggleJobTitle, continueFromJobTitles, "Skip -- any title");

      case "otherCriteria":
        return renderTextInputArea(submitOtherCriteria, "Type anything else, or \"skip\"...");

      case "emailPrompt":
        return renderTextInputArea(submitEmailPrompt, "Type your answer...");

      case "count":
      case "followUpCount":
        return renderTextInputArea(step === "count" ? submitCount : submitFollowUpCount, "Enter a number...", "number");

      case "leadSetName":
        return renderTextInputArea(submitLeadSetName, "Name this list, or type \"skip\"...");

      case "emailReview":
        return (
          <div className="flex flex-wrap gap-2 p-4 border-t">
            <Button size="sm" onClick={() => handleEmailReviewReply("looks good")} className="gap-1.5"><Check className="w-3.5 h-3.5" /> Looks good</Button>
            <Button size="sm" variant="outline" onClick={() => handleEmailReviewReply("regenerate")} className="gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Regenerate</Button>
            <Button size="sm" variant="outline" onClick={() => handleEmailReviewReply("edit")} className="gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</Button>
          </div>
        );

      case "followUpPreview":
        return (
          <div className="p-4 border-t">
            <Button size="sm" onClick={continueFromFollowUpPreview} className="gap-1.5"><Check className="w-3.5 h-3.5" /> Looks good, continue</Button>
          </div>
        );

      case "editingEmail":
        return (
          <div className="p-4 border-t space-y-2">
            <Input value={data.subject} onChange={(e) => setData((d) => ({ ...d, subject: e.target.value }))} placeholder="Subject" />
            <Textarea value={data.body} onChange={(e) => setData((d) => ({ ...d, body: e.target.value }))} placeholder="Email body" rows={6} />
            <Button size="sm" onClick={submitEditedEmail} className="gap-1.5"><Check className="w-3.5 h-3.5" /> Save Edits</Button>
          </div>
        );

      case "templateName":
      case "campaignName":
        return renderTextInputArea(
          step === "templateName" ? submitTemplateName : submitCampaignName,
          step === "templateName" ? "Name this template..." : "Name this campaign..."
        );

      case "scheduleChoice":
        return (
          <div className="flex gap-2 p-4 border-t">
            <Button size="sm" onClick={() => submitScheduleChoice(true)}>Send Now</Button>
            <Button size="sm" variant="outline" onClick={() => submitScheduleChoice(false)}>Schedule for Later</Button>
          </div>
        );

      case "scheduleDatetime":
        return (
          <div className="flex items-end gap-2 p-4 border-t">
            <Input
              type="datetime-local"
              value={data.scheduledAt}
              onChange={(e) => setData((d) => ({ ...d, scheduledAt: e.target.value }))}
              className="w-64"
            />
            <Button size="sm" disabled={!data.scheduledAt} onClick={submitScheduleDatetime} className="gap-1.5">Continue <ArrowRight className="w-3.5 h-3.5" /></Button>
          </div>
        );

      case "summary":
        return (
          <div className="p-4 border-t">
            <Button onClick={confirmLaunch} className="gap-1.5">
              {data.scheduleNow ? "Confirm & Launch" : "Confirm & Schedule"} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        );

      case "done":
        return (
          <div className="flex flex-wrap gap-2 p-4 border-t">
            <Button size="sm" onClick={() => navigate("/campaigns")} className="gap-1.5">View Campaign <ArrowRight className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="outline" onClick={restart}>Start Another Campaign</Button>
          </div>
        );

      default:
        return null;
    }
  };

  const renderTextInputArea = (onSubmit: (text: string) => void, placeholder: string, type: string = "text") => (
    <form
      className="flex gap-2 p-4 border-t"
      onSubmit={(e) => { e.preventDefault(); onSubmit(textInput); }}
    >
      <Input
        type={type}
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
        placeholder={placeholder}
        autoFocus
        className="flex-1"
      />
      <Button type="submit" size="icon" disabled={!textInput.trim()}>
        <Send className="w-4 h-4" />
      </Button>
    </form>
  );

  const renderMultiSelectArea = (
    options: string[],
    selected: string[],
    onToggle: (name: string) => void,
    onContinue: () => void,
    skipLabel: string
  ) => {
    // Selected options always stay visible even while filtered out by search
    // text, so toggling one off is never hidden mid-search.
    const filtered = filterText.trim()
      ? options.filter((opt) => opt.toLowerCase().includes(filterText.trim().toLowerCase()) || selected.includes(opt))
      : options;
    return (
      <div className="p-4 border-t space-y-3">
        {options.length > 30 && (
          <Input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={`Search ${options.length} options...`}
            className="h-8 text-sm"
          />
        )}
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">No matches -- try a different search term, or Skip.</p>
          )}
          {filtered.map((opt) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { setFilterText(""); onContinue(); }} className="gap-1.5">
            {selected.length > 0 ? `Continue (${selected.length} selected)` : skipLabel} <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  if (pendingResume) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <Sparkles className="w-8 h-8 text-primary mx-auto" />
            <div>
              <p className="text-lg font-medium">Welcome back!</p>
              <p className="text-sm text-muted-foreground mt-1">
                You have an unfinished AI Agent conversation from {new Date(pendingResume.savedAt).toLocaleString()}. Continue where you left off, or delete it and start fresh?
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={handleResumeChatContinue} className="gap-1.5">
                <ArrowRight className="w-4 h-4" /> Continue Conversation
              </Button>
              <Button variant="outline" onClick={handleResumeChatDelete} className="gap-1.5">
                <X className="w-4 h-4" /> Delete & Start Fresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-primary" /> AI Agent</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tell me who you're targeting and I'll find the leads, write the email, set up follow-ups, and schedule the campaign.
          </p>
        </div>
        {step !== "done" && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRestartClick} disabled={busy}>
              <RotateCcw className="w-3.5 h-3.5" /> Restart
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={handleCancelClick} disabled={busy}>
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm" style={{ height: "70vh" }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "agent" && (
                <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="size-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-lg px-4 py-2.5 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                {m.text && <p className="whitespace-pre-wrap text-sm">{m.text}</p>}
                {m.content}
              </div>
              {m.role === "user" && (
                <div className="size-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                  <User className="size-4 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {renderInputArea()}
      </div>

      <LeadVerificationReviewDialog open={showLeadReviewDialog} rows={leadReviewRows} onConfirm={handleLeadReviewConfirm} />
    </div>
  );
}

// The real "final preview" moment: an actual rendered visual preview of the
// generated landing page (not a text summary), an AI-edit box for it, and
// each of the 8 emails with a full preview/edit trigger -- not a bare
// subject-line list. Self-contained (its own queries/mutations) so applying
// an AI edit refreshes this same card in place rather than needing a new
// chat message.
function SequenceReviewCard({ landingPageId, onEdited }: { landingPageId: number; onEdited: () => void }) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [aiInstruction, setAiInstruction] = useState("");
  const utils = trpc.useUtils();
  const previewQuery = trpc.landingPages.previewHtml.useQuery(landingPageId);
  const applyEditMutation = trpc.landingPages.applyAiEdit.useMutation();

  const handleApplyEdit = async () => {
    if (!aiInstruction.trim()) return;
    try {
      await applyEditMutation.mutateAsync({ id: landingPageId, instruction: aiInstruction.trim() });
      setAiInstruction("");
      utils.landingPages.previewHtml.invalidate(landingPageId);
      onEdited();
    } catch (error: any) {
      toast.error(error?.message || "AI edit failed");
    }
  };

  return (
    <div className="space-y-3 max-w-md">
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant={viewport === "desktop" ? "default" : "outline"} className="h-7 w-7 p-0" onClick={() => setViewport("desktop")}>
          <Monitor className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant={viewport === "mobile" ? "default" : "outline"} className="h-7 w-7 p-0" onClick={() => setViewport("mobile")}>
          <Smartphone className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="border rounded-md overflow-hidden bg-white" style={{ width: viewport === "mobile" ? "260px" : "100%" }}>
        {previewQuery.isLoading ? (
          <div className="h-64 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <iframe title="Landing page preview" srcDoc={previewQuery.data?.html || ""} style={{ width: "100%", height: "400px", border: "none" }} />
        )}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={aiInstruction}
          onChange={(e) => setAiInstruction(e.target.value)}
          placeholder='AI edit, e.g. "make it more premium"'
          className="flex-1 h-8 text-xs"
          onKeyDown={(e) => e.key === "Enter" && handleApplyEdit()}
        />
        <Button size="sm" onClick={handleApplyEdit} disabled={!aiInstruction.trim() || applyEditMutation.isPending} className="gap-1.5 h-8">
          {applyEditMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Apply
        </Button>
      </div>
    </div>
  );
}

function EmailReviewCard({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Subject: {subject}</p>
      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{body}</p>
      <EmailPreviewDialog
        subject={subject}
        body={body}
        trigger={<Button size="sm" variant="outline" className="gap-1.5"><Eye className="w-3.5 h-3.5" /> Preview Full Email</Button>}
      />
    </div>
  );
}

function FollowUpPreviewList({
  previews,
  sampleName,
  sampleCompany,
}: {
  previews: Array<{ sequenceNumber: number; dayOffset: number; emailType: string; subject: string; body: string }>;
  sampleName: string;
  sampleCompany: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Sample recipient: {sampleName || "there"}{sampleCompany ? ` at ${sampleCompany}` : ""}
      </p>
      <div className="space-y-1.5">
        {previews.map((p) => (
          <div key={p.sequenceNumber} className="flex items-center justify-between gap-2 bg-background/60 rounded px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">#{p.sequenceNumber} · Day {p.dayOffset} · {p.emailType.replace("_", " ")}</p>
              <p className="text-xs text-muted-foreground truncate">{p.subject}</p>
            </div>
            <EmailPreviewDialog
              subject={p.subject}
              body={p.body}
              recipientName={sampleName || undefined}
              recipientCompany={sampleCompany || undefined}
              trigger={<Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0"><Eye className="w-3.5 h-3.5" /></Button>}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ data }: { data: WizardData }) {
  const isLandingPagePipeline = data.pipelineMode === "landing_page";
  return (
    <Card className="border-primary/30">
      <CardContent className="pt-4 space-y-1.5 text-sm">
        <p><strong>Campaign:</strong> {data.campaignName}</p>
        <p>
          <strong>Leads:</strong> {isLandingPagePipeline ? data.verifiedLeadIds.length : data.leadIds.length}{" "}
          ({isLandingPagePipeline ? "verified" : data.usedSeamless ? "Seamless.AI" : "AI generated"})
        </p>
        {isLandingPagePipeline ? (
          <>
            <p><strong>Landing page:</strong> Ready</p>
            <p><strong>Emails:</strong> 8 (1 initial + 7 follow-ups)</p>
          </>
        ) : (
          <>
            <p><strong>Template:</strong> {data.templateName}</p>
            <p><strong>Follow-ups:</strong> {data.followUpCount}</p>
          </>
        )}
        <p><strong>Launch:</strong> {data.scheduleNow ? "Immediately" : new Date(data.scheduledAt).toLocaleString()}</p>
        <Badge variant="outline" className="mt-1">Ready to go</Badge>
      </CardContent>
    </Card>
  );
}
