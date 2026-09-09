import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Phone, CalendarClock, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface Proposal {
  action: "call_now" | "schedule";
  campaignLeadId: number;
  leadName: string;
  companyName: string;
  count?: number;
}

// Conversational front-end for the calls.interpretRequest procedure --
// lets the user type things like "call John Smith now" or "schedule 3
// calls for Acme Corp" instead of hunting for the right lead row. This
// never places/schedules a call itself: it only resolves the free text to
// a real campaignLeadId (validated server-side against this campaign's
// actual leads) and shows a confirm card; on confirm it calls the exact
// same calls.callNow / calls.scheduleCalls mutations EngagementPopups.tsx
// already uses.
export function CampaignCallAgent({ campaignId }: { campaignId: number }) {
  const [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [unclear, setUnclear] = useState<string[] | null>(null);
  const [scheduleCount, setScheduleCount] = useState("1");

  const interpretMutation = trpc.calls.interpretRequest.useMutation();
  const callNowMutation = trpc.calls.callNow.useMutation();
  const scheduleCallsMutation = trpc.calls.scheduleCalls.useMutation();

  const busy = interpretMutation.isPending || callNowMutation.isPending || scheduleCallsMutation.isPending;

  const handleSubmit = async () => {
    if (!message.trim() || busy) return;
    setUnclear(null);
    setProposal(null);
    try {
      const result = await interpretMutation.mutateAsync({ campaignId, message: message.trim() });
      if (result.action === "call_now" || result.action === "schedule") {
        setProposal(result as Proposal);
        setScheduleCount(String(result.count || 1));
      } else if (result.action === "unclear") {
        setUnclear((result as any).sampleLeads || []);
      } else {
        toast.error("This campaign has no leads to call yet");
      }
    } catch (error: any) {
      toast.error(error?.message || "Couldn't understand that request");
    } finally {
      setMessage("");
    }
  };

  const handleConfirm = async () => {
    if (!proposal) return;
    try {
      if (proposal.action === "call_now") {
        await callNowMutation.mutateAsync({ campaignLeadId: proposal.campaignLeadId });
        toast.success(`Calling ${proposal.leadName} now`);
      } else {
        const count = Math.min(10, Math.max(1, parseInt(scheduleCount, 10) || 1));
        await scheduleCallsMutation.mutateAsync({ campaignLeadId: proposal.campaignLeadId, count });
        toast.success(`Scheduled ${count} call${count > 1 ? "s" : ""} to ${proposal.leadName}`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to place the call");
    } finally {
      setProposal(null);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="w-4 h-4 text-purple-600" />
          Call Agent
          <span className="text-xs text-muted-foreground font-normal">
            try "call John Smith now" or "schedule 3 calls for Acme Corp"
          </span>
        </div>

        {proposal ? (
          <div className="rounded-md border border-purple-200 bg-purple-50 dark:bg-purple-950/20 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">
                {proposal.action === "call_now" ? "Call" : "Schedule calls for"}{" "}
                <span className="font-semibold">{proposal.leadName}</span> ({proposal.companyName}) now?
              </p>
              <button onClick={() => setProposal(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {proposal.action === "schedule" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Number of calls:</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={scheduleCount}
                  onChange={(e) => setScheduleCount(e.target.value)}
                  className="h-8 w-16 text-xs"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="gap-1.5" disabled={busy} onClick={handleConfirm}>
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : proposal.action === "call_now" ? (
                  <Phone className="w-3.5 h-3.5" />
                ) : (
                  <CalendarClock className="w-3.5 h-3.5" />
                )}
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setProposal(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Call John Smith now..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              disabled={busy}
            />
            <Button size="sm" disabled={busy || !message.trim()} onClick={handleSubmit}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Ask"}
            </Button>
          </div>
        )}

        {unclear && (
          <p className="text-xs text-muted-foreground">
            {unclear.length > 0
              ? `Not sure who you mean — try a name like ${unclear.slice(0, 3).join(", ")}.`
              : "Not sure who you mean — try including the lead's name or company."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
