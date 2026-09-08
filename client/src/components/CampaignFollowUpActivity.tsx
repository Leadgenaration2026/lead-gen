import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Eye, Mail, MousePointerClick } from "lucide-react";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";

interface CampaignFollowUpActivityProps {
  campaignId: number;
}

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  draft: { className: "bg-gray-100 text-gray-700 border-gray-200", label: "Draft" },
  scheduled: { className: "bg-amber-50 text-amber-700 border-amber-200", label: "Scheduled" },
  sent: { className: "bg-blue-50 text-blue-700 border-blue-200", label: "Sent" },
  opened: { className: "bg-purple-50 text-purple-700 border-purple-200", label: "Opened" },
  clicked: { className: "bg-green-50 text-green-700 border-green-200", label: "Clicked" },
  failed: { className: "bg-red-50 text-red-700 border-red-200", label: "Failed" },
};

function formatDate(date: any) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Same per-lead reporting format as the main campaign's "View Tracking"
// (ActivityFeed) -- shown right below it, broken out by follow-up number,
// instead of living on a separate "Follow-ups" nav tab.
export function CampaignFollowUpActivity({ campaignId }: CampaignFollowUpActivityProps) {
  const { data: report, isLoading } = trpc.reports.campaignReport.useQuery(campaignId);
  const [activeSeq, setActiveSeq] = useState<string>("1");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report || report.leads.length === 0) return null;

  const maxSeq = Math.max(0, ...report.leads.flatMap((l: any) => l.followUpEmails.map((e: any) => e.sequenceNumber)));
  if (maxSeq === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No follow-ups scheduled for this campaign yet.</p>
    );
  }
  const sequences = Array.from({ length: maxSeq }, (_, i) => i + 1);

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Follow-Up Emails</CardTitle>
        <CardDescription>Each follow-up's own send/open/click activity, reported the same way as the campaign's initial send above</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeSeq} onValueChange={setActiveSeq}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {sequences.map((seq) => (
              <TabsTrigger key={seq} value={String(seq)} className="text-xs">Follow-up {seq}</TabsTrigger>
            ))}
          </TabsList>
          {sequences.map((seq) => {
            const rows = report.leads
              .map((lead: any) => ({ lead, email: lead.followUpEmails.find((e: any) => e.sequenceNumber === seq) }))
              .filter((r: any) => r.email);

            return (
              <TabsContent key={seq} value={String(seq)} className="mt-3">
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Not scheduled for any lead yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold">Lead</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="font-semibold">Sent</TableHead>
                          <TableHead className="font-semibold text-center">Opens</TableHead>
                          <TableHead className="font-semibold text-center">Clicks</TableHead>
                          <TableHead className="font-semibold text-center">Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map(({ lead, email }: any) => {
                          const badge = STATUS_BADGE[email.status] || STATUS_BADGE.draft;
                          return (
                            <TableRow key={`${lead.leadId}-${seq}`}>
                              <TableCell>
                                <p className="font-medium">{lead.leadName}</p>
                                <p className="text-xs text-muted-foreground">{lead.companyName}</p>
                              </TableCell>
                              <TableCell><Badge variant="outline" className={badge.className}>{badge.label}</Badge></TableCell>
                              <TableCell className="text-sm">{email.status === "scheduled" ? `Due ${formatDate(email.scheduledFor)}` : formatDate(email.sentAt)}</TableCell>
                              <TableCell className="text-center">
                                <span className={`inline-flex items-center gap-1 font-semibold ${email.openCount > 0 ? "text-purple-600" : "text-muted-foreground"}`}>
                                  <Mail className="w-3 h-3" /> {email.openCount || 0}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={`inline-flex items-center gap-1 font-semibold ${email.clickCount > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                  <MousePointerClick className="w-3 h-3" /> {email.clickCount || 0}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                {email.emailBody && (
                                  <EmailPreviewDialog
                                    subject={email.subject || "(No subject)"}
                                    body={email.emailBody}
                                    recipientName={lead.leadName}
                                    recipientEmail={lead.email}
                                    recipientCompany={lead.companyName}
                                    trigger={
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                        <Eye className="w-4 h-4 text-muted-foreground" />
                                      </Button>
                                    }
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
