import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MediaPickerDialog } from "@/components/MediaPickerDialog";
import { STYLE_OPTIONS } from "@/lib/seamlessOptions";

// A pasted hero-media URL from a recognized video host routes into a video
// embed instead of a static image -- same classification AIAgent.tsx's
// wizard already uses for its own hero-media step.
const HERO_VIDEO_HOST_PATTERN = /(?:youtube\.com|youtu\.be|vimeo\.com)/i;

// Short intake form for the AI Landing Page + 8-Email Campaign Generator --
// collects enough to generate a first draft (industry/audience/offer, style,
// optional real proof points, optional logo/hero media), then routes into
// the editor where everything is refinable. Reuses landingPages.generate,
// which does the market-research/theme synthesis + section + 8-email
// generation server-side (server/_core/campaignGenerator.ts) in one call --
// same options the AI Agent chat wizard already collects, so a fully
// configured page no longer requires going through the wizard.
export default function CampaignBuilder() {
  const [, navigate] = useLocation();
  const settingsQuery = trpc.settings.get.useQuery();
  const generateMutation = trpc.landingPages.generate.useMutation();
  const updateSectionsMutation = trpc.landingPages.updateSections.useMutation();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [offer, setOffer] = useState("");
  const [proofPointsText, setProofPointsText] = useState("");
  const [stylePreference, setStylePreference] = useState("clean_professional");
  const [logoUrl, setLogoUrl] = useState("");
  const [heroMediaUrl, setHeroMediaUrl] = useState("");

  const canSubmit = name.trim() && industry.trim() && targetAudience.trim() && offer.trim() && !generateMutation.isPending;

  const handleGenerate = async () => {
    if (!canSubmit) return;
    try {
      const proofPoints = proofPointsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const result = await generateMutation.mutateAsync({
        name: name.trim(),
        industry: industry.trim(),
        targetAudience: targetAudience.trim(),
        offer: offer.trim(),
        proofPoints: proofPoints.length > 0 ? proofPoints : undefined,
        logoUrl: logoUrl.trim() || undefined,
        stylePreference: stylePreference || undefined,
      });

      // landingPages.generate itself has no hero-media input -- same
      // additive patch AIAgent.tsx's wizard already uses right after
      // generation, applied to whichever section came back as "hero".
      const trimmedHero = heroMediaUrl.trim();
      if (trimmedHero && Array.isArray((result.landingPage as any)?.sections)) {
        const isVideo = HERO_VIDEO_HOST_PATTERN.test(trimmedHero);
        const sections = [...(result.landingPage as any).sections];
        const heroIndex = sections.findIndex((s: any) => s.type === "hero");
        if (heroIndex >= 0) {
          sections[heroIndex] = {
            ...sections[heroIndex],
            ...(isVideo ? { videoUrl: trimmedHero } : { imageUrl: trimmedHero }),
          };
          await updateSectionsMutation.mutateAsync({ id: result.landingPageId, sections });
        }
      }

      toast.success("Landing page and 8-email sequence generated");
      navigate(`/landing-pages/${result.landingPageId}`);
    } catch (error: any) {
      toast.error(error?.message || "Generation failed -- try again");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> New Landing Page + Email Campaign
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Describe the campaign and the AI will research common design/copy patterns for the industry, pick a theme, and generate a landing page plus a matching 8-email sequence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign details</CardTitle>
          <CardDescription>Everything here is editable afterward -- this just gets a first draft started.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="cb-name">Internal name</Label>
            <Input id="cb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 Bookkeeping Outreach" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cb-industry">Industry</Label>
            <Input id="cb-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. bookkeeping services" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cb-audience">Target audience</Label>
            <Input id="cb-audience" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="e.g. small business owners with 5-50 employees" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cb-offer">Offer / value proposition</Label>
            <Textarea id="cb-offer" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="What are you offering, and why should they care?" rows={3} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cb-proof">Real proof points (optional)</Label>
            <Textarea
              id="cb-proof"
              value={proofPointsText}
              onChange={(e) => setProofPointsText(e.target.value)}
              placeholder={"One per line -- a real testimonial quote, case study fact, or stat.\nLeft blank, the AI will never invent one."}
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Landing page style</Label>
            <div className="grid gap-1.5 mt-1">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStylePreference(opt.value)}
                  className={`text-left px-3 py-2 rounded-md border transition-colors ${
                    stylePreference === opt.value ? "border-primary bg-primary/5" : "border-input hover:bg-muted"
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Logo (optional)</Label>
            <div className="mt-1">
              <MediaPickerDialog
                value={logoUrl || undefined}
                onSelect={setLogoUrl}
                recommendedSize="Recommended: ~400x120px PNG, transparent background works best"
                aspect={null}
                triggerLabel="Choose logo"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cb-hero">Hero image or video (optional)</Label>
            <Input
              id="cb-hero"
              value={heroMediaUrl}
              onChange={(e) => setHeroMediaUrl(e.target.value)}
              placeholder="Paste an image URL or a YouTube/Vimeo link"
              className="mt-1"
            />
            <div className="mt-2">
              <MediaPickerDialog
                value={!HERO_VIDEO_HOST_PATTERN.test(heroMediaUrl) ? heroMediaUrl || undefined : undefined}
                onSelect={setHeroMediaUrl}
                recommendedSize="Recommended: 1600x900px (16:9), landscape"
                aspect={16 / 9}
                triggerLabel="Upload or choose from gallery"
              />
            </div>
          </div>
          {!settingsQuery.data?.companyName && (
            <p className="text-xs text-amber-600">
              No company name is set in Settings -- the generated page/emails will use a generic placeholder until you add one.
            </p>
          )}
          <Button onClick={handleGenerate} disabled={!canSubmit} className="w-full gap-1.5">
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generateMutation.isPending ? "Generating..." : "Generate Landing Page + Emails"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
