import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, ArrowUp, ArrowDown, Trash2, Copy, Pencil, Plus, Monitor, Tablet, Smartphone,
  Globe, RotateCcw, Check, Palette, ExternalLink, Mail, Sparkles, Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { EmailEditorDialog, SLOT_LABELS, type LandingPageEmail } from "@/components/EmailEditorDialog";
import { MediaPickerDialog } from "@/components/MediaPickerDialog";

type SectionType = "hero" | "problem" | "solution" | "benefits" | "features" | "testimonials" | "pricing" | "faq" | "final-cta" | "footer";

const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero", problem: "Problem", solution: "Solution", benefits: "Benefits", features: "Features",
  testimonials: "Testimonials", pricing: "Pricing / Offer", faq: "FAQ", "final-cta": "Final CTA", footer: "Footer",
};
const SECTION_TYPES = Object.keys(SECTION_LABELS) as SectionType[];
type SectionField = "headline" | "subheadline" | "body" | "ctaText" | "bullets" | "faqs" | "imageUrl" | "videoUrl" | "backgroundImageUrl";

// Every section type gets image/video/background media fields -- previously
// only "hero" did, so a user wanting a photo or background on any other
// section had no way to add one at all.
const MEDIA_FIELDS: SectionField[] = ["imageUrl", "videoUrl", "backgroundImageUrl"];
const SECTION_FIELDS: Record<SectionType, SectionField[]> = {
  hero: ["headline", "subheadline", "ctaText", ...MEDIA_FIELDS],
  problem: ["headline", "body", "bullets", ...MEDIA_FIELDS],
  solution: ["headline", "body", ...MEDIA_FIELDS],
  benefits: ["headline", "bullets", ...MEDIA_FIELDS],
  features: ["headline", "bullets", ...MEDIA_FIELDS],
  testimonials: ["headline", "body", ...MEDIA_FIELDS],
  pricing: ["headline", "body", ...MEDIA_FIELDS],
  faq: ["headline", "faqs", ...MEDIA_FIELDS],
  "final-cta": ["headline", "subheadline", "ctaText", ...MEDIA_FIELDS],
  footer: ["body", ...MEDIA_FIELDS],
};

interface Section {
  type: SectionType;
  headline?: string;
  subheadline?: string;
  body?: string;
  ctaText?: string;
  bullets?: string[];
  faqs?: Array<{ question: string; answer: string }>;
  imageUrl?: string;
  videoUrl?: string;
  backgroundImageUrl?: string;
}

const VIEWPORT_WIDTH: Record<string, string> = { desktop: "100%", tablet: "768px", mobile: "375px" };

export default function LandingPageEditor() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = Number(params.id);
  const utils = trpc.useUtils();

  const pageQuery = trpc.landingPages.get.useQuery(id, { enabled: !!id });
  const emailsQuery = trpc.landingPageEmails.list.useQuery(id, { enabled: !!id });
  const previewQuery = trpc.landingPages.previewHtml.useQuery(id, { enabled: !!id });

  const updateSectionsMutation = trpc.landingPages.updateSections.useMutation();
  const regenerateSectionMutation = trpc.landingPages.regenerateSection.useMutation();
  const regenerateThemeMutation = trpc.landingPages.regenerateTheme.useMutation();
  const updateThemeMutation = trpc.landingPages.updateTheme.useMutation();
  const updateMetaMutation = trpc.landingPages.updateMeta.useMutation();
  const publishMutation = trpc.landingPages.publish.useMutation();
  const unpublishMutation = trpc.landingPages.unpublish.useMutation();
  const duplicateMutation = trpc.landingPages.duplicate.useMutation();
  const applyAiEditMutation = trpc.landingPages.applyAiEdit.useMutation();

  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [addType, setAddType] = useState<SectionType>("benefits");
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);

  const page = pageQuery.data;
  const sections: Section[] = Array.isArray(page?.sections) ? (page!.sections as Section[]) : [];
  const publicUrl = page?.slug ? `${window.location.origin}/p/${page.slug}` : "";

  const refreshPreview = () => utils.landingPages.previewHtml.invalidate(id);

  const persistSections = async (next: Section[], successMessage?: string) => {
    try {
      await updateSectionsMutation.mutateAsync({ id, sections: next as any });
      utils.landingPages.get.invalidate(id);
      refreshPreview();
      if (successMessage) toast.success(successMessage);
    } catch (error: any) {
      toast.error(error?.message || "Failed to save changes");
    }
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    persistSections(next);
  };

  const removeSection = (index: number) => {
    persistSections(sections.filter((_, i) => i !== index), "Section removed");
  };

  const duplicateSection = (index: number) => {
    const next = [...sections];
    next.splice(index + 1, 0, { ...sections[index] });
    persistSections(next, "Section duplicated");
  };

  const addSection = async () => {
    const placeholder: Section = { type: addType, headline: "New section", body: "Click Edit to add content, or Regenerate to have AI write it." };
    const next = [...sections, placeholder];
    await persistSections(next, "Section added");
    // Immediately try to have AI fill it in rather than leaving a placeholder.
    try {
      const result = await regenerateSectionMutation.mutateAsync({ id, sectionIndex: next.length - 1, sectionType: addType });
      const filled = [...next];
      filled[next.length - 1] = result.section as any;
      await persistSections(filled);
    } catch {
      // Placeholder already saved -- fine if AI fill-in fails, user can Edit/Regenerate manually.
    }
  };

  const regenerateSection = async (index: number) => {
    try {
      const result = await regenerateSectionMutation.mutateAsync({ id, sectionIndex: index });
      const next = [...sections];
      next[index] = result.section as any;
      await persistSections(next, "Section regenerated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to regenerate section");
    }
  };

  const handleRegenerateTheme = async () => {
    try {
      await regenerateThemeMutation.mutateAsync(id);
      utils.landingPages.get.invalidate(id);
      refreshPreview();
      toast.success("Theme regenerated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to regenerate theme");
    }
  };

  const handleApplyAiEdit = async () => {
    if (!aiInstruction.trim()) return;
    try {
      await applyAiEditMutation.mutateAsync({ id, instruction: aiInstruction.trim() });
      setAiInstruction("");
      utils.landingPages.get.invalidate(id);
      refreshPreview();
      toast.success("Applied");
    } catch (error: any) {
      toast.error(error?.message || "AI edit failed");
    }
  };

  const handleColorChange = async (key: string, value: string) => {
    if (!page) return;
    const nextTheme = { ...(page.theme as any), [key]: value };
    try {
      await updateThemeMutation.mutateAsync({ id, theme: nextTheme });
      utils.landingPages.get.invalidate(id);
      refreshPreview();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update color");
    }
  };

  const handleLogoSelect = async (url: string) => {
    try {
      await updateMetaMutation.mutateAsync({ id, logoUrl: url });
      utils.landingPages.get.invalidate(id);
      refreshPreview();
      toast.success(url ? "Logo updated" : "Logo removed");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update logo");
    }
  };

  const handlePublishToggle = async () => {
    try {
      if (page?.status === "published") {
        await unpublishMutation.mutateAsync(id);
        toast.success("Unpublished");
      } else {
        const result = await publishMutation.mutateAsync(id);
        toast.success("Published");
        if (result.url) {
          try { await navigator.clipboard.writeText(result.url); toast.message("URL copied to clipboard"); } catch { /* ignore */ }
        }
      }
      utils.landingPages.get.invalidate(id);
    } catch (error: any) {
      toast.error(error?.message || "Failed to update publish status");
    }
  };

  const handleCopyUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("URL copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const handleDuplicate = async () => {
    try {
      const result = await duplicateMutation.mutateAsync(id);
      toast.success("Duplicated");
      if (result.landingPageId) navigate(`/landing-pages/${result.landingPageId}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to duplicate");
    }
  };

  if (pageQuery.isLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!page) {
    return <p className="text-center text-muted-foreground py-24">Landing page not found.</p>;
  }

  const theme = page.theme as any;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">{page.name}</h1>
          {page.researchNote && <p className="text-xs text-muted-foreground mt-1 max-w-2xl italic">{page.researchNote}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={page.status === "published" ? "default" : "outline"}>{page.status === "published" ? "Published" : "Draft"}</Badge>
          {publicUrl && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCopyUrl}>
              <Copy className="w-3.5 h-3.5" /> Copy URL
            </Button>
          )}
          {page.status === "published" && publicUrl && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(publicUrl, "_blank")}>
              <ExternalLink className="w-3.5 h-3.5" /> View Live
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDuplicate} disabled={duplicateMutation.isPending}>
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreateCampaign(true)}>
            <Megaphone className="w-3.5 h-3.5" /> Create Campaign
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handlePublishToggle} disabled={publishMutation.isPending || unpublishMutation.isPending}>
            {(publishMutation.isPending || unpublishMutation.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
            {page.status === "published" ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* Left: sections + theme + email list */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Sections</p>
              </div>
              <div className="space-y-1.5">
                {sections.map((section, index) => (
                  <div key={index} className="flex items-center gap-1.5 border rounded-md px-2 py-1.5 bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{SECTION_LABELS[section.type] || section.type}</p>
                      <p className="text-xs text-muted-foreground truncate">{section.headline || section.body || ""}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveSection(index, -1)} disabled={index === 0}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingIndex(index)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => duplicateSection(index)}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600" onClick={() => removeSection(index)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Select value={addType} onValueChange={(v) => setAddType(v as SectionType)}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECTION_TYPES.map((t) => <SelectItem key={t} value={t}>{SECTION_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={addSection}>
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" /> Theme</p>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={handleRegenerateTheme} disabled={regenerateThemeMutation.isPending}>
                  {regenerateThemeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Regenerate Theme
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {theme && Object.keys(theme).map((key) => (
                  <label key={key} className="flex flex-col items-center gap-1 cursor-pointer">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => handleColorChange(key, e.target.value)}
                      className="w-9 h-9 rounded-md border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground capitalize">{key}</span>
                  </label>
                ))}
              </div>
              <div className="pt-1 border-t">
                <p className="text-xs text-muted-foreground mb-1.5">Logo</p>
                <MediaPickerDialog
                  value={page.logoUrl || undefined}
                  onSelect={handleLogoSelect}
                  recommendedSize="Recommended: ~400x120px PNG, transparent background works best"
                  aspect={null}
                  triggerLabel="Choose logo"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> 8-Email Sequence</p>
              {emailsQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <div className="space-y-1.5">
                  {(emailsQuery.data || []).map((email: LandingPageEmail) => (
                    <EmailEditorDialog
                      key={email.id}
                      email={email}
                      trigger={
                        <button className="w-full text-left flex items-center justify-between gap-2 border rounded-md px-2 py-1.5 bg-muted/30 hover:bg-muted/50">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">Email {email.sequenceNumber} &middot; {SLOT_LABELS[email.slotPurpose] || email.slotPurpose}</p>
                            <p className="text-xs text-muted-foreground truncate">{email.subject}</p>
                          </div>
                          <Pencil className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: live preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-1.5">
            <Button size="icon" variant={viewport === "desktop" ? "default" : "outline"} className="h-8 w-8" onClick={() => setViewport("desktop")}>
              <Monitor className="w-4 h-4" />
            </Button>
            <Button size="icon" variant={viewport === "tablet" ? "default" : "outline"} className="h-8 w-8" onClick={() => setViewport("tablet")}>
              <Tablet className="w-4 h-4" />
            </Button>
            <Button size="icon" variant={viewport === "mobile" ? "default" : "outline"} className="h-8 w-8" onClick={() => setViewport("mobile")}>
              <Smartphone className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder='AI edit, e.g. "make it more premium", "use a darker theme"'
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleApplyAiEdit()}
            />
            <Button onClick={handleApplyAiEdit} disabled={!aiInstruction.trim() || applyAiEditMutation.isPending} className="gap-1.5">
              {applyAiEditMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Apply
            </Button>
          </div>
          <div className="flex justify-center bg-muted/30 rounded-lg p-4 overflow-x-auto">
            <div style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: "100%", transition: "width 0.2s" }} className="bg-white rounded-md shadow-sm border overflow-hidden">
              {previewQuery.isLoading ? (
                <div className="flex items-center justify-center h-96"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <iframe title="Landing page preview" srcDoc={previewQuery.data?.html || ""} style={{ width: "100%", height: "900px", border: "none" }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {editingIndex !== null && sections[editingIndex] && (
        <SectionEditDialog
          section={sections[editingIndex]}
          onClose={() => setEditingIndex(null)}
          onSave={(updated) => {
            const next = [...sections];
            next[editingIndex] = updated;
            persistSections(next, "Section saved");
            setEditingIndex(null);
          }}
          onRegenerate={() => {
            regenerateSection(editingIndex);
            setEditingIndex(null);
          }}
        />
      )}

      {showCreateCampaign && (
        <CreateCampaignDialog
          landingPageId={id}
          defaultName={page.name}
          onClose={() => setShowCreateCampaign(false)}
          onCreated={(campaignId) => navigate(`/campaigns/${campaignId}`)}
        />
      )}
    </div>
  );
}

function CreateCampaignDialog({
  landingPageId,
  defaultName,
  onClose,
  onCreated,
}: {
  landingPageId: number;
  defaultName: string;
  onClose: () => void;
  onCreated: (campaignId: number) => void;
}) {
  const [campaignName, setCampaignName] = useState(defaultName);
  const [selectedLeadSetId, setSelectedLeadSetId] = useState<string>("");
  const leadSetsQuery = trpc.leadSets.list.useQuery();
  const createMutation = trpc.landingPages.createCampaignFromSequence.useMutation();
  const utils = trpc.useUtils();

  const selectedSet = (leadSetsQuery.data || []).find((s: any) => String(s.id) === selectedLeadSetId);
  const leadsQuery = trpc.leads.listBySourceListOrTag.useQuery(
    selectedSet ? (selectedSet.type === "tag" ? { leadSetId: selectedSet.id } : { sourceListId: selectedSet.id }) : {},
    { enabled: !!selectedSet }
  );

  const handleCreate = async () => {
    if (!selectedSet || !campaignName.trim()) return;
    const leadIds = (leadsQuery.data || []).map((l: any) => l.id);
    if (leadIds.length === 0) {
      toast.error("That list/tag has no leads");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({ landingPageId, campaignName: campaignName.trim(), leadIds });
      if (result.campaignId) {
        toast.success(`Campaign created with ${leadIds.length} lead(s) -- launch it from the Campaigns page`);
        utils.landingPages.get.invalidate(landingPageId);
        onCreated(result.campaignId);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to create campaign");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Campaign from this Sequence</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Campaign name</label>
            <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Leads (choose a list or tag)</label>
            <Select value={selectedLeadSetId} onValueChange={setSelectedLeadSetId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select a lead set..." /></SelectTrigger>
              <SelectContent>
                {(leadSetsQuery.data || []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSet && (
              <p className="text-xs text-muted-foreground mt-1">
                {leadsQuery.isLoading ? "Loading leads..." : `${(leadsQuery.data || []).length} lead(s)`}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This attaches Email 1 as the campaign's initial email and schedules Emails 2-8 as follow-ups. The campaign is created as a draft -- launch it from the Campaigns page when ready.
          </p>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleCreate}
            disabled={!selectedSet || !campaignName.trim() || createMutation.isPending || leadsQuery.isLoading}
          >
            {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Create Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionEditDialog({
  section,
  onClose,
  onSave,
  onRegenerate,
}: {
  section: Section;
  onClose: () => void;
  onSave: (updated: Section) => void;
  onRegenerate: () => void;
}) {
  const fields = SECTION_FIELDS[section.type] || [];
  const [headline, setHeadline] = useState(section.headline || "");
  const [subheadline, setSubheadline] = useState(section.subheadline || "");
  const [body, setBody] = useState(section.body || "");
  const [ctaText, setCtaText] = useState(section.ctaText || "");
  const [bulletsText, setBulletsText] = useState((section.bullets || []).join("\n"));
  const [imageUrl, setImageUrl] = useState(section.imageUrl || "");
  const [videoUrl, setVideoUrl] = useState(section.videoUrl || "");
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(section.backgroundImageUrl || "");
  const [faqs, setFaqs] = useState(section.faqs && section.faqs.length > 0 ? section.faqs : [{ question: "", answer: "" }]);

  useEffect(() => {
    setHeadline(section.headline || "");
    setSubheadline(section.subheadline || "");
    setBody(section.body || "");
    setCtaText(section.ctaText || "");
    setBulletsText((section.bullets || []).join("\n"));
    setImageUrl(section.imageUrl || "");
    setVideoUrl(section.videoUrl || "");
    setBackgroundImageUrl(section.backgroundImageUrl || "");
    setFaqs(section.faqs && section.faqs.length > 0 ? section.faqs : [{ question: "", answer: "" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const handleSave = () => {
    const updated: Section = { type: section.type };
    if (fields.includes("headline")) updated.headline = headline;
    if (fields.includes("subheadline")) updated.subheadline = subheadline;
    if (fields.includes("body")) updated.body = body;
    if (fields.includes("ctaText")) updated.ctaText = ctaText;
    if (fields.includes("imageUrl")) updated.imageUrl = imageUrl;
    if (fields.includes("videoUrl")) updated.videoUrl = videoUrl;
    if (fields.includes("backgroundImageUrl")) updated.backgroundImageUrl = backgroundImageUrl;
    if (fields.includes("bullets")) updated.bullets = bulletsText.split("\n").map((b) => b.trim()).filter(Boolean);
    if (fields.includes("faqs")) updated.faqs = faqs.filter((f) => f.question.trim() || f.answer.trim());
    onSave(updated);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {SECTION_LABELS[section.type] || section.type} section</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.includes("headline") && (
            <div><label className="text-xs text-muted-foreground">Headline</label><Input value={headline} onChange={(e) => setHeadline(e.target.value)} className="mt-1" /></div>
          )}
          {fields.includes("subheadline") && (
            <div><label className="text-xs text-muted-foreground">Subheadline</label><Input value={subheadline} onChange={(e) => setSubheadline(e.target.value)} className="mt-1" /></div>
          )}
          {fields.includes("body") && (
            <div><label className="text-xs text-muted-foreground">Body</label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1" /></div>
          )}
          {fields.includes("ctaText") && (
            <div><label className="text-xs text-muted-foreground">CTA button text</label><Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} className="mt-1" /></div>
          )}
          {fields.includes("videoUrl") && (
            <div><label className="text-xs text-muted-foreground">Video URL (YouTube/Vimeo -- takes priority over the image below)</label><Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="mt-1" /></div>
          )}
          {fields.includes("imageUrl") && (
            <div>
              <label className="text-xs text-muted-foreground">Image</label>
              <div className="mt-1">
                <MediaPickerDialog
                  value={imageUrl || undefined}
                  onSelect={setImageUrl}
                  recommendedSize="Recommended: 1200x800px (3:2)"
                  aspect={3 / 2}
                  triggerLabel="Choose image"
                />
              </div>
            </div>
          )}
          {fields.includes("backgroundImageUrl") && (
            <div>
              <label className="text-xs text-muted-foreground">Section background image</label>
              <div className="mt-1">
                <MediaPickerDialog
                  value={backgroundImageUrl || undefined}
                  onSelect={setBackgroundImageUrl}
                  recommendedSize="Recommended: 1920x1080px (16:9), will be cropped to cover the whole section"
                  aspect={16 / 9}
                  triggerLabel="Choose background"
                />
              </div>
            </div>
          )}
          {fields.includes("bullets") && (
            <div>
              <label className="text-xs text-muted-foreground">Bullets (one per line)</label>
              <Textarea value={bulletsText} onChange={(e) => setBulletsText(e.target.value)} rows={5} className="mt-1" />
            </div>
          )}
          {fields.includes("faqs") && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">FAQs</label>
              {faqs.map((f, i) => (
                <div key={i} className="border rounded-md p-2 space-y-1.5">
                  <Input
                    value={f.question}
                    placeholder="Question"
                    onChange={(e) => setFaqs((prev) => prev.map((p, j) => j === i ? { ...p, question: e.target.value } : p))}
                  />
                  <Textarea
                    value={f.answer}
                    placeholder="Answer"
                    rows={2}
                    onChange={(e) => setFaqs((prev) => prev.map((p, j) => j === i ? { ...p, answer: e.target.value } : p))}
                  />
                  <Button size="sm" variant="ghost" className="text-red-500 h-6 text-xs" onClick={() => setFaqs((prev) => prev.filter((_, j) => j !== i))}>Remove</Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setFaqs((prev) => [...prev, { question: "", answer: "" }])}>
                <Plus className="w-3.5 h-3.5" /> Add FAQ
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onRegenerate}>
            <Sparkles className="w-3.5 h-3.5" /> Regenerate with AI
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave}>
            <Check className="w-3.5 h-3.5" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
