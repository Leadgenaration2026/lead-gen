import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, RotateCcw, Save, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const SLOT_LABELS: Record<string, string> = {
  initial_outreach: "Initial Outreach",
  followup_angle: "Follow-up #1",
  followup_pain_point: "Follow-up #2",
  social_proof: "Follow-up #3 (Social Proof)",
  objection_handling: "Follow-up #4 (Objection)",
  alt_value_prop: "Follow-up #5",
  final_nudge: "Follow-up #6",
  breakup: "Follow-up #7 (Breakup)",
};

export interface LandingPageEmail {
  id: number;
  sequenceNumber: number;
  slotPurpose: string;
  subject: string;
  bodyHtml: string;
  bodyPlainText: string | null;
  dayOffset: number;
}

// Sibling to EmailPreviewDialog.tsx (not a fork of it -- this needs Edit/
// HTML/Save Template tabs that component doesn't have, and its own single
// Dialog is simpler than nesting one Dialog inside another's content).
export function EmailEditorDialog({ email, trigger }: { email: LandingPageEmail; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("preview");
  const [subject, setSubject] = useState(email.subject);
  const [bodyPlainText, setBodyPlainText] = useState(email.bodyPlainText || "");
  const [aiInstruction, setAiInstruction] = useState("");

  const utils = trpc.useUtils();
  const updateMutation = trpc.landingPageEmails.update.useMutation();
  const regenerateMutation = trpc.landingPageEmails.regenerate.useMutation();
  const saveTemplateMutation = trpc.landingPageEmails.saveAsTemplate.useMutation();
  const applyAiEditMutation = trpc.landingPageEmails.applyAiEdit.useMutation();
  const htmlQuery = trpc.landingPageEmails.renderHtml.useQuery(email.id, { enabled: open && tab === "html" });

  useEffect(() => {
    if (open) {
      setSubject(email.subject);
      setBodyPlainText(email.bodyPlainText || "");
      setTab("preview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, email.id]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ id: email.id, subject, bodyPlainText });
      toast.success("Changes saved");
      utils.landingPageEmails.list.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save");
    }
  };

  const handleRegenerate = async () => {
    try {
      const result = await regenerateMutation.mutateAsync(email.id);
      setSubject(result.subject);
      setBodyPlainText(result.body);
      toast.success(
        result.usedClaude
          ? "Regenerated with Claude"
          : `Regenerated (Claude unavailable -- used the fallback writer${result.claudeUnavailableReason ? `: ${result.claudeUnavailableReason}` : ""})`
      );
      utils.landingPageEmails.list.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Failed to regenerate");
    }
  };

  const handleSaveTemplate = async () => {
    try {
      await saveTemplateMutation.mutateAsync(email.id);
      toast.success("Saved to your template library");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save template");
    }
  };

  const handleApplyAiEdit = async () => {
    if (!aiInstruction.trim()) return;
    try {
      const result = await applyAiEditMutation.mutateAsync({ id: email.id, instruction: aiInstruction.trim() });
      setSubject(result.subject);
      setBodyPlainText(result.body);
      setAiInstruction("");
      toast.success("Applied");
      utils.landingPageEmails.list.invalidate();
      setTab("edit");
    } catch (error: any) {
      toast.error(error?.message || "AI edit failed");
    }
  };

  const handleCopyHtml = async () => {
    if (!htmlQuery.data?.html) return;
    try {
      await navigator.clipboard.writeText(htmlQuery.data.html);
      toast.success("HTML copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle>
            Email {email.sequenceNumber} &middot; {SLOT_LABELS[email.slotPurpose] || email.slotPurpose}
          </DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-3 w-fit">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="aiEdit">AI Edit</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 overflow-y-auto px-6 py-4">
            <p className="text-sm font-medium mb-3">{subject}</p>
            <div className="border rounded-md p-4 bg-white text-sm" dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
          </TabsContent>

          <TabsContent value="edit" className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Subject</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Body</label>
              <Textarea value={bodyPlainText} onChange={(e) => setBodyPlainText(e.target.value)} rows={14} className="mt-1 font-mono text-xs" />
            </div>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="gap-1.5">
              {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save Changes
            </Button>
          </TabsContent>

          <TabsContent value="aiEdit" className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Type what you'd like changed -- e.g. "make it shorter", "make the tone more casual", "focus more on cost savings". The rest of the email stays as-is.
            </p>
            <Textarea
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="Describe the change..."
              rows={3}
            />
            <Button size="sm" onClick={handleApplyAiEdit} disabled={!aiInstruction.trim() || applyAiEditMutation.isPending} className="gap-1.5">
              {applyAiEditMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Apply
            </Button>
          </TabsContent>

          <TabsContent value="html" className="flex-1 overflow-y-auto px-6 py-4">
            {htmlQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <>
                <Button size="sm" variant="outline" className="mb-3 gap-1.5" onClick={handleCopyHtml}>
                  <Copy className="w-3.5 h-3.5" /> Copy HTML
                </Button>
                <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{htmlQuery.data?.html}</pre>
              </>
            )}
          </TabsContent>
        </Tabs>
        <div className="flex gap-2 px-6 py-3 border-t bg-muted/30 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
            {regenerateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Regenerate
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending}>
            {saveTemplateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save as Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
