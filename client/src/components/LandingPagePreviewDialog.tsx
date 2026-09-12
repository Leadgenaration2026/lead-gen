import { useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, Tablet, Smartphone, Eye } from "lucide-react";

const VIEWPORT_WIDTH: Record<string, string> = { desktop: "100%", tablet: "768px", mobile: "375px" };

// Same rendered output an email's CTA link actually leads to (server/_core/publicPages.ts,
// via landingPages.previewHtml) -- shown full-size in a dialog so it can be checked
// before sending, rather than the small ~400px-tall iframe AIAgent.tsx's
// SequenceReviewCard/LandingPageEditor.tsx each already render inline for their own,
// narrower purposes. Only queries previewHtml while actually open, since this is
// typically mounted once per list row (e.g. one per campaign in CampaignsList.tsx).
export function LandingPagePreviewDialog({ landingPageId, trigger }: { landingPageId: number; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const previewQuery = trpc.landingPages.previewHtml.useQuery(landingPageId, { enabled: open });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-2">
            <Eye className="w-4 h-4" /> Preview Landing Page
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            <span>Landing page preview</span>
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant={viewport === "desktop" ? "default" : "outline"} className="h-7 w-7" onClick={() => setViewport("desktop")}>
                <Monitor className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant={viewport === "tablet" ? "default" : "outline"} className="h-7 w-7" onClick={() => setViewport("tablet")}>
                <Tablet className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant={viewport === "mobile" ? "default" : "outline"} className="h-7 w-7" onClick={() => setViewport("mobile")}>
                <Smartphone className="w-3.5 h-3.5" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto flex justify-center bg-muted/30 rounded-md p-3">
          {previewQuery.isLoading ? (
            <div className="flex items-center justify-center w-full h-full min-h-[300px]"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: "100%", transition: "width 0.2s" }} className="bg-white rounded-md shadow-sm border overflow-hidden">
              <iframe title="Landing page preview" srcDoc={previewQuery.data?.html || ""} style={{ width: "100%", height: "75vh", border: "none" }} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
