import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Mail, Phone, CheckCircle, Clock, AlertCircle, TrendingUp, Eye, MousePointerClick, ArrowRight, Calendar, Linkedin, Instagram, Facebook, Globe, UserX, CalendarCheck } from "lucide-react";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";

export default function FollowUpReports() {
  const { user } = useAuth();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [expandedLead, setExpandedLead] = useState<number | null>(null);

  // Fetch campaigns list
  const { data: campaigns } = trpc.campaigns.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Fetch campaign report when a campaign is selected
  const { data: report, isLoading: reportLoading } = trpc.reports.campaignReport.useQuery(
    Number(selectedCampaignId),
    { enabled: !!selectedCampaignId }
  );

  const getEmailStatusBadge = (status: string) => {
    const config: Record<string, { className: string; label: string }> = {
      draft: { className: "bg-gray-100 text-gray-700 border-gray-200", label: "Draft" },
      scheduled: { className: "bg-amber-50 text-amber-700 border-amber-200", label: "Scheduled" },
      sent: { className: "bg-blue-50 text-blue-700 border-blue-200", label: "Sent" },
      opened: { className: "bg-purple-50 text-purple-700 border-purple-200", label: "Opened" },
      clicked: { className: "bg-green-50 text-green-700 border-green-200", label: "Clicked" },
      failed: { className: "bg-red-50 text-red-700 border-red-200", label: "Failed" },
    };
    const c = config[status] || { className: "bg-gray-100 text-gray-700", label: status };
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const getCallStatusBadge = (status: string) => {
    const config: Record<string, { className: string; label: string }> = {
      scheduled: { className: "bg-amber-50 text-amber-700 border-amber-200", label: "Pending" },
      initiated: { className: "bg-blue-50 text-blue-700 border-blue-200", label: "Initiated" },
      ringing: { className: "bg-blue-50 text-blue-700 border-blue-200", label: "Ringing" },
      in_progress: { className: "bg-purple-50 text-purple-700 border-purple-200", label: "In Progress" },
      completed: { className: "bg-green-50 text-green-700 border-green-200", label: "Completed" },
      failed: { className: "bg-red-50 text-red-700 border-red-200", label: "Failed/Cancelled" },
      no_answer: { className: "bg-orange-50 text-orange-700 border-orange-200", label: "No Answer" },
      voicemail: { className: "bg-yellow-50 text-yellow-700 border-yellow-200", label: "Voicemail" },
    };
    const c = config[status] || { className: "bg-gray-100 text-gray-700", label: status };
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const formatDate = (date: any) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Complete overview of all emails sent, opened, clicked, follow-ups done and pending, and all calls made
        </p>
      </div>

      {/* Campaign Selector */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Select Campaign</CardTitle>
          <CardDescription>Choose a campaign to view its full report</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="w-full md:w-80">
              <SelectValue placeholder="Choose a campaign..." />
            </SelectTrigger>
            <SelectContent>
              {campaigns?.map((campaign: any) => (
                <SelectItem key={campaign.id} value={String(campaign.id)}>
                  {campaign.name} ({campaign.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Loading State */}
      {reportLoading && selectedCampaignId && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-muted-foreground">Loading report...</span>
        </div>
      )}

      {/* Report Content */}
      {report && (
        <>
          {/* Campaign Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3 mb-3">
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-muted-foreground">Emails Sent</span>
                </div>
                <div className="text-2xl font-bold">{report.summary.totalEmailsSent}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">Opened</span>
                </div>
                <div className="text-2xl font-bold">{report.summary.totalEmailsOpened}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <MousePointerClick className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-medium text-muted-foreground">Clicked</span>
                </div>
                <div className="text-2xl font-bold">{report.summary.totalEmailsClicked}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground">Emails Pending</span>
                </div>
                <div className="text-2xl font-bold">{report.summary.totalEmailsPending}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Phone className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-medium text-muted-foreground">Calls Made</span>
                </div>
                <div className="text-2xl font-bold">{report.summary.totalCallsMade}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium text-muted-foreground">Calls Pending</span>
                </div>
                <div className="text-2xl font-bold">{report.summary.totalCallsPending}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-muted-foreground">Total Leads</span>
                </div>
                <div className="text-2xl font-bold">{report.summary.totalLeads}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-muted-foreground">Replied</span>
                </div>
                <div className="text-2xl font-bold text-emerald-600">{(report.summary as any).totalReplied || 0}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarCheck className="w-4 h-4 text-teal-600" />
                  <span className="text-xs font-medium text-muted-foreground">Meetings Booked</span>
                </div>
                <div className="text-2xl font-bold text-teal-600">{(report.summary as any).totalMeetingsBooked || 0}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-muted-foreground">Bounced</span>
                </div>
                <div className="text-2xl font-bold text-red-600">{(report.summary as any).totalBounced || 0}</div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <UserX className="w-4 h-4 text-gray-500" />
                  <span className="text-xs font-medium text-muted-foreground">Unsubscribed</span>
                </div>
                <div className="text-2xl font-bold text-gray-600">{(report.summary as any).totalUnsubscribed || 0}</div>
              </CardContent>
            </Card>
          </div>

          {/* Social Outreach Stats */}
          {(report.summary as any).socialOutreach && (report.summary as any).socialOutreach.totalSent > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <Card className="border-blue-200 shadow-sm bg-blue-50/30">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-medium text-muted-foreground">Social Outreach Sent</span>
                  </div>
                  <div className="text-2xl font-bold">{(report.summary as any).socialOutreach.totalSent}</div>
                </CardContent>
              </Card>
              <Card className="border-green-200 shadow-sm bg-green-50/30">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-medium text-muted-foreground">Accepted</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">{(report.summary as any).socialOutreach.totalAccepted}</div>
                </CardContent>
              </Card>
              <Card className="border-amber-200 shadow-sm bg-amber-50/30">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-medium text-muted-foreground">Pending</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-600">{(report.summary as any).socialOutreach.totalPending}</div>
                </CardContent>
              </Card>
              <Card className="border-gray-200 shadow-sm">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-muted-foreground">By Platform</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs">
                      <Linkedin className="w-3 h-3 text-blue-600" />
                      {(report.summary as any).socialOutreach.byPlatform.linkedin.sent}
                    </span>
                    <span className="flex items-center gap-1 text-xs">
                      <Instagram className="w-3 h-3 text-pink-600" />
                      {(report.summary as any).socialOutreach.byPlatform.instagram.sent}
                    </span>
                    <span className="flex items-center gap-1 text-xs">
                      <Facebook className="w-3 h-3 text-blue-700" />
                      {(report.summary as any).socialOutreach.byPlatform.facebook.sent}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Detailed Tabs */}
          <Tabs defaultValue="all-emails" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all-emails">All Emails</TabsTrigger>
              <TabsTrigger value="follow-up-emails">Follow-Up Emails</TabsTrigger>
              <TabsTrigger value="all-calls">All Calls</TabsTrigger>
              <TabsTrigger value="per-lead">Per Lead Timeline</TabsTrigger>
            </TabsList>

            {/* ALL EMAILS TAB */}
            <TabsContent value="all-emails">
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">All Emails Sent</CardTitle>
                  <CardDescription>
                    Complete list of initial and follow-up emails with their current status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold">Lead</TableHead>
                          <TableHead className="font-semibold">Company</TableHead>
                          <TableHead className="font-semibold">Email Type</TableHead>
                          <TableHead className="font-semibold">Subject</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="font-semibold">Sent Date</TableHead>
                          <TableHead className="font-semibold">Opened</TableHead>
                          <TableHead className="font-semibold">Clicked</TableHead>
                          <TableHead className="font-semibold text-center">Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.leads.map((lead: any) => (
                          <>
                            {/* Initial Email */}
                            <TableRow key={`initial-${lead.leadId}`} className="border-b">
                              <TableCell className="font-medium">{lead.leadName}</TableCell>
                              <TableCell>{lead.companyName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  Initial
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{lead.initialEmail.subject || "Campaign email"}</TableCell>
                              <TableCell>
                                {lead.initialEmail.sent
                                  ? getEmailStatusBadge(lead.initialEmail.clicked ? "clicked" : lead.initialEmail.opened ? "opened" : "sent")
                                  : getEmailStatusBadge("draft")}
                              </TableCell>
                              <TableCell className="text-sm">{formatDate(lead.initialEmail.sentAt)}</TableCell>
                              <TableCell className="text-sm">{formatDate(lead.initialEmail.openedAt)}</TableCell>
                              <TableCell className="text-sm">{formatDate(lead.initialEmail.clickedAt)}</TableCell>
                              <TableCell className="text-center">
                                {lead.initialEmail.emailBody && (
                                  <EmailPreviewDialog
                                    subject={lead.initialEmail.subject || "(No subject)"}
                                    body={lead.initialEmail.emailBody}
                                    recipientName={lead.leadName}
                                    recipientEmail={lead.email}
                                    recipientCompany={lead.companyName}
                                    senderEmail={lead.initialEmail.senderEmail || undefined}
                                    trigger={
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                        <Eye className="w-4 h-4 text-muted-foreground" />
                                      </Button>
                                    }
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                            {/* Follow-up Emails */}
                            {lead.followUpEmails.map((email: any) => (
                              <TableRow key={`followup-email-${email.id}`} className="bg-gray-50/50">
                                <TableCell className="pl-8 font-medium text-muted-foreground">↳ {lead.leadName}</TableCell>
                                <TableCell className="text-muted-foreground">{lead.companyName}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                    Follow-up #{email.sequenceNumber}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm max-w-[200px] truncate">{email.subject || "—"}</TableCell>
                                <TableCell>{getEmailStatusBadge(email.status)}</TableCell>
                                <TableCell className="text-sm">{formatDate(email.sentAt)}</TableCell>
                                <TableCell className="text-sm">{formatDate(email.openedAt)}</TableCell>
                                <TableCell className="text-sm">{formatDate(email.clickedAt)}</TableCell>
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
                            ))}
                          </>
                        ))}
                        {report.leads.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                              No emails sent yet for this campaign
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* FOLLOW-UP EMAILS TAB */}
            <TabsContent value="follow-up-emails">
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Follow-Up Emails: Done vs Pending</CardTitle>
                  <CardDescription>
                    Track which follow-up emails have been sent and which are still scheduled
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold">Lead</TableHead>
                          <TableHead className="font-semibold">Company</TableHead>
                          <TableHead className="font-semibold">Emails Done</TableHead>
                          <TableHead className="font-semibold">Emails Pending</TableHead>
                          <TableHead className="font-semibold">Emails Failed</TableHead>
                          <TableHead className="font-semibold">Cancelled (Replied/Answered)</TableHead>
                          <TableHead className="font-semibold">Next Email Due</TableHead>
                          <TableHead className="font-semibold">Progress</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.leads.map((lead: any) => {
                          const nextPending = lead.followUpEmails
                            .filter((e: any) => e.status === "scheduled")
                            .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0];
                          const total = lead.summary.totalFollowUpEmails || 7;
                          const done = lead.summary.emailsSent;
                          const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

                          return (
                            <TableRow key={`fu-email-${lead.leadId}`}>
                              <TableCell className="font-medium">{lead.leadName}</TableCell>
                              <TableCell>{lead.companyName}</TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  <span className="font-semibold text-green-700">{lead.summary.emailsSent}</span>
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-4 h-4 text-amber-500" />
                                  <span className="font-semibold text-amber-700">{lead.summary.emailsPending}</span>
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1">
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                  <span className="font-semibold text-red-700">{lead.summary.emailsFailed}</span>
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle className="w-4 h-4 text-blue-500" />
                                  <span className="font-semibold text-blue-700">{lead.summary.emailsCancelled ?? 0}</span>
                                </span>
                              </TableCell>
                              <TableCell className="text-sm">
                                {nextPending ? formatDate(nextPending.scheduledFor) : "All sent"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-green-500 rounded-full transition-all"
                                      style={{ width: `${progressPct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground">{done}/{total}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {report.leads.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No follow-up emails scheduled yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ALL CALLS TAB */}
            <TabsContent value="all-calls">
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">All Calls: Made vs Pending</CardTitle>
                  <CardDescription>
                    Complete view of all call attempts — initial triggers and scheduled follow-ups
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold">Lead</TableHead>
                          <TableHead className="font-semibold">Company</TableHead>
                          <TableHead className="font-semibold">Phone</TableHead>
                          <TableHead className="font-semibold">Attempt</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="font-semibold">Scheduled For</TableHead>
                          <TableHead className="font-semibold">Called At</TableHead>
                          <TableHead className="font-semibold">Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.leads.map((lead: any) => (
                          <>
                            {/* Initial call */}
                            {lead.initialCall.triggered && (
                              <TableRow key={`initial-call-${lead.leadId}`}>
                                <TableCell className="font-medium">{lead.leadName}</TableCell>
                                <TableCell>{lead.companyName}</TableCell>
                                <TableCell className="text-sm font-mono">{lead.phone}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    Initial
                                  </Badge>
                                </TableCell>
                                <TableCell>{getCallStatusBadge(lead.initialCall.status || "initiated")}</TableCell>
                                <TableCell className="text-sm">On email engagement</TableCell>
                                <TableCell className="text-sm">{formatDate(lead.initialCall.triggeredAt)}</TableCell>
                                <TableCell className="text-sm">{lead.initialCall.duration ? `${lead.initialCall.duration}s` : "—"}</TableCell>
                              </TableRow>
                            )}
                            {/* Follow-up calls */}
                            {lead.followUpCalls.map((call: any) => (
                              <TableRow key={`call-${call.id}`} className={call.status === "scheduled" ? "bg-amber-50/30" : ""}>
                                <TableCell className="pl-8 font-medium text-muted-foreground">↳ {lead.leadName}</TableCell>
                                <TableCell className="text-muted-foreground">{lead.companyName}</TableCell>
                                <TableCell className="text-sm font-mono">{lead.phone}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                    Attempt #{call.attemptNumber}
                                  </Badge>
                                </TableCell>
                                <TableCell>{getCallStatusBadge(call.status)}</TableCell>
                                <TableCell className="text-sm">{formatDate(call.scheduledFor)}</TableCell>
                                <TableCell className="text-sm">{formatDate(call.initiatedAt)}</TableCell>
                                <TableCell className="text-sm">{call.duration ? `${call.duration}s` : "—"}</TableCell>
                              </TableRow>
                            ))}
                            {/* Show summary if no calls at all */}
                            {!lead.initialCall.triggered && lead.followUpCalls.length === 0 && (
                              <TableRow key={`no-call-${lead.leadId}`}>
                                <TableCell className="font-medium">{lead.leadName}</TableCell>
                                <TableCell>{lead.companyName}</TableCell>
                                <TableCell className="text-sm font-mono">{lead.phone}</TableCell>
                                <TableCell colSpan={5} className="text-sm text-muted-foreground italic">
                                  No calls triggered yet — waiting for email engagement
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        ))}
                        {report.leads.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No calls made yet for this campaign
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* PER LEAD TIMELINE TAB */}
            <TabsContent value="per-lead">
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Per-Lead Activity Timeline</CardTitle>
                  <CardDescription>
                    Click on a lead to see their complete engagement history
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {report.leads.map((lead: any) => (
                      <div key={`timeline-${lead.leadId}`} className="border rounded-lg overflow-hidden">
                        {/* Lead Header - Clickable */}
                        <button
                          onClick={() => setExpandedLead(expandedLead === lead.leadId ? null : lead.leadId)}
                          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-700 font-semibold text-sm">
                                {lead.leadName?.charAt(0)?.toUpperCase() || "?"}
                              </span>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{lead.leadName}</p>
                              <p className="text-sm text-muted-foreground">{lead.companyName} • {lead.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 text-sm">
                              <Mail className="w-3.5 h-3.5 text-blue-500" />
                              <span className="text-green-600 font-medium">{lead.summary.emailsSent}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-amber-600 font-medium">{lead.summary.emailsPending}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="w-3.5 h-3.5 text-indigo-500" />
                              <span className="text-green-600 font-medium">{lead.summary.callsMade}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-amber-600 font-medium">{lead.summary.callsPending}</span>
                            </div>
                            <ArrowRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedLead === lead.leadId ? "rotate-90" : ""}`} />
                          </div>
                        </button>

                        {/* Expanded Timeline */}
                        {expandedLead === lead.leadId && (
                          <div className="border-t bg-gray-50/50 p-4">
                            <div className="relative pl-6 space-y-4">
                              {/* Timeline line */}
                              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-200" />

                              {/* Initial Email */}
                              <div className="relative">
                                <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 ${lead.initialEmail.sent ? "bg-blue-500 border-blue-500" : "bg-white border-gray-300"}`} />
                                <div className="ml-2">
                                  <p className="text-sm font-medium">Initial Email Sent</p>
                                  <p className="text-xs text-muted-foreground">{formatDate(lead.initialEmail.sentAt)}</p>
                                  {lead.initialEmail.opened && (
                                    <p className="text-xs text-purple-600 mt-0.5">Opened: {formatDate(lead.initialEmail.openedAt)}</p>
                                  )}
                                  {(() => {
                                    const clickEvents = (lead.trackingEvents || []).filter((t: any) => t.type === "click");
                                    if (clickEvents.length > 0) {
                                      return clickEvents.map((evt: any, idx: number) => (
                                        <p key={idx} className="text-xs text-green-600 mt-0.5">
                                          Clicked{evt.clickUrl ? `: ${evt.clickUrl}` : ""} ({formatDate(evt.occurredAt)})
                                        </p>
                                      ));
                                    }
                                    if (lead.initialEmail.clicked) {
                                      return <p className="text-xs text-green-600 mt-0.5">Clicked: {formatDate(lead.initialEmail.clickedAt)}</p>;
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>

                              {/* Initial Call */}
                              {lead.initialCall.triggered && (
                                <div className="relative">
                                  <div className="absolute -left-4 top-1 w-3 h-3 rounded-full border-2 bg-indigo-500 border-indigo-500" />
                                  <div className="ml-2">
                                    <p className="text-sm font-medium">Initial Call Triggered</p>
                                    <p className="text-xs text-muted-foreground">{formatDate(lead.initialCall.triggeredAt)}</p>
                                  </div>
                                </div>
                              )}

                              {/* Follow-up Emails */}
                              {lead.followUpEmails.map((email: any) => (
                                <div key={`tl-email-${email.id}`} className="relative">
                                  <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 ${
                                    email.status === "sent" || email.status === "opened" || email.status === "clicked"
                                      ? "bg-green-500 border-green-500"
                                      : email.status === "scheduled"
                                      ? "bg-amber-400 border-amber-400"
                                      : "bg-white border-gray-300"
                                  }`} />
                                  <div className="ml-2">
                                    <p className="text-sm font-medium">
                                      Follow-up Email #{email.sequenceNumber}
                                      <span className="ml-2 text-xs text-muted-foreground">({email.emailType})</span>
                                    </p>
                                    {email.status === "scheduled" ? (
                                      <p className="text-xs text-amber-600">Scheduled: {formatDate(email.scheduledFor)}</p>
                                    ) : (
                                      <>
                                        <p className="text-xs text-muted-foreground">Sent: {formatDate(email.sentAt)}</p>
                                        {email.openedAt && <p className="text-xs text-purple-600">Opened: {formatDate(email.openedAt)}</p>}
                                        {email.clickedAt && <p className="text-xs text-green-600">Clicked: {formatDate(email.clickedAt)}</p>}
                                      </>
                                    )}
                                    <div className="mt-0.5">{getEmailStatusBadge(email.status)}</div>
                                  </div>
                                </div>
                              ))}

                              {/* Follow-up Calls */}
                              {lead.followUpCalls.map((call: any) => (
                                <div key={`tl-call-${call.id}`} className="relative">
                                  <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 ${
                                    call.status === "completed" ? "bg-green-500 border-green-500"
                                      : call.status === "scheduled" ? "bg-amber-400 border-amber-400"
                                      : call.status === "no_answer" || call.status === "voicemail" ? "bg-orange-400 border-orange-400"
                                      : "bg-red-400 border-red-400"
                                  }`} />
                                  <div className="ml-2">
                                    <p className="text-sm font-medium">
                                      Follow-up Call #{call.attemptNumber}
                                    </p>
                                    {call.status === "scheduled" ? (
                                      <p className="text-xs text-amber-600">Scheduled: {formatDate(call.scheduledFor)}</p>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">Called: {formatDate(call.initiatedAt)}</p>
                                    )}
                                    {call.duration && <p className="text-xs text-muted-foreground">Duration: {call.duration}s</p>}
                                    <div className="mt-0.5">{getCallStatusBadge(call.status)}</div>
                                  </div>
                                </div>
                              ))}

                              {/* No activity */}
                              {!lead.initialEmail.sent && lead.followUpEmails.length === 0 && lead.followUpCalls.length === 0 && (
                                <div className="relative">
                                  <div className="absolute -left-4 top-1 w-3 h-3 rounded-full border-2 bg-white border-gray-300" />
                                  <div className="ml-2">
                                    <p className="text-sm text-muted-foreground italic">No activity yet</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {report.leads.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No leads in this campaign yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Empty State */}
      {!selectedCampaignId && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <TrendingUp className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Campaign</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Choose a campaign above to see the full report — all emails sent, opened, clicked, follow-ups done and pending, and all calls made with their status.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
