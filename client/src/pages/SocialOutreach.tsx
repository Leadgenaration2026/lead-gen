import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Linkedin, Instagram, Facebook, Copy, ExternalLink, MessageSquare, Sparkles, Users, CheckCircle2, XCircle, AlertTriangle, Send, Link2 } from "lucide-react";

type Platform = "linkedin" | "instagram" | "facebook";
type MessageType = "connection_request" | "direct_message";

const MESSAGE_TYPES: Record<MessageType, { label: string; description: string }> = {
  connection_request: { label: "Connection Request", description: "Short note for connection/follow request (200 chars max)" },
  direct_message: { label: "Direct Message", description: "Personalized DM to start a conversation" },
};

interface DeliverabilityCheck {
  label: string;
  passed: boolean;
  message: string;
}

export default function SocialOutreach() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("linkedin");
  const [messageType, setMessageType] = useState<MessageType>("connection_request");
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [context, setContext] = useState("");

  // Social profile link inputs
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");

  const leadsQuery = trpc.leads.list.useQuery();
  const generateMessageMutation = trpc.social.generateMessage.useMutation();
  const sendMutation = trpc.social.send.useMutation();
  const updateLeadMutation = trpc.leads.update.useMutation();

  const leads = useMemo(() => leadsQuery.data || [], [leadsQuery.data]);
  const selectedLead = useMemo(() => {
    const lead = leads.find((l) => String(l.id) === selectedLeadId);
    if (lead) {
      // Sync profile URLs when lead changes
      if (lead.linkedinUrl && !linkedinUrl) setLinkedinUrl(lead.linkedinUrl);
      if (lead.instagramUrl && !instagramUrl) setInstagramUrl(lead.instagramUrl);
      if ((lead as any).facebookUrl && !facebookUrl) setFacebookUrl((lead as any).facebookUrl);
    }
    return lead;
  }, [leads, selectedLeadId]);

  // When lead changes, update the profile URLs
  const handleLeadChange = (leadId: string) => {
    setSelectedLeadId(leadId);
    setGeneratedMessage("");
    const lead = leads.find((l) => String(l.id) === leadId);
    if (lead) {
      setLinkedinUrl(lead.linkedinUrl || "");
      setInstagramUrl(lead.instagramUrl || "");
      setFacebookUrl((lead as any).facebookUrl || "");
    } else {
      setLinkedinUrl("");
      setInstagramUrl("");
      setFacebookUrl("");
    }
  };

  // Save profile URLs to lead
  const handleSaveProfileUrls = async () => {
    if (!selectedLeadId) return;
    try {
      await updateLeadMutation.mutateAsync({
        id: Number(selectedLeadId),
        data: {
          linkedinUrl: linkedinUrl || undefined,
          instagramUrl: instagramUrl || undefined,
          facebookUrl: facebookUrl || undefined,
        },
      });
      toast.success("Social profile URLs saved!");
      leadsQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to save profile URLs");
    }
  };

  // Deliverability / Rules Checks
  const deliverabilityChecks = useMemo((): DeliverabilityCheck[] => {
    const checks: DeliverabilityCheck[] = [];
    const charLimit = messageType === "connection_request" ? 200 : 300;

    // 1. Profile URL exists for selected platform
    const profileUrl = selectedPlatform === "linkedin" ? linkedinUrl :
      selectedPlatform === "instagram" ? instagramUrl : facebookUrl;
    checks.push({
      label: "Profile URL Present",
      passed: !!profileUrl && profileUrl.trim().length > 5,
      message: profileUrl ? "Profile URL is set" : `No ${selectedPlatform} URL — add it below`,
    });

    // 2. Valid URL format
    const urlPattern = /^https?:\/\/.+/i;
    checks.push({
      label: "Valid URL Format",
      passed: !profileUrl || urlPattern.test(profileUrl.trim()),
      message: profileUrl && urlPattern.test(profileUrl.trim()) ? "URL format is valid" : "URL must start with https://",
    });

    // 3. Message generated
    checks.push({
      label: "Message Generated",
      passed: generatedMessage.length > 0,
      message: generatedMessage ? "Message is ready" : "Generate a message first",
    });

    // 4. Character limit
    checks.push({
      label: `Character Limit (${charLimit})`,
      passed: generatedMessage.length > 0 && generatedMessage.length <= charLimit,
      message: generatedMessage ? `${generatedMessage.length}/${charLimit} characters` : "No message yet",
    });

    // 5. No spam content
    const spamWords = ["buy now", "limited offer", "act now", "click here", "free money", "guaranteed"];
    const hasSpam = spamWords.some(w => generatedMessage.toLowerCase().includes(w));
    checks.push({
      label: "No Spam Content",
      passed: !hasSpam,
      message: hasSpam ? "Message contains spam-like language" : "Message looks clean",
    });

    // 6. No hashtags
    const hasHashtags = /#\w+/.test(generatedMessage);
    checks.push({
      label: "No Hashtags",
      passed: !hasHashtags,
      message: hasHashtags ? "Remove hashtags for professional outreach" : "No hashtags detected",
    });

    // 7. Personalization (mentions name or company)
    const hasPersonalization = selectedLead ? (
      generatedMessage.toLowerCase().includes(selectedLead.ownerName?.toLowerCase().split(" ")[0] || "") ||
      generatedMessage.toLowerCase().includes(selectedLead.companyName?.toLowerCase() || "")
    ) : false;
    checks.push({
      label: "Personalized",
      passed: hasPersonalization || generatedMessage.length === 0,
      message: hasPersonalization ? "Message references lead's name or company" : "Add personalization for better response",
    });

    // 8. Lead selected
    checks.push({
      label: "Lead Selected",
      passed: !!selectedLeadId,
      message: selectedLeadId ? "Lead is selected" : "Select a lead first",
    });

    return checks;
  }, [selectedPlatform, linkedinUrl, instagramUrl, facebookUrl, generatedMessage, messageType, selectedLead, selectedLeadId]);

  const allChecksPassed = deliverabilityChecks.every(c => c.passed);
  const criticalChecksPassed = deliverabilityChecks.filter(c =>
    ["Profile URL Present", "Message Generated", "Character Limit", "Lead Selected"].some(l => c.label.startsWith(l.split(" (")[0]))
  ).every(c => c.passed);

  const handleGenerate = async () => {
    if (!selectedLeadId) {
      toast.error("Please select a lead first");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateMessageMutation.mutateAsync({
        leadId: Number(selectedLeadId),
        platform: selectedPlatform,
        messageType,
        tone: context.trim() || undefined,
      });
      setGeneratedMessage(result.message);
      toast.success("Message generated by Claude AI!");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate message");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!selectedLeadId || !generatedMessage) return;

    // Save profile URLs first if changed
    const lead = leads.find(l => String(l.id) === selectedLeadId);
    const profileChanged = lead && (
      (linkedinUrl !== (lead.linkedinUrl || "")) ||
      (instagramUrl !== (lead.instagramUrl || "")) ||
      (facebookUrl !== ((lead as any).facebookUrl || ""))
    );
    if (profileChanged) {
      await handleSaveProfileUrls();
    }

    setIsSending(true);
    try {
      await sendMutation.mutateAsync({
        leadId: Number(selectedLeadId),
        platform: selectedPlatform,
        messageType,
        message: generatedMessage,
      });
      toast.success(`${selectedPlatform} ${messageType.replace("_", " ")} recorded! Open the profile to send it.`);
    } catch (error: any) {
      toast.error(error.message || "Failed to record outreach");
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedMessage);
    toast.success("Copied to clipboard!");
  };

  const handleOpenProfile = () => {
    const url = selectedPlatform === "linkedin" ? linkedinUrl :
      selectedPlatform === "instagram" ? instagramUrl : facebookUrl;
    if (url) {
      window.open(url, "_blank");
    } else {
      const platformName = selectedPlatform === "linkedin" ? "LinkedIn" : selectedPlatform === "instagram" ? "Instagram" : "Facebook";
      toast.error(`No ${platformName} URL found. Add it in the Social Profile Links section.`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Social Outreach</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Generate personalized LinkedIn, Instagram & Facebook messages for your leads using Claude AI
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Platform Selection */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Platform</label>
              <div className="flex gap-1.5">
                <Button
                  variant={selectedPlatform === "linkedin" ? "default" : "outline"}
                  onClick={() => setSelectedPlatform("linkedin")}
                  size="sm"
                  className="flex-1 gap-1.5"
                >
                  <Linkedin className="w-3.5 h-3.5" />
                  LinkedIn
                </Button>
                <Button
                  variant={selectedPlatform === "instagram" ? "default" : "outline"}
                  onClick={() => setSelectedPlatform("instagram")}
                  size="sm"
                  className="flex-1 gap-1.5"
                >
                  <Instagram className="w-3.5 h-3.5" />
                  Instagram
                </Button>
                <Button
                  variant={selectedPlatform === "facebook" ? "default" : "outline"}
                  onClick={() => setSelectedPlatform("facebook")}
                  size="sm"
                  className="flex-1 gap-1.5"
                >
                  <Facebook className="w-3.5 h-3.5" />
                  Facebook
                </Button>
              </div>
            </div>

            {/* Lead Selection */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Select Lead</label>
              <Select value={selectedLeadId} onValueChange={handleLeadChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={String(lead.id)}>
                      <span className="flex items-center gap-2">
                        {lead.ownerName} {lead.companyName && <span className="text-muted-foreground">— {lead.companyName}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Social Profile Links */}
            {selectedLeadId && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Social Profile Links
                  </label>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleSaveProfileUrls} disabled={updateLeadMutation.isPending}>
                    {updateLeadMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Linkedin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <Input
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Instagram className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                    <Input
                      value={instagramUrl}
                      onChange={(e) => setInstagramUrl(e.target.value)}
                      placeholder="https://instagram.com/..."
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Facebook className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <Input
                      value={facebookUrl}
                      onChange={(e) => setFacebookUrl(e.target.value)}
                      placeholder="https://facebook.com/..."
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Message Type */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Message Type</label>
              <Select value={messageType} onValueChange={(v) => setMessageType(v as MessageType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MESSAGE_TYPES).map(([key, { label, description }]) => (
                    <SelectItem key={key} value={key}>
                      <div>
                        <span>{label}</span>
                        <span className="text-xs text-muted-foreground ml-2">— {description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Additional Context */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Additional Context (optional)</label>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g., We provide virtual assistant services..."
                rows={2}
                className="text-xs"
              />
            </div>

            {/* Generate Button */}
            <Button onClick={handleGenerate} disabled={isGenerating || !selectedLeadId} className="w-full gap-2">
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating with Claude...</>
              ) : (
                <><Sparkles className="w-4 h-4" />Generate with Claude AI</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Message + Actions */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4" />
              Generated Message
            </CardTitle>
            <CardDescription className="text-xs">
              {generatedMessage ? "Review, copy, and send the message" : "Generate a message to see it here"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {generatedMessage ? (
              <div className="space-y-3">
                <div className="p-3 bg-muted/30 rounded-lg border">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{generatedMessage}</p>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{generatedMessage.length} characters</span>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> Claude AI
                  </Badge>
                </div>
                {messageType === "connection_request" && generatedMessage.length > 200 && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Over 200 char limit for connection requests
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={handleCopy} variant="outline" size="sm" className="flex-1 gap-1.5">
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </Button>
                  <Button onClick={handleOpenProfile} variant="outline" size="sm" className="flex-1 gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Profile
                  </Button>
                </div>
                <Button
                  onClick={handleSend}
                  disabled={isSending || !criticalChecksPassed}
                  className="w-full gap-2"
                  variant={allChecksPassed ? "default" : "secondary"}
                >
                  {isSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Recording...</>
                  ) : (
                    <><Send className="w-4 h-4" />Record & Send</>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Records outreach in system, then opens profile for you to send manually
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Users className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">Select a lead and generate a message</p>
                <p className="text-xs mt-1">Messages are crafted by Claude AI</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deliverability / Rules Checks */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="w-4 h-4" />
              Pre-Send Checks
            </CardTitle>
            <CardDescription className="text-xs">
              All checks must pass before sending
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deliverabilityChecks.map((check, idx) => (
                <div key={idx} className={`flex items-start gap-2.5 p-2 rounded-md border ${check.passed ? "bg-green-50/50 border-green-200" : "bg-red-50/50 border-red-200"}`}>
                  {check.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-xs font-medium ${check.passed ? "text-green-800" : "text-red-800"}`}>
                      {check.label}
                    </p>
                    <p className={`text-xs ${check.passed ? "text-green-600" : "text-red-600"}`}>
                      {check.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className={`mt-4 p-3 rounded-lg border ${allChecksPassed ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300"}`}>
              <div className="flex items-center gap-2">
                {allChecksPassed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                )}
                <div>
                  <p className={`text-sm font-medium ${allChecksPassed ? "text-green-800" : "text-amber-800"}`}>
                    {allChecksPassed ? "All Checks Passed!" : `${deliverabilityChecks.filter(c => c.passed).length}/${deliverabilityChecks.length} Checks Passed`}
                  </p>
                  <p className={`text-xs ${allChecksPassed ? "text-green-600" : "text-amber-600"}`}>
                    {allChecksPassed ? "Ready to send" : "Fix remaining issues before sending"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
