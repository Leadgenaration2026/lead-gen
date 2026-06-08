import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Linkedin, Instagram, Facebook, Copy, ExternalLink, MessageSquare, Sparkles, Users } from "lucide-react";

type Platform = "linkedin" | "instagram" | "facebook";
type MessageType = "connection_request" | "direct_message";

const MESSAGE_TYPES: Record<MessageType, { label: string; description: string }> = {
  connection_request: { label: "Connection Request", description: "Short note for connection/follow request (200 chars max)" },
  direct_message: { label: "Direct Message", description: "Personalized DM to start a conversation" },
};

export default function SocialOutreach() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("linkedin");
  const [messageType, setMessageType] = useState<MessageType>("connection_request");
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [context, setContext] = useState("");

  const leadsQuery = trpc.leads.list.useQuery();
  const generateMessageMutation = trpc.social.generateMessage.useMutation();

  const leads = useMemo(() => leadsQuery.data || [], [leadsQuery.data]);
  const selectedLead = useMemo(() => leads.find((l) => String(l.id) === selectedLeadId), [leads, selectedLeadId]);

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
      toast.success("Message generated!");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate message");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedMessage);
    toast.success("Copied to clipboard!");
  };

  const handleOpenProfile = () => {
    if (!selectedLead) return;
    const url = selectedPlatform === "linkedin" ? selectedLead.linkedinUrl :
      selectedPlatform === "instagram" ? selectedLead.instagramUrl :
      (selectedLead as any).facebookUrl;
    if (url) {
      window.open(url, "_blank");
    } else {
      const platformName = selectedPlatform === "linkedin" ? "LinkedIn" : selectedPlatform === "instagram" ? "Instagram" : "Facebook";
      toast.error(`No ${platformName} URL found for this lead`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Social Outreach</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Generate personalized LinkedIn, Instagram & Facebook messages for your leads
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Message Configuration
            </CardTitle>
            <CardDescription>Select a lead and configure your outreach message</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Platform Selection */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Platform</label>
              <div className="flex gap-2">
                <Button
                  variant={selectedPlatform === "linkedin" ? "default" : "outline"}
                  onClick={() => setSelectedPlatform("linkedin")}
                  className="flex-1 gap-2"
                >
                  <Linkedin className="w-4 h-4" />
                  LinkedIn
                </Button>
                <Button
                  variant={selectedPlatform === "instagram" ? "default" : "outline"}
                  onClick={() => setSelectedPlatform("instagram")}
                  className="flex-1 gap-2"
                >
                  <Instagram className="w-4 h-4" />
                  Instagram
                </Button>
                <Button
                  variant={selectedPlatform === "facebook" ? "default" : "outline"}
                  onClick={() => setSelectedPlatform("facebook")}
                  className="flex-1 gap-2"
                >
                  <Facebook className="w-4 h-4" />
                  Facebook
                </Button>
              </div>
            </div>

            {/* Lead Selection */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Select Lead</label>
              <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={String(lead.id)}>
                      <span className="flex items-center gap-2">
                        {lead.ownerName} {lead.companyName && <span className="text-muted-foreground">&mdash; {lead.companyName}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lead Info Preview */}
            {selectedLead && (
              <div className="p-3 bg-muted/50 rounded-lg space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{selectedLead.ownerName}</span>
                  <div className="flex gap-1.5">
                    {selectedLead.linkedinUrl && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Linkedin className="w-3 h-3" /> LinkedIn
                      </Badge>
                    )}
                    {selectedLead.instagramUrl && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Instagram className="w-3 h-3" /> Instagram
                      </Badge>
                    )}
                    {(selectedLead as any).facebookUrl && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Facebook className="w-3 h-3" /> Facebook
                      </Badge>
                    )}
                  </div>
                </div>
                {selectedLead.industry && <p className="text-muted-foreground">{selectedLead.industry}</p>}
                {selectedLead.companyName && <p className="text-muted-foreground">{selectedLead.companyName}</p>}
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
                        <span className="text-xs text-muted-foreground ml-2">&mdash; {description}</span>
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
                placeholder="e.g., We provide virtual assistant services that help businesses automate their outreach..."
                rows={3}
              />
            </div>

            {/* Generate Button */}
            <Button onClick={handleGenerate} disabled={isGenerating || !selectedLeadId} className="w-full gap-2">
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
              ) : (
                <><Sparkles className="w-4 h-4" />Generate Message</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Message Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Generated Message
            </CardTitle>
            <CardDescription>
              {generatedMessage ? "Copy the message and send it on the platform" : "Configure and generate a message to see it here"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {generatedMessage ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{generatedMessage}</p>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{generatedMessage.length} characters</span>
                  {messageType === "connection_request" && generatedMessage.length > 300 && (
                    <Badge variant="destructive" className="text-xs">Over 300 char limit</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCopy} variant="outline" className="flex-1 gap-2">
                    <Copy className="w-4 h-4" />
                    Copy Message
                  </Button>
                  <Button onClick={handleOpenProfile} className="flex-1 gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Open Profile
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-sm">Select a lead and generate a personalized message</p>
                <p className="text-xs mt-1">Messages are crafted using AI based on the lead's profile</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
