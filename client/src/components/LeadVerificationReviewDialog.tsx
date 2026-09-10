import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  valid: "Valid", invalid: "Invalid", catch_all: "Catch-All", role_based: "Role-Based", disposable: "Disposable", unknown: "Unknown",
};
const STATUS_COLORS: Record<string, string> = {
  valid: "border-green-300 text-green-700 dark:text-green-400",
  invalid: "border-red-300 text-red-700 dark:text-red-400",
  disposable: "border-red-300 text-red-700 dark:text-red-400",
  catch_all: "border-amber-300 text-amber-700 dark:text-amber-400",
  role_based: "border-amber-300 text-amber-700 dark:text-amber-400",
  unknown: "border-gray-300 text-gray-500",
};
// Matches the default safety rules elsewhere in the app: valid/catch-all/
// role-based/unknown are eligible-or-review-optional and start checked;
// invalid/disposable are the "do not send" tier and start unchecked --
// visible and checkable, never hidden, so an explicit override is possible.
const DEFAULT_CHECKED_STATUSES = new Set(["valid", "catch_all", "role_based", "unknown"]);

export interface LeadReviewRow {
  leadId: number;
  email: string;
  normalizedStatus: string;
  ownerName?: string;
  companyName?: string;
}

interface LeadVerificationReviewDialogProps {
  open: boolean;
  rows: LeadReviewRow[];
  onConfirm: (selectedLeadIds: number[]) => void;
}

// The "pop up" the user asked for: every verified lead, valid or not, with
// its status and a checkbox -- so which leads actually proceed is a manual,
// visible decision (mirroring how this is done by hand today) rather than
// an automatic valid-only filter with no visibility into what got excluded.
export function LeadVerificationReviewDialog({ open, rows, onConfirm }: LeadVerificationReviewDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      setSelected(new Set(rows.filter((r) => DEFAULT_CHECKED_STATUSES.has(r.normalizedStatus)).map((r) => r.leadId)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows.length]);

  const toggle = (leadId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((r) => r.leadId)) : new Set());
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Review verified leads</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Every lead is shown with its verification result. Valid/catch-all/role-based/unknown are checked by default; invalid/disposable aren't -- adjust as needed, then continue.
        </p>
        <div className="flex items-center gap-2 text-xs">
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => toggleAll(true)}>Select all</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => toggleAll(false)}>Select none</Button>
          <span className="text-muted-foreground">{selected.size} of {rows.length} selected</span>
        </div>
        <div className="flex-1 overflow-y-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.leadId}>
                  <TableCell><Checkbox checked={selected.has(r.leadId)} onCheckedChange={() => toggle(r.leadId)} /></TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{r.ownerName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.companyName}</div>
                  </TableCell>
                  <TableCell className="text-xs">{r.email}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_COLORS[r.normalizedStatus]}>{STATUS_LABELS[r.normalizedStatus] || r.normalizedStatus}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button onClick={() => onConfirm(Array.from(selected))} disabled={selected.size === 0} className="gap-1.5">
            <Check className="w-4 h-4" /> Continue with {selected.size} lead{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
