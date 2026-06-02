import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

type EmailType = "discovery" | "value_prop" | "social_proof" | "urgency" | "custom";

interface AIWriteButtonProps {
  onGenerated: (subject: string, body: string) => void;
  leadId?: number; // Optional: for personalized emails to specific lead
  includeVariables?: boolean; // For bulk templates with {{variables}}
  buttonLabel?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  buttonSize?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function AIWriteButton({
  onGenerated,
  leadId,
  includeVariables = false,
  buttonLabel = "AI Write",
  buttonVariant = "outline",
  buttonSize = "default",
  className = "",
}: AIWriteButtonProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [emailType, setEmailType] = useState<EmailType>("custom");
  const [companyContext, setCompanyContext] = useState("");

  const generateMutation = trpc.email.generateAITemplate.useMutation();

  const handleGenerate = async () => {
    if (!prompt || prompt.length < 5) {
      toast.error("Please describe what you want to say (at least 5 characters)");
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        prompt,
        emailType,
        companyContext: companyContext || undefined,
        leadId: leadId || undefined,
        includeVariables,
      });

      onGenerated(result.subject, result.body);
      toast.success("Email generated! Review and edit as needed.");
      setOpen(false);
      setPrompt("");
      setCompanyContext("");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate email. Please try again.");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        onClick={() => setOpen(true)}
        className={`gap-1.5 ${className}`}
      >
        <Wand2 className="w-3.5 h-3.5" />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              AI Email Writer
            </DialogTitle>
            <DialogDescription>
              Describe what you want to say and AI will write a professional, concise email with bullet points and a clear call-to-action.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* What to say */}
            <div className="space-y-2">
              <Label htmlFor="ai-prompt" className="font-medium">
                What do you want to say? *
              </Label>
              <Textarea
                id="ai-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={"Tell the AI what you want to communicate...\n\nExamples:\n• We help SaaS companies reduce churn by 40% with our AI-powered retention tool\n• Their website is slow and losing customers. We can fix it in 2 weeks.\n• Introduce our bookkeeping service for small businesses, mention we saved ABC Corp $50k/year"}
                rows={5}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Be specific about your offer, their pain points, and any results/numbers you want to mention.
              </p>
            </div>

            {/* Email Type */}
            <div className="space-y-2">
              <Label className="font-medium">Email Style</Label>
              <Select value={emailType} onValueChange={(v) => setEmailType(v as EmailType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discovery">Discovery — Ask about their challenges</SelectItem>
                  <SelectItem value="value_prop">Value Prop — Highlight your solution</SelectItem>
                  <SelectItem value="social_proof">Social Proof — Share success stories</SelectItem>
                  <SelectItem value="urgency">Urgency — Time-sensitive offer</SelectItem>
                  <SelectItem value="custom">Custom — Follow my instructions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Company/Industry Context (optional) */}
            <div className="space-y-2">
              <Label className="font-medium">Industry/Context <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={companyContext}
                onChange={(e) => setCompanyContext(e.target.value)}
                placeholder="e.g., They're a B2B SaaS company in healthcare. They recently raised Series A."
                rows={2}
                className="text-sm"
              />
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p className="font-medium mb-1">The AI will generate:</p>
              <ul className="text-xs space-y-0.5 list-disc pl-4">
                <li>A spam-proof subject line (under 50 chars)</li>
                <li>Professional, human-sounding email body</li>
                <li>2-4 bullet points highlighting key benefits</li>
                <li>Clear call-to-action with booking link</li>
                {includeVariables && (
                  <li className="text-blue-600 font-medium">Template variables ({"{{ownerName}}"}, {"{{companyName}}"}) for bulk sending</li>
                )}
              </ul>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || prompt.length < 5}
              className="w-full bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Writing your email...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Email
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
