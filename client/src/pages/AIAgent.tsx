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
import { Sparkles, User, Loader2, Send, Eye, RotateCcw, Pencil, Check, ArrowRight, X } from "lucide-react";

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

// The exact top-level category names Seamless.AI accepts (mirrors
// SEAMLESS_INDUSTRY_OPTIONS in server/seamlessAI.ts, kept as a client-side
// literal since server modules can't be imported into the client bundle) --
// picking from this list lets the request skip the free-text industry
// parser entirely and go straight to a valid Seamless filter.
const INDUSTRY_OPTIONS = [
  "Aerospace & Defense", "Agriculture", "Apparel & Fashion", "Automotive",
  "Chemicals & Materials", "Consumer Goods & Retail", "Education & Training",
  "Electronics & Hardware", "Energy & Utilities", "Entertainment", "Environmental",
  "Finance & Banking", "Food & Beverage", "Government & Public Policy",
  "Health & Wellness", "Hospitality & Tourism", "Household, Personal, & Beauty",
  "Insurance", "Internet & E-Commerce", "Manufacturing & Engineering",
  "Marketing & Media", "Metals, Mining & Materials", "Non-Profit",
  "Pharmaceuticals & Medical Devices", "Professional Services & Consulting",
  "Real Estate & Construction", "Software & Information Technology",
  "Telecommunications & Networking", "Transportation & Logistics", "Wholesale & Distribution",
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
}

const DEFAULTS: WizardData = {
  country: "United States", state: "", companySize: "",
  industries: [], jobTitles: [], otherCriteria: "", criteria: "", count: 25,
  leadSetName: "", resumeSearchId: null, resumeNextToken: null, resumeExtractedSoFar: 0,
  usedSeamless: false, leadSetId: null, leadIds: [], leadsSummary: "",
  sampleLeadName: "", sampleLeadCompany: "", sampleLeadIndustry: "",
  emailPrompt: "", subject: "", body: "", followUpCount: 7, followUpPreviews: [], templateName: "", templateId: null,
  scheduleNow: true, scheduledAt: "", campaignName: "", campaignId: null,
};

export default function AIAgentPage() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState<Step>("location");
  const [data, setData] = useState<WizardData>(DEFAULTS);
  const [textInput, setTextInput] = useState("");
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
  // flow shows its own greeting once the search record loads, below).
  useEffect(() => {
    if (resumeSearchId !== null) return;
    addAgent(
      "Hi! I'm your AI Agent. I'll find leads matching your criteria, write an email to reach out to them, set up follow-ups, and schedule the campaign -- all in one go.\n\nLet's start: what location are you targeting?"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          addAgent(
            `I couldn't find any new candidates for that criteria (${preview.skippedAlreadyOwned} already in your system, ${preview.skippedExcluded} previously discarded).${totalNote} Want to try different criteria? Let's pick again.`
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
        if (enrichResult.count === 0) {
          setBusy(false);
          addAgent(`All ${enrichResult.duplicatesSkipped} matching contacts are already in your system. Want to try different criteria?`);
          setStep("industry");
          return;
        }
        resolvedLeadSetId = enrichResult.leadSetId ?? null;
        const totalExtracted = (data.resumeExtractedSoFar || 0) + enrichResult.count;
        const remaining = totalAvailable !== null ? Math.max(0, totalAvailable - totalExtracted) : null;
        resolvedSummary = `${enrichResult.count} lead(s) extracted from Seamless.AI (${enrichResult.enrichmentCreditsUsed} credit(s) used)${enrichResult.duplicatesSkipped ? `, ${enrichResult.duplicatesSkipped} duplicate(s) skipped` : ""}.` +
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
      setData((d) => ({
        ...d,
        leadIds: ids,
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
      addAgent("Now let's write the email. What should it say -- your value proposition, what you're offering, or the angle you want to take?");
      setStep("emailPrompt");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I ran into a problem finding leads: ${error?.message || "unknown error"}. Want to try again, or adjust the criteria?`);
      setStep("industry");
    }
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
  const submitCampaignName = (text: string) => {
    const name = text.trim() || data.templateName || data.leadSetName || "AI Agent Campaign";
    setData((d) => ({ ...d, campaignName: name }));
    addUser(name);
    setTextInput("");
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
    addAgent("Creating the campaign...");
    try {
      const createResult = await createCampaignMutation.mutateAsync({
        name: data.campaignName,
        subject: data.subject,
        emailTemplate: data.body,
        leadIds: data.leadIds,
        templateId: data.templateId || undefined,
        scheduledAt: data.scheduleNow ? undefined : new Date(data.scheduledAt).toISOString(),
      });
      const campaignId = (createResult as any).campaignId;
      setData((d) => ({ ...d, campaignId }));

      if (data.scheduleNow) {
        await launchCampaignMutation.mutateAsync(campaignId);
        setBusy(false);
        addAgent(`Done! The campaign is launched -- emails are going out to ${data.leadIds.length} lead(s) now, with ${data.followUpCount} follow-up(s) scheduled after that.`);
      } else {
        setBusy(false);
        addAgent(`Done! The campaign is scheduled to launch at ${new Date(data.scheduledAt).toLocaleString()}, sending to ${data.leadIds.length} lead(s) with ${data.followUpCount} follow-up(s) after that.`);
      }
      setStep("done");
    } catch (error: any) {
      setBusy(false);
      addAgent(`I couldn't create the campaign: ${error?.message || "unknown error"}. Want to try again?`);
      setStep("summary");
    }
  };

  const restart = () => {
    setData(DEFAULTS);
    setMessages([]);
    setStep("location");
    setTextInput("");
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
  ) => (
    <div className="p-4 border-t space-y-3">
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
        {options.map((opt) => {
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
        <Button size="sm" onClick={onContinue} className="gap-1.5">
          {selected.length > 0 ? `Continue (${selected.length} selected)` : skipLabel} <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );

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
  return (
    <Card className="border-primary/30">
      <CardContent className="pt-4 space-y-1.5 text-sm">
        <p><strong>Campaign:</strong> {data.campaignName}</p>
        <p><strong>Leads:</strong> {data.leadIds.length} ({data.usedSeamless ? "Seamless.AI" : "AI generated"})</p>
        <p><strong>Template:</strong> {data.templateName}</p>
        <p><strong>Follow-ups:</strong> {data.followUpCount}</p>
        <p><strong>Launch:</strong> {data.scheduleNow ? "Immediately" : new Date(data.scheduledAt).toLocaleString()}</p>
        <Badge variant="outline" className="mt-1">Ready to go</Badge>
      </CardContent>
    </Card>
  );
}
