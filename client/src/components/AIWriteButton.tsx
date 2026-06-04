import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Wand2, CheckCircle2, Search, AlertTriangle, TrendingUp, Shield } from "lucide-react";
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

interface ProblemAnalysis {
  weakPoints: string[];
  analysis: string;
  painPoints?: string[];
  industryTrends?: string[];
  competitiveThreats?: string[];
  suggestedApproach?: string;
  cached?: boolean;
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
  const [lastGenInfo, setLastGenInfo] = useState<{ generatedBy: string; model: string } | null>(null);
  
  // Problem analysis state
  const [problemAnalysis, setProblemAnalysis] = useState<ProblemAnalysis | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const generateMutation = trpc.email.generateAITemplate.useMutation();
  const analyzeMutation = trpc.leads.analyzeProblems.useMutation();

  const handleAnalyzeProblems = async () => {
    if (!leadId) {
      toast.error("Select a lead first to analyze their industry problems");
      return;
    }

    try {
      const result = await analyzeMutation.mutateAsync({
        leadId,
        additionalContext: companyContext || undefined,
      });
      setProblemAnalysis(result);
      setShowAnalysis(true);
      
      // Auto-suggest email type based on analysis
      if (result.suggestedApproach) {
        setEmailType(result.suggestedApproach as EmailType);
      }
      
      toast.success(
        result.cached 
          ? "Loaded existing problem analysis" 
          : "Problem analysis complete! Review the insights below.",
        { duration: 4000 }
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to analyze problems");
    }
  };

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
        useProblemAnalysis: !!problemAnalysis,
      });

      onGenerated(result.subject, result.body);
      setLastGenInfo({ generatedBy: result.generatedBy, model: result.model });
      toast.success(
        `Professional email generated! Review and edit as needed.`,
        { duration: 5000 }
      );
      setOpen(false);
      setPrompt("");
      setCompanyContext("");
      setProblemAnalysis(null);
      setShowAnalysis(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate email. Please try again.");
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
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
        {lastGenInfo && (
          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" />
            Powered by Claude ({lastGenInfo.model})
          </span>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              AI Email Writer
              <span className="text-xs font-normal bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-auto">
                Powered by Claude
              </span>
            </DialogTitle>
            <DialogDescription>
              First analyze the lead's industry problems, then generate a professional email tailored to their specific pain points.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Step 1: Problem Analysis */}
            {leadId && (
              <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-blue-600" />
                    <Label className="font-medium text-blue-900">Step 1: Analyze Industry Problems</Label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAnalyzeProblems}
                    disabled={analyzeMutation.isPending}
                    className="text-blue-600 border-blue-300 hover:bg-blue-100"
                  >
                    {analyzeMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Analyzing...
                      </>
                    ) : problemAnalysis ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Re-analyze
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5 mr-1.5" />
                        Analyze Problems
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-blue-700">
                  AI will research the lead's industry to identify specific pain points, trends, and competitive threats — then use these insights to write a highly relevant email.
                </p>

                {/* Analysis Results */}
                {problemAnalysis && showAnalysis && (
                  <div className="mt-3 space-y-3 border-t border-blue-200 pt-3">
                    {problemAnalysis.cached && (
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
                        Using cached analysis — click Re-analyze for fresh insights
                      </Badge>
                    )}

                    {/* Pain Points */}
                    {(problemAnalysis.painPoints || problemAnalysis.weakPoints.filter(w => !w.startsWith("["))).length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-xs font-semibold text-red-700">Pain Points</span>
                        </div>
                        <div className="space-y-1">
                          {(problemAnalysis.painPoints || problemAnalysis.weakPoints.filter(w => !w.startsWith("["))).slice(0, 5).map((point, i) => (
                            <p key={i} className="text-xs text-gray-700 pl-5 leading-relaxed">• {point}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Industry Trends */}
                    {problemAnalysis.industryTrends && problemAnalysis.industryTrends.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-xs font-semibold text-blue-700">Industry Trends</span>
                        </div>
                        <div className="space-y-1">
                          {problemAnalysis.industryTrends.slice(0, 3).map((trend, i) => (
                            <p key={i} className="text-xs text-gray-700 pl-5 leading-relaxed">• {trend}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Competitive Threats */}
                    {problemAnalysis.competitiveThreats && problemAnalysis.competitiveThreats.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Shield className="w-3.5 h-3.5 text-orange-500" />
                          <span className="text-xs font-semibold text-orange-700">Competitive Threats</span>
                        </div>
                        <div className="space-y-1">
                          {problemAnalysis.competitiveThreats.slice(0, 3).map((threat, i) => (
                            <p key={i} className="text-xs text-gray-700 pl-5 leading-relaxed">• {threat}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Analysis Summary */}
                    {problemAnalysis.analysis && (
                      <div className="bg-white/60 rounded p-2.5 border border-blue-100">
                        <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{problemAnalysis.analysis}</p>
                      </div>
                    )}

                    {problemAnalysis.suggestedApproach && (
                      <p className="text-xs text-blue-600 font-medium">
                        Suggested approach: <span className="capitalize">{problemAnalysis.suggestedApproach.replace("_", " ")}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Email Generation */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <Label className="font-medium">{leadId ? "Step 2: " : ""}Describe Your Email *</Label>
              </div>
              
              <Textarea
                id="ai-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={"Describe what you want to communicate...\n\nExamples:\n• We provide virtual assistant services that handle lead gen, appointment setting, and admin tasks\n• Our team helps businesses automate their outreach and save 20+ hours per week\n• We offer a 2-week free trial of our VA services for business owners struggling with growth"}
                rows={4}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Describe your services and what you want to communicate. The AI will combine this with the problem analysis to write a unique, professional email.
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
                  <SelectItem value="social_proof">Social Proof — Share success stories & case studies</SelectItem>
                  <SelectItem value="urgency">Urgency — Time-sensitive offer</SelectItem>
                  <SelectItem value="custom">Custom — Follow my instructions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Company/Industry Context (optional) */}
            <div className="space-y-2">
              <Label className="font-medium">Additional Context <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={companyContext}
                onChange={(e) => setCompanyContext(e.target.value)}
                placeholder="e.g., We specialize in helping dental clinics, real estate agents, and e-commerce businesses. We've helped 100+ clients scale their operations."
                rows={2}
                className="text-sm"
              />
            </div>

            {/* Email Format Info */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-purple-900 mb-1.5">Email will include:</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-purple-700">
                <span>✓ Personal greeting & industry reference</span>
                <span>✓ Specific pain points they face</span>
                <span>✓ Solutions with bold USPs</span>
                <span>✓ Case study with real numbers</span>
                <span>✓ Clear CTA with booking link</span>
                <span>✓ Human tone, no fluff</span>
              </div>
              {includeVariables && (
                <p className="text-xs text-purple-600 font-medium mt-2 border-t border-purple-200 pt-2">
                  Template variables ({"{{ownerName}}"}, {"{{companyName}}"}) for bulk sending
                </p>
              )}
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || prompt.length < 5}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
              size="lg"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Writing professional email...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Professional Email
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
