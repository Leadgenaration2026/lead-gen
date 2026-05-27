import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Mail, Send, Sparkles, Eye } from "lucide-react";

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
  const [selectedLead, setSelectedLead] = useState<number | null>(null);
  const [emailType, setEmailType] = useState<EmailType>("discovery");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [ctaLink, setCtaLink] = useState("https://calendly.com/nitin-virtualassistant/30min");
  const [showPreview, setShowPreview] = useState(false);

  const leadsQuery = trpc.leads.list.useQuery();
  const generateEmailMutation = trpc.email.generateAI.useMutation();
  const sendEmailMutation = trpc.email.sendIndividual.useMutation();

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

              {/* Email Body */}
              <div className="space-y-2">
                <Label htmlFor="body" className="font-semibold">Email Body</Label>
                {showPreview ? (
                  <div
                    className="border rounded-lg p-4 min-h-[300px] prose prose-sm max-w-none bg-white"
                    dangerouslySetInnerHTML={{ __html: emailBody }}
                  />
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
              <div className="flex gap-3 pt-2">
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setSubject("");
                    setEmailBody("");
                    setShowPreview(false);
                  }}
                  disabled={!subject && !emailBody}
                >
                  Clear
                </Button>
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
