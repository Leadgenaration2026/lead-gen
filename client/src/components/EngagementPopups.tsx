import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, Linkedin, Instagram, Facebook, Copy, X, Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const PLATFORM_ICON: Record<string, typeof Linkedin> = {
  linkedin: Linkedin,
  instagram: Instagram,
  facebook: Facebook,
};

const TRIGGER_LABEL: Record<string, string> = {
  email_sent: "Email just sent to",
  followup_sent: "Follow-up email just sent to",
  email_open: "opened your email --",
  email_click: "clicked a link --",
};

// Automatic calling and the LinkedIn-reminder email are both disabled (see
// followUpScheduler.ts) -- this is what replaces them: a floating panel,
// visible everywhere in the app, that polls for "an email/follow-up just
// went out" / "a LinkedIn message is ready" and lets the user act (call
// now, schedule N calls, or dismiss) instead of anything happening on its
// own.
export function EngagementPopups() {
  const callSuggestionsQuery = trpc.callSuggestions.list.useQuery(undefined, { refetchInterval: 25000 });
  const socialPopupsQuery = trpc.social.listPendingPopups.useQuery(undefined, { refetchInterval: 25000 });
  const callNowMutation = trpc.calls.callNow.useMutation();
  const scheduleCallsMutation = trpc.calls.scheduleCalls.useMutation();
  const dismissCallMutation = trpc.callSuggestions.dismiss.useMutation();
  const dismissSocialMutation = trpc.social.dismissPopup.useMutation();
  const markSentMutation = trpc.social.markSent.useMutation();

  const [callingId, setCallingId] = useState<number | null>(null);
  const [schedulingId, setSchedulingId] = useState<number | null>(null);
  const [copyingId, setCopyingId] = useState<number | null>(null);
  const [scheduleCounts, setScheduleCounts] = useState<Record<number, string>>({});

  const suggestions = callSuggestionsQuery.data || [];
  const socialPopups = socialPopupsQuery.data || [];

  if (suggestions.length === 0 && socialPopups.length === 0) return null;

  const handleCallNow = async (suggestionId: number, campaignLeadId: number, leadName: string) => {
    setCallingId(suggestionId);
    try {
      await callNowMutation.mutateAsync({ suggestionId, campaignLeadId });
      toast.success(`Calling ${leadName} now`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to place the call");
    } finally {
      setCallingId(null);
      callSuggestionsQuery.refetch();
    }
  };

  const handleScheduleCalls = async (suggestionId: number, campaignLeadId: number, leadName: string) => {
    const raw = scheduleCounts[suggestionId] || "1";
    const count = Math.min(10, Math.max(1, parseInt(raw, 10) || 1));
    setSchedulingId(suggestionId);
    try {
      await scheduleCallsMutation.mutateAsync({ suggestionId, campaignLeadId, count });
      toast.success(`Scheduled ${count} call${count > 1 ? "s" : ""} to ${leadName}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to schedule calls");
    } finally {
      setSchedulingId(null);
      callSuggestionsQuery.refetch();
    }
  };

  const handleDismissCall = async (id: number) => {
    await dismissCallMutation.mutateAsync({ id });
    callSuggestionsQuery.refetch();
  };

  const handleCopyAndOpen = async (id: number, message: string, profileUrl: string | null) => {
    setCopyingId(id);
    try {
      await navigator.clipboard.writeText(message);
      if (profileUrl) window.open(profileUrl, "_blank");
      toast.success("Message copied — paste it once you've sent it, mark this done");
    } catch {
      toast.error("Couldn't copy to clipboard");
    } finally {
      setCopyingId(null);
    }
  };

  const handleMarkSentAndDismiss = async (id: number) => {
    await markSentMutation.mutateAsync(id);
    await dismissSocialMutation.mutateAsync({ id });
    toast.success("Marked as sent");
    socialPopupsQuery.refetch();
  };

  const handleDismissSocial = async (id: number) => {
    await dismissSocialMutation.mutateAsync({ id });
    socialPopupsQuery.refetch();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 w-full max-w-sm max-h-[80vh] overflow-y-auto">
      {suggestions.map((s: any) => (
        <Card key={`call-${s.id}`} className="shadow-lg border-blue-300 bg-white dark:bg-background">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <p className="text-sm font-semibold leading-tight">
                  {TRIGGER_LABEL[s.triggerType] || "Ready to call"} {s.leadName}
                </p>
              </div>
              <button onClick={() => handleDismissCall(s.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{s.companyName}{s.campaignName ? ` · ${s.campaignName}` : ""}</p>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                disabled={callingId === s.id}
                onClick={() => handleCallNow(s.id, s.campaignLeadId, s.leadName)}
              >
                {callingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                Call Now
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleDismissCall(s.id)}>Dismiss</Button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Input
                type="number"
                min={1}
                max={10}
                value={scheduleCounts[s.id] ?? "1"}
                onChange={(e) => setScheduleCounts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                className="h-8 w-16 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 text-xs"
                disabled={schedulingId === s.id}
                onClick={() => handleScheduleCalls(s.id, s.campaignLeadId, s.leadName)}
              >
                {schedulingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                Schedule Calls
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {socialPopups.map((p: any) => {
        const PlatformIcon = PLATFORM_ICON[p.platform] || Linkedin;
        return (
          <Card key={`social-${p.id}`} className="shadow-lg border-indigo-300 bg-white dark:bg-background">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                    <PlatformIcon className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <p className="text-sm font-semibold leading-tight">
                    {p.leadName} — {p.platform} message ready
                  </p>
                </div>
                <button onClick={() => handleDismissSocial(p.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{p.companyName}</p>
              <p className="text-xs italic bg-muted/50 rounded p-2 line-clamp-3">"{p.message}"</p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5"
                  disabled={copyingId === p.id}
                  onClick={() => handleCopyAndOpen(p.id, p.message, p.profileUrl)}
                >
                  <Copy className="w-3.5 h-3.5" /> Copy & Open Profile
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => handleMarkSentAndDismiss(p.id)}>
                  Sent
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
