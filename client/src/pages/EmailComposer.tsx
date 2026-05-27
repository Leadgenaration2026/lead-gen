import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Mail, Send } from "lucide-react";

type EmailType = "discovery" | "value_prop" | "social_proof" | "urgency" | "custom";

const emailTypeDescriptions: Record<EmailType, string> = {
  discovery: "Initial discovery email to understand their needs",
  value_prop: "Highlight your unique value proposition",
  social_proof: "Share social proof, testimonials, or case studies",
  urgency: "Create urgency with limited-time offers",
  custom: "Custom email based on specific requirements",
};

export default function EmailComposer() {
  const { user } = useAuth();
  const [selectedLead, setSelectedLead] = useState<number | null>(null);
  const [emailType, setEmailType] = useState<EmailType>("discovery");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [ctaLink, setCtaLink] = useState("https://calendly.com/nitin-virtualassistant/30min");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const leadsQuery = trpc.leads.list.useQuery();
  // const generateEmailMutation = trpc.email.generateProfessional.useMutation();
  // const sendEmailMutation = trpc.email.sendIndividual.useMutation();

  const handleGenerateEmail = async () => {
    if (!selectedLead) {
      toast.error("Please select a lead");
      return;
    }
    toast.info("Email generation coming soon!");
  };

  const handleSendEmail = async () => {
    if (!selectedLead || !subject || !emailBody) {
      toast.error("Please fill in all fields");
      return;
    }
    toast.info("Email sending coming soon!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Composer</h1>
        <p className="text-muted-foreground mt-2">Create professional, personalized emails with AI assistance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Email Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lead Selection */}
              <div className="space-y-2">
                <Label htmlFor="lead-select">Select Lead</Label>
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
                <Label htmlFor="email-type">Email Type</Label>
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

              {/* CTA Link */}
              <div className="space-y-2">
                <Label htmlFor="cta-link">CTA Link</Label>
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
                disabled={isGenerating || !selectedLead}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Generate with AI
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Preview Card */}
          {selectedLead && leadsQuery.data && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Lead Details</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {leadsQuery.data.find((l) => l.id === selectedLead) && (
                  <>
                    <div>
                      <span className="font-semibold">Name:</span>{" "}
                      {leadsQuery.data.find((l) => l.id === selectedLead)?.ownerName}
                    </div>
                    <div>
                      <span className="font-semibold">Company:</span>{" "}
                      {leadsQuery.data.find((l) => l.id === selectedLead)?.companyName}
                    </div>
                    <div>
                      <span className="font-semibold">Email:</span>{" "}
                      {leadsQuery.data.find((l) => l.id === selectedLead)?.email}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Email Editor */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Preview</CardTitle>
              <CardDescription>Edit and customize your email before sending</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Subject Line */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject..."
                  className="font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  ✓ Tip: Avoid spam trigger words like "FREE", "URGENT", "LIMITED TIME"
                </p>
              </div>

              {/* Email Body */}
              <div className="space-y-2">
                <Label htmlFor="body">Email Body</Label>
                <Textarea
                  id="body"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Enter email content..."
                  rows={12}
                  className="font-mono text-sm"
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Available variables:</p>
                  <p>
                    {"{"}
                    {"{"}ownerName{"}"}{"}"}, {"{"}
                    {"{"}companyName{"}"}{"}"}, {"{"}
                    {"{"}email{"}"}{"}"}, {"{"}
                    {"{"}ctaLink{"}"}
                    {"}"}
                  </p>
                </div>
              </div>

              {/* Send Button */}
              <Button
                onClick={handleSendEmail}
                disabled={isSending || !subject || !emailBody}
                className="w-full"
                size="lg"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Email
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Email Format Tips */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-sm text-blue-900">Professional Email Format Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-blue-800 space-y-2">
              <p>✓ Keep subject line under 50 characters</p>
              <p>✓ Use personalization variables for higher engagement</p>
              <p>✓ Include 2-3 bullet points highlighting key benefits</p>
              <p>✓ Add a clear call-to-action with your Calendly link</p>
              <p>✓ Keep email body to 150-200 words maximum</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
