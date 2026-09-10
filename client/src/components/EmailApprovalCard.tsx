import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Pencil, ArrowRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { EmailEditorDialog, SLOT_LABELS, type LandingPageEmail } from "@/components/EmailEditorDialog";

// Self-contained review card, same shape as TagPicker/SequenceReviewCard --
// owns its own state, calls back once the user is done -- so it can be
// dropped into the chat once via addAgent(undefined, <EmailApprovalCard .../>)
// and the wizard doesn't need to re-render a step for every email.
// Steps through the 8 generated emails one at a time instead of the old
// flat list, so each one gets a deliberate look before publish rather than
// a single "looks good" covering the whole batch.
export function EmailApprovalCard({ landingPageId, onAllApproved }: { landingPageId: number; onAllApproved: () => void }) {
  const [index, setIndex] = useState(0);
  const utils = trpc.useUtils();
  const emailsQuery = trpc.landingPageEmails.list.useQuery(landingPageId);
  const regenerateMutation = trpc.landingPageEmails.regenerate.useMutation();

  if (emailsQuery.isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading emails...</div>;
  }

  const emails: LandingPageEmail[] = emailsQuery.data || [];
  if (emails.length === 0) {
    return <p className="text-sm text-muted-foreground">No emails were generated for this landing page.</p>;
  }

  const email = emails[Math.min(index, emails.length - 1)];
  const isLast = index >= emails.length - 1;

  const handleApprove = () => {
    if (isLast) {
      onAllApproved();
    } else {
      setIndex((i) => i + 1);
    }
  };

  // Regenerates just this email (in place, same slot) with Claude first --
  // generateCampaignEmail (server/_core/campaignGenerator.ts) already tries
  // Claude and only falls back to the Gemini-based writer if Claude isn't
  // configured/available, and now reports which one actually ran so this
  // doesn't silently claim "Claude" when it wasn't.
  const handleRegenerate = async () => {
    try {
      const result = await regenerateMutation.mutateAsync(email.id);
      toast.success(
        result.usedClaude
          ? "Regenerated with Claude"
          : `Regenerated (Claude unavailable -- used the fallback writer${result.claudeUnavailableReason ? `: ${result.claudeUnavailableReason}` : ""})`
      );
      utils.landingPageEmails.list.invalidate(landingPageId);
    } catch (error: any) {
      toast.error(error?.message || "Failed to regenerate");
    }
  };

  return (
    <div className="space-y-3 max-w-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Email {index + 1} of {emails.length}{SLOT_LABELS[email.slotPurpose] ? ` -- ${SLOT_LABELS[email.slotPurpose]}` : ""}
        </p>
        <div className="flex gap-1">
          {emails.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= index ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>
      <div className="border rounded-md overflow-hidden bg-white">
        <div className="px-3 py-2 border-b bg-muted/40">
          <p className="text-sm font-semibold truncate">{email.subject}</p>
        </div>
        <div className="p-3 text-sm max-h-72 overflow-y-auto" dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
          {regenerateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Regenerate with Claude
        </Button>
        <EmailEditorDialog
          email={email}
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          }
        />
        <Button size="sm" onClick={handleApprove} className="gap-1.5">
          {isLast ? <Check className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
          {isLast ? "Approve & Finish" : "Approve & Next"}
        </Button>
      </div>
    </div>
  );
}
