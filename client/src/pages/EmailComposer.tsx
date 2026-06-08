import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Mail, Send, Sparkles, Eye, TestTube, Clock, RefreshCw, Plus, Play, Pause, Trash2, Users, ShieldCheck, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Wand2, Inbox, Zap, CalendarClock, Globe, Linkedin } from "lucide-react";
import { AIWriteButton } from "@/components/AIWriteButton";
import { LeadPicker } from "@/components/LeadPicker";
import { ActivityFeed } from "@/components/ActivityFeed";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";
import { WebsiteInsightsPanel } from "@/components/WebsiteInsightsPanel";

type EmailType = "discovery" | "value_prop" | "social_proof" | "urgency" | "custom";

const emailTypeDescriptions: Record<EmailType, string> = {
  discovery: "Initial discovery email to understand their needs and pain points",
  value_prop: "Highlight your unique value proposition and how you solve their problem",
  social_proof: "Share case studies, testimonials, or success stories from similar companies",
  urgency: "Create urgency with limited-time offers or time-sensitive opportunities",
  custom: "Custom email based on your specific instructions",
};

export default function EmailComposer() {
  const { user } = useAuth();
  const searchString = useSearch();
  const [, navigate] = useLocation();

  // Mode: "single" for one lead, "bulk" for campaign
  const [mode, setMode] = useState<"single" | "bulk">("single");

  // Single lead state
  const [selectedLead, setSelectedLead] = useState<number | null>(null);
  const [emailType, setEmailType] = useState<EmailType>("discovery");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [ctaLink, setCtaLink] = useState("https://calendly.com/nitin-virtualassistant/30min");
  const [showPreview, setShowPreview] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [lastAIPrompt, setLastAIPrompt] = useState<{ prompt: string; emailType: string; companyContext?: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [showTestEmailInput, setShowTestEmailInput] = useState(false);
  const [selectedSenderAccount, setSelectedSenderAccount] = useState<string>("primary");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [deliverabilityResult, setDeliverabilityResult] = useState<{ allPassed: boolean; score: number; checks: Array<{ name: string; status: "pass" | "fail" | "warning"; message: string; category: string }> } | null>(null);
    const [showDeliverabilityDetails, setShowDeliverabilityDetails] = useState(false);
  const [bulkDeliverabilityResult, setBulkDeliverabilityResult] = useState<{ allPassed: boolean; score: number; checks: Array<{ name: string; status: "pass" | "fail" | "warning"; message: string; category: string }> } | null>(null);
  const [showBulkDeliverabilityDetails, setShowBulkDeliverabilityDetails] = useState(false);
  // Bulk campaign state
  const [selectedLeadSetId, setSelectedLeadSetId] = useState<number | null>(null);
  const [campaignFormData, setCampaignFormData] = useState({
    name: "",
    description: "",
    subject: "",
    emailTemplate: "",
    leadIds: [] as number[],
    scheduledAt: "",
  });
  const [enableScheduling, setEnableScheduling] = useState(false);
  const [lastCampaignAIPrompt, setLastCampaignAIPrompt] = useState<{ prompt: string; emailType: string; companyContext?: string } | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [bulkTestEmail, setBulkTestEmail] = useState("");
  const [showBulkTestEmailInput, setShowBulkTestEmailInput] = useState(false);

  // Pre-fill from URL params (template quick-launch)
  useEffect(() => {
    if (prefilled) return;
    const params = new URLSearchParams(searchString);
    const paramSubject = params.get("subject");
    const paramBody = params.get("body");
    const paramEmailType = params.get("emailType");
    if (paramSubject || paramBody) {
      if (paramSubject) setSubject(paramSubject);
      if (paramBody) setEmailBody(paramBody);
      if (paramEmailType && ["discovery", "value_prop", "social_proof", "urgency", "custom"].includes(paramEmailType)) {
        setEmailType(paramEmailType as EmailType);
      }
      setShowPreview(true);
      setPrefilled(true);
      setMode("single");
    }
  }, [searchString, prefilled]);

  // Queries
  const leadsQuery = trpc.leads.list.useQuery();
  const leadSetsQuery = trpc.leadSets.list.useQuery();
  const campaignsQuery = trpc.campaigns.list.useQuery();
  const rotationalEmailsQuery = trpc.rotationalEmails.list.useQuery();

  // Mutations - Single
  const generateEmailMutation = trpc.email.generateAI.useMutation();
  const regenerateMutation = trpc.email.generateAITemplate.useMutation();
  const sendEmailMutation = trpc.email.sendIndividual.useMutation();
  const deliverabilityCheckMutation = trpc.email.checkDeliverability.useMutation();
  const fixDeliverabilityMutation = trpc.email.fixDeliverability.useMutation();
  const sendTestEmailMutation = trpc.email.sendTestEmail.useMutation();
  const scheduleEmailMutation = trpc.scheduledEmails.schedule.useMutation();

  // Mutations - Bulk
  const createCampaignMutation = trpc.campaigns.create.useMutation();
  const launchCampaignMutation = trpc.campaigns.launch.useMutation();
  const pauseCampaignMutation = trpc.campaigns.pause.useMutation();
  const deleteCampaignMutation = trpc.campaigns.delete.useMutation();
  const cancelScheduleMutation = trpc.campaigns.cancelSchedule.useMutation({
    onSuccess: () => {
      toast.success("Scheduled launch cancelled");
      campaignsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const regenerateTemplateMutation = trpc.email.generateAITemplate.useMutation();

  const selectedLeadData = leadsQuery.data?.find((l) => l.id === selectedLead);

  // Filter leads by selected lead set for bulk mode
  const filteredLeads = useMemo(() => {
    const allLeads = leadsQuery.data || [];
    if (!selectedLeadSetId) return allLeads;
    return allLeads.filter((l: any) => l.leadSetId === selectedLeadSetId);
  }, [leadsQuery.data, selectedLeadSetId]);

  // Single lead handlers
  const handleGenerateEmail = async () => {
    if (!selectedLead) {
      toast.error("Please select a lead first");
      return;
    }
    try {
      const result = await generateEmailMutation.mutateAsync({
        leadId: selectedLead,
        emailType,
        instructions: instructions || undefined,
        ctaLink,
      });
      setSubject(result.subject);
      setEmailBody(result.body);
      setShowPreview(true);
      setLastAIPrompt({ prompt: instructions || `Generate a ${emailType} email`, emailType, companyContext: undefined });
      toast.success("Email generated successfully! Review and edit before sending.");
      // Auto-run deliverability checks
      try {
        const checkResult = await deliverabilityCheckMutation.mutateAsync({ subject: result.subject, body: result.body });
        setDeliverabilityResult(checkResult);
      } catch { /* silently fail - checks are informational */ }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate email");
    }
  };

  const handleSendEmail = async () => {
    if (!selectedLead || !subject || !emailBody) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      const result = await sendEmailMutation.mutateAsync({
        leadId: selectedLead,
        subject,
        body: emailBody,
        senderAccountId: selectedSenderAccount !== "primary" ? Number(selectedSenderAccount) : undefined,
      });
      if (result.campaignId) {
        toast.success("Email sent & campaign created!", {
          duration: 8000,
          description: "Track opens, clicks & calls in real-time.",
          action: {
            label: "View Campaign",
            onClick: () => {
              navigate(`/campaigns/${result.campaignId}`);
            },
          },
        });
        campaignsQuery.refetch();
      } else {
        toast.success("Email sent successfully!");
      }
      setSubject("");
      setEmailBody("");
      setInstructions("");
      setShowPreview(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to send email. Check your SMTP settings.");
    }
  };

  // Bulk campaign handlers
  const handleCreateCampaign = async () => {
    if (!campaignFormData.name || !campaignFormData.subject || !campaignFormData.emailTemplate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (campaignFormData.leadIds.length === 0) {
      toast.error("Please select at least one lead for this campaign");
      return;
    }
    try {
      const result = await createCampaignMutation.mutateAsync({
        ...campaignFormData,
        leadIds: campaignFormData.leadIds,
        scheduledAt: enableScheduling && campaignFormData.scheduledAt ? campaignFormData.scheduledAt : undefined,
      });
      if (result.scheduled) {
        toast.success(`Campaign scheduled for ${new Date(campaignFormData.scheduledAt).toLocaleString()} with ${campaignFormData.leadIds.length} leads!`);
      } else {
        toast.success(`Campaign created with ${campaignFormData.leadIds.length} leads!`);
      }
      setCampaignFormData({ name: "", description: "", subject: "", emailTemplate: "", leadIds: [], scheduledAt: "" });
      setEnableScheduling(false);
      campaignsQuery.refetch();
    } catch (error) {
      toast.error("Failed to create campaign");
    }
  };

  const handleLaunchCampaign = async (campaignId: number) => {
    try {
      await launchCampaignMutation.mutateAsync(campaignId);
      toast.success("Campaign launched successfully");
      campaignsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to launch campaign");
    }
  };

  const handlePauseCampaign = async (campaignId: number) => {
    try {
      await pauseCampaignMutation.mutateAsync(campaignId);
      toast.success("Campaign paused");
      campaignsQuery.refetch();
    } catch (error) {
      toast.error("Failed to pause campaign");
    }
  };

  const handleDeleteCampaign = async (campaignId: number) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;
    try {
      await deleteCampaignMutation.mutateAsync(campaignId);
      toast.success("Campaign deleted");
      campaignsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete campaign");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Composer</h1>
        <p className="text-muted-foreground mt-2">
          Create and send personalized emails — one at a time or as a bulk campaign
        </p>
      </div>

      {/* Mode Toggle */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="single" className="gap-2">
            <Mail className="w-4 h-4" />
            Single Lead
          </TabsTrigger>
          <TabsTrigger value="bulk" className="gap-2">
            <Users className="w-4 h-4" />
            Bulk Campaign
          </TabsTrigger>
        </TabsList>

        {/* ===== SINGLE LEAD MODE ===== */}
        <TabsContent value="single" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Configuration */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    AI Email Generator
                  </CardTitle>
                  <CardDescription>
                    Select a lead, describe what you want to say, and AI creates a professional email
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Lead Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="lead-select">Select Lead *</Label>
                    <Select value={selectedLead?.toString() || ""} onValueChange={(v) => setSelectedLead(parseInt(v))}>
                      <SelectTrigger id="lead-select">
                        <SelectValue placeholder="Choose a lead..." />
                      </SelectTrigger>
                      <SelectContent>
                        {leadsQuery.data?.map((lead) => (
                          <SelectItem key={lead.id} value={lead.id.toString()}>
                            {lead.ownerName} - {lead.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Email Type Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="email-type">Email Type *</Label>
                    <Select value={emailType} onValueChange={(v) => setEmailType(v as EmailType)}>
                      <SelectTrigger id="email-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discovery">Discovery</SelectItem>
                        <SelectItem value="value_prop">Value Proposition</SelectItem>
                        <SelectItem value="social_proof">Social Proof</SelectItem>
                        <SelectItem value="urgency">Urgency</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{emailTypeDescriptions[emailType]}</p>
                  </div>

                  {/* Instructions */}
                  <div className="space-y-2">
                    <Label htmlFor="instructions">Your Instructions</Label>
                    <Textarea
                      id="instructions"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Tell the AI what you want to say...&#10;&#10;Example: Their website is outdated. Tell them we can redesign it to get 3x more leads. Mention our case study with XYZ Corp where we increased conversions by 200%."
                      rows={5}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Be specific about their weak points and what you want to offer
                    </p>
                  </div>

                  {/* CTA Link */}
                  <div className="space-y-2">
                    <Label htmlFor="cta-link">CTA Link (Calendly)</Label>
                    <Input
                      id="cta-link"
                      value={ctaLink}
                      onChange={(e) => setCtaLink(e.target.value)}
                      placeholder="https://calendly.com/..."
                      className="text-sm"
                    />
                  </div>

                  {/* Generate Button */}
                  <Button
                    onClick={handleGenerateEmail}
                    disabled={generateEmailMutation.isPending || !selectedLead}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    size="lg"
                  >
                    {generateEmailMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Email...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" /> Generate with AI</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Lead Details Card */}
              {selectedLeadData && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-blue-900">Selected Lead</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2 text-blue-800">
                    <div className="flex justify-between">
                      <span className="font-medium">Name:</span>
                      <span>{selectedLeadData.ownerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Company:</span>
                      <span>{selectedLeadData.companyName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Email:</span>
                      <span className="text-xs">{selectedLeadData.email}</span>
                    </div>
                    {selectedLeadData.industry && (
                      <div className="flex justify-between">
                        <span className="font-medium">Industry:</span>
                        <Badge variant="outline" className="text-xs">{selectedLeadData.industry}</Badge>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-medium">Status:</span>
                      <Badge variant="outline" className="text-xs capitalize">{selectedLeadData.status}</Badge>
                    </div>
                    {selectedLeadData.website && (
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Website:</span>
                        <a href={selectedLeadData.website.startsWith('http') ? selectedLeadData.website : `https://${selectedLeadData.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <Globe className="w-3 h-3" />{selectedLeadData.website.replace(/^https?:\/\//, '').slice(0, 25)}
                        </a>
                      </div>
                    )}
                    {selectedLeadData.linkedinUrl && (
                      <div className="flex justify-between items-center">
                        <span className="font-medium">LinkedIn:</span>
                        <a href={selectedLeadData.linkedinUrl.startsWith('http') ? selectedLeadData.linkedinUrl : `https://${selectedLeadData.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <Linkedin className="w-3 h-3" />{selectedLeadData.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '').slice(0, 25)}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Website Analysis Panel */}
              {selectedLeadData?.website && (
                <WebsiteInsightsPanel
                  domain={selectedLeadData.website}
                  leadId={selectedLead || undefined}
                  companyName={selectedLeadData.companyName}
                  industry={selectedLeadData.industry || undefined}
                  onGenerateEmail={(s, b) => { setSubject(s); setEmailBody(b); setShowPreview(true); }}
                />
              )}
            </div>

            {/* Right Panel - Email Editor & Preview */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5" />
                        Email Editor
                      </CardTitle>
                      <CardDescription>Review, edit, and send your email</CardDescription>
                    </div>
                    {emailBody && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                          <Eye className="w-4 h-4 mr-1" />
                          {showPreview ? "Edit" : "Preview"}
                        </Button>
                        <EmailPreviewDialog
                          subject={subject}
                          body={emailBody}
                          recipientName={selectedLeadData?.ownerName}
                          recipientEmail={selectedLeadData?.email}
                          recipientCompany={selectedLeadData?.companyName}
                          trigger={
                            <Button variant="outline" size="sm" className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50">
                              <Inbox className="w-4 h-4" />
                              Preview as Recipient
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* AI Write Button - Direct access */}
                  <div className="flex items-center gap-2">
                    <AIWriteButton
                      onGenerated={(s, b) => { setSubject(s); setEmailBody(b); setShowPreview(true); }}
                      onPromptUsed={(prompt: string, emailType: string, companyContext?: string) => setLastAIPrompt({ prompt, emailType, companyContext })}
                      leadId={selectedLead || undefined}
                      includeVariables={false}
                      buttonLabel="AI Write Email"
                      buttonVariant="default"
                      buttonSize="default"
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                    />
                    <span className="text-xs text-muted-foreground">Describe what you want to say and AI writes a professional email</span>
                  </div>

                  {/* Regenerate Variation Card */}
                  {emailBody && lastAIPrompt && (
                    <div className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-purple-900">Not happy with this email?</p>
                          <p className="text-xs text-purple-600 mt-0.5">Click to generate a completely different variation using the same context</p>
                        </div>
                        <Button
                          type="button"
                          variant="default"
                          size="default"
                          onClick={async () => {
                            try {
                              const result = await regenerateMutation.mutateAsync({
                                prompt: lastAIPrompt.prompt,
                                emailType: lastAIPrompt.emailType as any,
                                companyContext: lastAIPrompt.companyContext || undefined,
                                leadId: selectedLead || undefined,
                                includeVariables: false,
                                useProblemAnalysis: true,
                              });
                              setSubject(result.subject);
                              setEmailBody(result.body);
                              toast.success("New variation generated!");
                            } catch (error: any) {
                              toast.error(error.message || "Failed to regenerate");
                            }
                          }}
                          disabled={regenerateMutation.isPending}
                          className="gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5"
                        >
                          {regenerateMutation.isPending ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Regenerating...</>
                          ) : (
                            <><RefreshCw className="w-4 h-4" /> Regenerate Variation</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Email Body */}
                  <div className="space-y-2">
                    <Label htmlFor="body" className="font-semibold">Email Body</Label>
                    {showPreview ? (
                      <div className="border rounded-lg p-4 min-h-[300px] bg-white text-sm leading-relaxed whitespace-pre-wrap font-sans">
                        {emailBody}
                      </div>
                    ) : (
                      <Textarea
                        id="body"
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        placeholder="Click 'Generate with AI' to create your email, or write it manually here..."
                        rows={14}
                        className="text-sm leading-relaxed"
                      />
                    )}
                  </div>

                  {/* Subject Line - placed after body so user focuses on lead & content first */}
                  <div className="space-y-2">
                    <Label htmlFor="subject" className="font-semibold">Subject Line</Label>
                    <Input
                      id="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="AI will generate a spam-proof subject line..."
                      className="font-medium text-base"
                    />
                    {subject && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          {subject.length < 50 ? "Good length" : "Consider shortening"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{subject.length}/50 chars</span>
                      </div>
                    )}
                  </div>

                  {/* Email Deliverability Checks */}
                  {(subject || emailBody) && (
                    <div className="border rounded-lg overflow-hidden mt-2">
                      <button
                        onClick={async () => {
                          setShowDeliverabilityDetails(!showDeliverabilityDetails);
                          if (!deliverabilityResult) {
                            try {
                              const result = await deliverabilityCheckMutation.mutateAsync({ subject, body: emailBody });
                              setDeliverabilityResult(result);
                            } catch { /* silent */ }
                          }
                        }}
                        className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">Deliverability Score</span>
                          {deliverabilityCheckMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                          {deliverabilityResult && !deliverabilityCheckMutation.isPending && (
                            <>
                              <Badge variant="outline" className={`text-xs font-bold ${
                                deliverabilityResult.score >= 80
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : deliverabilityResult.score >= 50
                                  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                              }`}>
                                {deliverabilityResult.score}/100
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {deliverabilityResult.checks.filter(c => c.status === "pass").length}/{deliverabilityResult.checks.length} checks passed
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {deliverabilityResult && !showDeliverabilityDetails && (
                            <div className="flex gap-0.5">
                              {deliverabilityResult.checks.map((check, i) => (
                                <span key={i} className={`w-2 h-2 rounded-full ${
                                  check.status === "pass" ? "bg-green-500" : check.status === "warning" ? "bg-yellow-500" : "bg-red-500"
                                }`} />
                              ))}
                            </div>
                          )}
                          {showDeliverabilityDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>
                      {showDeliverabilityDetails && (
                        <div className="p-3 border-t space-y-3">
                          {deliverabilityCheckMutation.isPending ? (
                            <div className="flex items-center justify-center py-4 gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">Running comprehensive checks...</span>
                            </div>
                          ) : deliverabilityResult ? (
                            <>
                              {/* Score bar */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Deliverability Score</span>
                                  <span className={`font-bold ${
                                    deliverabilityResult.score >= 80 ? "text-green-600" : deliverabilityResult.score >= 50 ? "text-yellow-600" : "text-red-600"
                                  }`}>{deliverabilityResult.score}%</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      deliverabilityResult.score >= 80 ? "bg-green-500" : deliverabilityResult.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                                    }`}
                                    style={{ width: `${deliverabilityResult.score}%` }}
                                  />
                                </div>
                              </div>
                              {/* Grouped checks by category */}
                              {(["infrastructure", "content", "personalization", "compliance"] as const).map(category => {
                                const categoryChecks = deliverabilityResult.checks.filter(c => c.category === category);
                                if (categoryChecks.length === 0) return null;
                                const categoryLabels = { infrastructure: "Infrastructure", content: "Content Quality", personalization: "Personalization", compliance: "Compliance" };
                                return (
                                  <div key={category} className="space-y-1">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{categoryLabels[category]}</p>
                                    {categoryChecks.map((check, i) => (
                                      <div key={i} className="flex items-start gap-2 py-1 pl-1">
                                        {check.status === "pass" ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                                        ) : check.status === "warning" ? (
                                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 mt-0.5 shrink-0" />
                                        ) : (
                                          <XCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm leading-tight">{check.name}</p>
                                          <p className="text-xs text-muted-foreground leading-tight">{check.message}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                              <div className="pt-2 border-t mt-2 space-y-2">
                                {deliverabilityResult.checks.some(c => c.status === "fail" || c.status === "warning") && (
                                  <Button
                                    size="sm"
                                    className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                                    onClick={async () => {
                                      const failedChecks = deliverabilityResult.checks.filter(c => c.status === "fail" || c.status === "warning");
                                      const selectedLeadData = selectedLead ? leadsQuery.data?.find(l => l.id === selectedLead) : null;
                                      try {
                                        const fixed = await fixDeliverabilityMutation.mutateAsync({
                                          subject,
                                          body: emailBody,
                                          failedChecks: failedChecks.map(c => ({ name: c.name, status: c.status as "fail" | "warning", message: c.message, category: c.category })),
                                          leadName: selectedLeadData?.ownerName,
                                          companyName: selectedLeadData?.companyName,
                                          industry: selectedLeadData?.industry || undefined,
                                        });
                                        setSubject(fixed.subject);
                                        setEmailBody(fixed.body);
                                        toast.success("Email rewritten to fix deliverability issues");
                                        // Auto re-run checks on the fixed version
                                        const newResult = await deliverabilityCheckMutation.mutateAsync({ subject: fixed.subject, body: fixed.body });
                                        setDeliverabilityResult(newResult);
                                      } catch {
                                        toast.error("Failed to fix email. Please try again.");
                                      }
                                    }}
                                    disabled={fixDeliverabilityMutation.isPending}
                                  >
                                    {fixDeliverabilityMutation.isPending ? (
                                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fixing Issues...</>
                                    ) : (
                                      <><Wand2 className="w-3.5 h-3.5" /> Fix Issues with AI</>
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full gap-2"
                                  onClick={async () => {
                                    try {
                                      const result = await deliverabilityCheckMutation.mutateAsync({ subject, body: emailBody });
                                      setDeliverabilityResult(result);
                                      toast.success("Deliverability checks refreshed");
                                    } catch { toast.error("Failed to run checks"); }
                                  }}
                                  disabled={deliverabilityCheckMutation.isPending}
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${deliverabilityCheckMutation.isPending ? "animate-spin" : ""}`} />
                                  Re-run All Checks
                                </Button>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-2">Click to run deliverability checks</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Send From & Campaign Options */}
                  <div className="grid grid-cols-1 gap-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Send From</Label>
                      <Select value={selectedSenderAccount} onValueChange={setSelectedSenderAccount}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sender account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="primary">Primary SMTP Account</SelectItem>
                          {rotationalEmailsQuery.data?.map((account: any) => (
                            <SelectItem key={account.id} value={String(account.id)}>
                              {account.senderName ? `${account.senderName} (${account.email})` : account.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Action Buttons */}
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex gap-3">
                      {!scheduleMode ? (
                        <Button
                          onClick={handleSendEmail}
                          disabled={sendEmailMutation.isPending || !subject || !emailBody || !selectedLead}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          size="lg"
                        >
                          {sendEmailMutation.isPending ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                          ) : (
                            <><Send className="w-4 h-4 mr-2" /> Send Email to {selectedLeadData?.ownerName || "Lead"}</>
                          )}
                        </Button>
                      ) : (
                        <Button
                          onClick={async () => {
                            if (!selectedLead || !subject || !emailBody || !scheduledDate || !scheduledTime) {
                              toast.error("Please fill in all fields and select a date/time");
                              return;
                            }
                            try {
                              const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
                              await scheduleEmailMutation.mutateAsync({ leadId: selectedLead, subject, emailBody: emailBody, scheduledFor });
                              toast.success(`Email scheduled for ${scheduledDate} at ${scheduledTime}`);
                              setSubject(""); setEmailBody(""); setScheduleMode(false); setScheduledDate(""); setScheduledTime(""); setShowPreview(false);
                            } catch (error: any) {
                              toast.error(error.message || "Failed to schedule email");
                            }
                          }}
                          disabled={scheduleEmailMutation.isPending || !subject || !emailBody || !selectedLead || !scheduledDate || !scheduledTime}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                          size="lg"
                        >
                          {scheduleEmailMutation.isPending ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scheduling...</>
                          ) : (
                            <><Clock className="w-4 h-4 mr-2" /> Schedule Email</>
                          )}
                        </Button>
                      )}
                      <Button
                        variant={scheduleMode ? "default" : "outline"}
                        onClick={() => setScheduleMode(!scheduleMode)}
                        className={scheduleMode ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-300" : ""}
                      >
                        <Clock className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setSubject(""); setEmailBody(""); setShowPreview(false); setScheduleMode(false); }}
                        disabled={!subject && !emailBody}
                      >
                        Clear
                      </Button>
                    </div>

                    {/* Schedule Date/Time Picker */}
                    {scheduleMode && (
                      <div className="border rounded-lg p-3 bg-indigo-50/50 border-indigo-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-4 h-4 text-indigo-600" />
                          <span className="text-sm font-medium text-indigo-900">Schedule Send</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-indigo-700">Date</Label>
                            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} min={new Date().toISOString().split("T")[0]} className="text-sm h-9 bg-white" />
                          </div>
                          <div>
                            <Label className="text-xs text-indigo-700">Time</Label>
                            <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="text-sm h-9 bg-white" />
                          </div>
                        </div>
                        <p className="text-xs text-indigo-600 mt-2">Tip: Emails sent Tuesday-Thursday between 9-11 AM get the best open rates</p>
                      </div>
                    )}

                    {/* Send Test Email */}
                    <div className="border rounded-lg p-3 bg-amber-50/50 border-amber-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TestTube className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-medium text-amber-900">Send Test Email to Myself</span>
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowTestEmailInput(!showTestEmailInput)}>
                          {showTestEmailInput ? "Hide" : "Show"}
                        </Button>
                      </div>
                      {showTestEmailInput && (
                        <div className="flex gap-2">
                          <Input type="email" placeholder="your-email@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="text-sm h-9 bg-white" />
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 h-9 border-amber-300 text-amber-700 hover:bg-amber-100"
                            disabled={sendTestEmailMutation.isPending || !subject || !emailBody || !testEmail}
                            onClick={async () => {
                              try {
                                await sendTestEmailMutation.mutateAsync({ subject, body: emailBody, testEmail });
                                toast.success(`Test email sent to ${testEmail}! Check your inbox.`);
                              } catch (error: any) {
                                toast.error(error.message || "Failed to send test email. Check SMTP settings.");
                              }
                            }}
                          >
                            {sendTestEmailMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Send Test</>}
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-amber-700 mt-1.5">Preview how the email looks in your inbox before sending to the lead</p>
                    </div>


                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ===== BULK CAMPAIGN MODE ===== */}
        <TabsContent value="bulk" className="mt-6">
          <div className="space-y-6">
            {/* Create Campaign Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-600" />
                  Create Bulk Campaign
                </CardTitle>
                <CardDescription>
                  Send personalized emails to multiple leads at once. Use variables like {"{{ownerName}}"}, {"{{companyName}}"} for personalization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Sent From - Today's Assigned SMTP Account */}
                {(() => {
                  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
                  const todayAccount = rotationalEmailsQuery.data?.find((re: any) => re.dayOfWeek === dayOfWeek);
                  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                  return (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50/50 border border-green-200">
                      <Mail className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-800">
                        <strong>Sending from ({dayNames[dayOfWeek]}):</strong>{" "}
                        {todayAccount ? (
                          <span className="font-medium">{todayAccount.senderName ? `${todayAccount.senderName} <${todayAccount.email}>` : todayAccount.email}</span>
                        ) : (
                          <span className="text-muted-foreground">Primary account (no rotational email set for {dayNames[dayOfWeek]})</span>
                        )}
                      </span>
                    </div>
                  );
                })()}

                <div>
                  <Label className="mb-2 block">Select Leads *</Label>
                  <div className="mb-2">
                    <select
                      value={selectedLeadSetId || ""}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setSelectedLeadSetId(val);
                        if (val) {
                          const setLeads = (leadsQuery.data || []).filter((l: any) => l.leadSetId === val);
                          setCampaignFormData({ ...campaignFormData, leadIds: setLeads.map((l: any) => l.id) });
                        } else {
                          setCampaignFormData({ ...campaignFormData, leadIds: [] });
                        }
                      }}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All Leads (no set filter)</option>
                      {(leadSetsQuery.data || []).map((set: any) => (
                        <option key={set.id} value={set.id}>
                          {set.name} ({(leadsQuery.data || []).filter((l: any) => l.leadSetId === set.id).length} leads)
                        </option>
                      ))}
                    </select>
                    {selectedLeadSetId && (
                      <button
                        type="button"
                        onClick={() => navigate(`/leads?setId=${selectedLeadSetId}`)}
                        className="mt-1 text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        <Users className="w-3 h-3" />
                        View leads in this set →
                      </button>
                    )}
                  </div>
                  <LeadPicker
                    leads={filteredLeads}
                    selectedIds={campaignFormData.leadIds}
                    onChange={(ids) => setCampaignFormData({ ...campaignFormData, leadIds: ids })}
                    isLoading={leadsQuery.isLoading}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Campaign Name *</Label>
                    <Input
                      placeholder="e.g., Q2 SaaS Outreach"
                      value={campaignFormData.name}
                      onChange={(e) => setCampaignFormData({ ...campaignFormData, name: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      placeholder="Brief campaign description"
                      value={campaignFormData.description}
                      onChange={(e) => setCampaignFormData({ ...campaignFormData, description: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                </div>


                <div>
                  <div className="flex items-center justify-between">
                    <Label>Email Template *</Label>
                    <div className="flex items-center gap-2">
                      {campaignFormData.emailTemplate && lastCampaignAIPrompt && (
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            try {
                              const result = await regenerateTemplateMutation.mutateAsync({
                                prompt: lastCampaignAIPrompt.prompt,
                                emailType: lastCampaignAIPrompt.emailType as any,
                                companyContext: lastCampaignAIPrompt.companyContext || undefined,
                                includeVariables: true,
                                useProblemAnalysis: false,
                              });
                              setCampaignFormData({ ...campaignFormData, subject: result.subject, emailTemplate: result.body });
                              toast.success("New template variation generated!");
                            } catch (error: any) {
                              toast.error(error.message || "Failed to regenerate");
                            }
                          }}
                          disabled={regenerateTemplateMutation.isPending}
                          className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          {regenerateTemplateMutation.isPending ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating...</>
                          ) : (
                            <><RefreshCw className="w-3.5 h-3.5" /> Regenerate</>
                          )}
                        </Button>
                      )}
                      <AIWriteButton
                        onGenerated={(s, b) => setCampaignFormData({ ...campaignFormData, subject: s, emailTemplate: b })}
                        onPromptUsed={(prompt, emailType, companyContext) => setLastCampaignAIPrompt({ prompt, emailType, companyContext })}
                        includeVariables={true}
                        buttonLabel="AI Write"
                        buttonVariant="outline"
                        buttonSize="sm"
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      />
                    </div>
                  </div>
                  <Textarea
                    placeholder="Email template with personalization variables..."
                    value={campaignFormData.emailTemplate}
                    onChange={(e) => setCampaignFormData({ ...campaignFormData, emailTemplate: e.target.value })}
                    className="mt-1.5 min-h-32 font-mono text-xs"
                  />
                  {campaignFormData.emailTemplate && lastCampaignAIPrompt && (
                    <div className="mt-2 border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-purple-900">Not happy with this template?</p>
                          <p className="text-xs text-purple-600">Click Regenerate above to get a completely different variation</p>
                        </div>
                        <RefreshCw className="w-4 h-4 text-purple-500" />
                      </div>
                    </div>
                  )}
                  {/* Bulk Email Deliverability Checks */}
                  {(campaignFormData.subject || campaignFormData.emailTemplate) && (
                    <div className="border rounded-lg overflow-hidden mt-3">
                      <button
                        onClick={async () => {
                          setShowBulkDeliverabilityDetails(!showBulkDeliverabilityDetails);
                          if (!bulkDeliverabilityResult) {
                            try {
                              const result = await deliverabilityCheckMutation.mutateAsync({ subject: campaignFormData.subject, body: campaignFormData.emailTemplate });
                              setBulkDeliverabilityResult(result);
                            } catch { /* silent */ }
                          }
                        }}
                        className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">Deliverability Score</span>
                          {deliverabilityCheckMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                          {bulkDeliverabilityResult && !deliverabilityCheckMutation.isPending && (
                            <Badge variant="outline" className={`text-xs ${
                              bulkDeliverabilityResult.score >= 80
                                ? "bg-green-50 text-green-700 border-green-200"
                                : bulkDeliverabilityResult.score >= 50
                                  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                            }`}>
                              {bulkDeliverabilityResult.score}/100
                            </Badge>
                          )}
                          {bulkDeliverabilityResult && (
                            <span className="text-xs text-muted-foreground">
                              {bulkDeliverabilityResult.checks.filter(c => c.status === "pass").length}/{bulkDeliverabilityResult.checks.length} checks passed
                            </span>
                          )}
                        </div>
                        {showBulkDeliverabilityDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {showBulkDeliverabilityDetails && (
                        <div className="p-3 border-t space-y-3">
                          {bulkDeliverabilityResult ? (
                            <>
                              {/* Score bar */}
                              <div className="space-y-1">
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      bulkDeliverabilityResult.score >= 80 ? "bg-green-500" : bulkDeliverabilityResult.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                                    }`}
                                    style={{ width: `${bulkDeliverabilityResult.score}%` }}
                                  />
                                </div>
                              </div>
                              {/* Grouped checks */}
                              {["infrastructure", "content", "personalization", "compliance"].map(category => {
                                const categoryChecks = bulkDeliverabilityResult.checks.filter(c => c.category === category);
                                if (categoryChecks.length === 0) return null;
                                const categoryLabels: Record<string, string> = { infrastructure: "Infrastructure", content: "Content Quality", personalization: "Personalization", compliance: "Compliance" };
                                return (
                                  <div key={category} className="space-y-1">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{categoryLabels[category]}</p>
                                    {categoryChecks.map((check, i) => (
                                      <div key={i} className="flex items-start gap-2 py-1 pl-1">
                                        {check.status === "pass" ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                                        ) : check.status === "warning" ? (
                                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 mt-0.5 shrink-0" />
                                        ) : (
                                          <XCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm leading-tight">{check.name}</p>
                                          <p className="text-xs text-muted-foreground leading-tight">{check.message}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                              <div className="pt-2 border-t mt-2 space-y-2">
                                {bulkDeliverabilityResult.checks.some(c => c.status === "fail" || c.status === "warning") && (
                                  <Button
                                    size="sm"
                                    className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                                    onClick={async () => {
                                      const failedChecks = bulkDeliverabilityResult.checks.filter(c => c.status === "fail" || c.status === "warning");
                                      try {
                                        const fixed = await fixDeliverabilityMutation.mutateAsync({
                                          subject: campaignFormData.subject,
                                          body: campaignFormData.emailTemplate,
                                          failedChecks: failedChecks.map(c => ({ name: c.name, status: c.status as "fail" | "warning", message: c.message, category: c.category })),
                                        });
                                        setCampaignFormData({ ...campaignFormData, subject: fixed.subject, emailTemplate: fixed.body });
                                        toast.success("Template rewritten to fix deliverability issues");
                                        const newResult = await deliverabilityCheckMutation.mutateAsync({ subject: fixed.subject, body: fixed.body });
                                        setBulkDeliverabilityResult(newResult);
                                      } catch {
                                        toast.error("Failed to fix template. Please try again.");
                                      }
                                    }}
                                    disabled={fixDeliverabilityMutation.isPending}
                                  >
                                    {fixDeliverabilityMutation.isPending ? (
                                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fixing Issues...</>
                                    ) : (
                                      <><Wand2 className="w-3.5 h-3.5" /> Fix Issues with AI</>
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full gap-2"
                                  onClick={async () => {
                                    try {
                                      const result = await deliverabilityCheckMutation.mutateAsync({ subject: campaignFormData.subject, body: campaignFormData.emailTemplate });
                                      setBulkDeliverabilityResult(result);
                                      toast.success("Deliverability checks refreshed");
                                    } catch { toast.error("Failed to run checks"); }
                                  }}
                                  disabled={deliverabilityCheckMutation.isPending}
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${deliverabilityCheckMutation.isPending ? "animate-spin" : ""}`} />
                                  Re-run All Checks
                                </Button>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-2">Click to run deliverability checks</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>


                <div>
                  <Label>Email Subject *</Label>
                  <Input
                    placeholder="e.g., Quick question about {{companyName}}"
                    value={campaignFormData.subject}
                    onChange={(e) => setCampaignFormData({ ...campaignFormData, subject: e.target.value })}
                    className="mt-1.5"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Use {"{{ownerName}}"}, {"{{companyName}}"}, {"{{email}}"} for personalization</p>
                </div>
                {/* Send Test Email to Myself - Bulk Campaign */}
                {campaignFormData.emailTemplate && (
                  <div className="border rounded-lg p-3 bg-amber-50/50 border-amber-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <TestTube className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-900">Send Test Email to Myself</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <EmailPreviewDialog
                          subject={campaignFormData.subject || "(No subject)"}
                          body={campaignFormData.emailTemplate}
                          recipientName="{{ownerName}}"
                          recipientEmail="lead@company.com"
                          recipientCompany="{{companyName}}"
                          trigger={
                            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
                              <Inbox className="w-3.5 h-3.5" />
                              Preview as Recipient
                            </Button>
                          }
                        />
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowBulkTestEmailInput(!showBulkTestEmailInput)}>
                          {showBulkTestEmailInput ? "Hide" : "Show"}
                        </Button>
                      </div>
                    </div>
                    {showBulkTestEmailInput && (
                      <div className="flex gap-2">
                        <Input type="email" placeholder="your-email@example.com" value={bulkTestEmail} onChange={(e) => setBulkTestEmail(e.target.value)} className="text-sm h-9 bg-white" />
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-9 border-amber-300 text-amber-700 hover:bg-amber-100"
                          disabled={sendTestEmailMutation.isPending || !campaignFormData.subject || !campaignFormData.emailTemplate || !bulkTestEmail}
                          onClick={async () => {
                            try {
                              await sendTestEmailMutation.mutateAsync({ subject: campaignFormData.subject, body: campaignFormData.emailTemplate, testEmail: bulkTestEmail });
                              toast.success(`Test email sent to ${bulkTestEmail}! Check your inbox.`);
                            } catch (error: any) {
                              toast.error(error.message || "Failed to send test email. Check SMTP settings.");
                            }
                          }}
                        >
                          {sendTestEmailMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Send Test</>}
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-amber-700 mt-1.5">Preview how the bulk email template looks in your inbox before launching the campaign</p>
                  </div>
                )}



                {/* Schedule Campaign */}
                <div className="border rounded-lg p-3 bg-purple-50/50 border-purple-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-900">Schedule Campaign Launch</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableScheduling}
                        onChange={(e) => {
                          setEnableScheduling(e.target.checked);
                          if (!e.target.checked) setCampaignFormData(prev => ({ ...prev, scheduledAt: "" }));
                        }}
                        className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-xs text-purple-700">Enable</span>
                    </label>
                  </div>
                  {enableScheduling && (
                    <div className="mt-3 space-y-2">
                      <Input
                        type="datetime-local"
                        value={campaignFormData.scheduledAt ? campaignFormData.scheduledAt.slice(0, 16) : ""}
                        onChange={(e) => setCampaignFormData(prev => ({ ...prev, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : "" }))}
                        min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                        className="text-sm h-9 bg-white"
                      />
                      <p className="text-xs text-purple-700">Campaign will auto-launch at the scheduled time. Emails will be sent using your rotational SMTP accounts.</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2 border-t">
                  <Button
                    onClick={handleCreateCampaign}
                    disabled={createCampaignMutation.isPending || (enableScheduling && !campaignFormData.scheduledAt)}
                    className={enableScheduling ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}
                    size="lg"
                  >
                    {createCampaignMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                    ) : enableScheduling ? (
                      <><CalendarClock className="w-4 h-4 mr-2" /> Schedule Campaign ({campaignFormData.leadIds.length} leads)</>
                    ) : (
                      <><Plus className="w-4 h-4 mr-2" /> Create Campaign ({campaignFormData.leadIds.length} leads)</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Campaign History */}
            <Card id="campaigns-list">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Your Campaigns ({campaignsQuery.data?.length || 0})
                </CardTitle>
                <CardDescription>Manage your email campaigns and track performance</CardDescription>
              </CardHeader>
              <CardContent>
                {campaignsQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : campaignsQuery.data && campaignsQuery.data.length > 0 ? (
                  <div className="space-y-4">
                    {campaignsQuery.data.map((campaign) => (
                      <div key={campaign.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold cursor-pointer hover:text-primary transition-colors" onClick={() => setSelectedCampaignId(selectedCampaignId === campaign.id ? null : campaign.id)}>{campaign.name}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {(campaign as any).scheduledAt && campaign.status === "draft" && (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="border-purple-300 text-purple-700 bg-purple-50 gap-1">
                                  <CalendarClock className="w-3 h-3" />
                                  {new Date((campaign as any).scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelScheduleMutation.mutate(campaign.id);
                                  }}
                                  disabled={cancelScheduleMutation.isPending}
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}
                            <Badge variant={
                              campaign.status === "active" ? "default" :
                              campaign.status === "draft" ? "secondary" :
                              campaign.status === "paused" ? "outline" : "secondary"
                            }>
                              {campaign.status}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 py-3 border-y border-border">
                          <div>
                            <p className="text-xs text-muted-foreground">Total Leads</p>
                            <p className="text-lg font-semibold">{campaign.totalLeads}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Sent</p>
                            <p className="text-lg font-semibold">{campaign.sentCount}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Opens</p>
                            <p className="text-lg font-semibold text-green-600">{campaign.openCount}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Clicks</p>
                            <p className="text-lg font-semibold text-purple-600">{campaign.clickCount || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Calls</p>
                            <p className="text-lg font-semibold text-orange-600">{campaign.callCount}</p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {campaign.status === "draft" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await sendTestEmailMutation.mutateAsync({ subject: campaign.subject || "Preview", body: campaign.emailTemplate || "Preview not available" });
                                    toast.success("Preview email sent to your inbox!");
                                  } catch (error: any) {
                                    toast.error(error?.message || "Failed to send preview email");
                                  }
                                }}
                                disabled={sendTestEmailMutation.isPending}
                                className="gap-2"
                              >
                                <Mail className="w-4 h-4" />
                                {sendTestEmailMutation.isPending ? "Sending..." : "Send Preview"}
                              </Button>
                              <EmailPreviewDialog
                                subject={campaign.subject || "(No subject)"}
                                body={campaign.emailTemplate || ""}
                                recipientName="{{ownerName}}"  
                                recipientEmail="lead@company.com"
                                recipientCompany="{{companyName}}"
                                trigger={
                                  <Button size="sm" variant="outline" className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50">
                                    <Inbox className="w-4 h-4" />
                                    Preview
                                  </Button>
                                }
                              />
                              <Button size="sm" onClick={() => handleLaunchCampaign(campaign.id)} disabled={launchCampaignMutation.isPending} className="gap-2">
                                <Play className="w-4 h-4" /> Launch
                              </Button>
                            </>
                          )}
                          {campaign.status === "active" && (
                            <Button size="sm" variant="outline" onClick={() => handlePauseCampaign(campaign.id)} disabled={pauseCampaignMutation.isPending} className="gap-2">
                              <Pause className="w-4 h-4" /> Pause
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setSelectedCampaignId(selectedCampaignId === campaign.id ? null : campaign.id)}>
                            {selectedCampaignId === campaign.id ? "Hide Details" : "View Tracking"}
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(`/campaigns/${campaign.id}`)}>
                            View Full Details
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteCampaign(campaign.id)} disabled={deleteCampaignMutation.isPending}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {selectedCampaignId === campaign.id && (
                          <div className="mt-4 pt-4 border-t border-border">
                            <ActivityFeed campaignId={campaign.id} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No campaigns yet. Create one above to get started!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
