import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Mail, Send, Sparkles, Eye, TestTube, Clock, RefreshCw } from "lucide-react";
import { AIWriteButton } from "@/components/AIWriteButton";

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
  const [selectedLead, setSelectedLead] = useState<number | null>(null);
  const [emailType, setEmailType] = useState<EmailType>("discovery");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [ctaLink, setCtaLink] = useState("https://calendly.com/nitin-virtualassistant/30min");
  const [showPreview, setShowPreview] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [lastAIPrompt, setLastAIPrompt] = useState<{ prompt: string; emailType: string; companyContext?: string } | null>(null);

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
    }
  }, [searchString, prefilled]);

  const [testEmail, setTestEmail] = useState("");
  const [showTestEmailInput, setShowTestEmailInput] = useState(false);

  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  const leadsQuery = trpc.leads.list.useQuery();
  const generateEmailMutation = trpc.email.generateAI.useMutation();
  const regenerateMutation = trpc.email.generateAITemplate.useMutation();
  const sendEmailMutation = trpc.email.sendIndividual.useMutation();
  const sendTestEmailMutation = trpc.email.sendTestEmail.useMutation();
  const scheduleEmailMutation = trpc.scheduledEmails.schedule.useMutation();

  const selectedLeadData = leadsQuery.data?.find((l) => l.id === selectedLead);

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
      await sendEmailMutation.mutateAsync({
        leadId: selectedLead,
        subject,
        body: emailBody,
      });
      toast.success("Email sent successfully!");
      // Reset form
      setSubject("");
      setEmailBody("");
      setInstructions("");
      setShowPreview(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to send email. Check your SMTP settings.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Composer</h1>
        <p className="text-muted-foreground mt-2">
          Create professional, AI-powered personalized emails for individual leads
        </p>
      </div>

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
                Tell the AI what you want to say and it will create a professional email
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
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Email...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate with AI
                  </>
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
              </CardContent>
            </Card>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    {showPreview ? "Edit" : "Preview"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Subject Line */}
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

              {/* Email Body */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="body" className="font-semibold">Email Body</Label>
                  {showPreview && lastAIPrompt && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
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
                      className="gap-1.5 text-purple-600 border-purple-200 hover:bg-purple-50"
                    >
                      {regenerateMutation.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating...</>
                      ) : (
                        <><RefreshCw className="w-3.5 h-3.5" /> Regenerate Variation</>
                      )}
                    </Button>
                  )}
                </div>
                {showPreview ? (
                  <div
                    className="border rounded-lg p-4 min-h-[300px] bg-white text-sm leading-relaxed whitespace-pre-wrap font-sans"
                  >
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
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Send Email to {selectedLeadData?.ownerName || "Lead"}
                        </>
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
                          await scheduleEmailMutation.mutateAsync({
                            leadId: selectedLead,
                            subject,
                            emailBody: emailBody,
                            scheduledFor,
                          });
                          toast.success(`Email scheduled for ${scheduledDate} at ${scheduledTime}`);
                          setSubject("");
                          setEmailBody("");
                          setScheduleMode(false);
                          setScheduledDate("");
                          setScheduledTime("");
                          setShowPreview(false);
                        } catch (error: any) {
                          toast.error(error.message || "Failed to schedule email");
                        }
                      }}
                      disabled={scheduleEmailMutation.isPending || !subject || !emailBody || !selectedLead || !scheduledDate || !scheduledTime}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      size="lg"
                    >
                      {scheduleEmailMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Scheduling...
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4 mr-2" />
                          Schedule Email
                        </>
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
                    onClick={() => {
                      setSubject("");
                      setEmailBody("");
                      setShowPreview(false);
                      setScheduleMode(false);
                    }}
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
                        <Input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          className="text-sm h-9 bg-white"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-indigo-700">Time</Label>
                        <Input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="text-sm h-9 bg-white"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-indigo-600 mt-2">Tip: Emails sent Tuesday-Thursday between 9-11 AM get the best open rates</p>
                  </div>
                )}

                {/* Send Test Email to Myself */}
                <div className="border rounded-lg p-3 bg-amber-50/50 border-amber-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TestTube className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-900">Send Test Email to Myself</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setShowTestEmailInput(!showTestEmailInput)}
                    >
                      {showTestEmailInput ? "Hide" : "Show"}
                    </Button>
                  </div>
                  {showTestEmailInput && (
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="your-email@example.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className="text-sm h-9 bg-white"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 h-9 border-amber-300 text-amber-700 hover:bg-amber-100"
                        disabled={sendTestEmailMutation.isPending || !subject || !emailBody || !testEmail}
                        onClick={async () => {
                          try {
                            await sendTestEmailMutation.mutateAsync({
                              subject,
                              body: emailBody,
                              testEmail,
                            });
                            toast.success(`Test email sent to ${testEmail}! Check your inbox.`);
                          } catch (error: any) {
                            toast.error(error.message || "Failed to send test email. Check SMTP settings.");
                          }
                        }}
                      >
                        {sendTestEmailMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>Send Test</>  
                        )}
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-amber-700 mt-1.5">Preview how the email looks in your inbox before sending to the lead</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tips Card */}
          <Card className="bg-amber-50 border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-900">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-800 space-y-2">
              <p><strong>1.</strong> Select a lead from your list</p>
              <p><strong>2.</strong> Choose the email type (discovery, value prop, etc.)</p>
              <p><strong>3.</strong> Describe what you want to say in your own words</p>
              <p><strong>4.</strong> Click "Generate with AI" — it creates a professional email with:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Spam-proof subject line (lands in inbox, not promotions)</li>
                <li>Personalized opening based on their company</li>
                <li>2-3 bullet points highlighting key benefits</li>
                <li>Your Calendly CTA link for booking</li>
                <li>Your email signature automatically appended</li>
              </ul>
              <p><strong>5.</strong> Review, edit if needed, and click "Send"</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
