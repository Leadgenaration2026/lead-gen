import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Mail,
  MailOpen,
  MousePointerClick,
  Phone,
  PhoneCall,
  PhoneOff,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  User,
  Building2,
  Globe,
  CalendarClock,
  MailWarning,
  Reply,
  Ban,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect } from "react";

type TimelineEvent = {
  type: "email_sent" | "email_opened" | "email_clicked" | "call_triggered" | "call_completed" | "call_failed" | "call_no_answer" | "replied" | "unsubscribed" | "follow_up_email" | "follow_up_call";
  timestamp: Date | string | null;
  label: string;
  detail?: string;
  status?: "success" | "warning" | "error" | "neutral" | "pending";
};

function buildTimeline(lead: any): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Initial email sent
  if (lead.initialEmail.sent) {
    events.push({
      type: "email_sent",
      timestamp: lead.initialEmail.sentAt,
      label: "Email Sent",
      detail: `Initial outreach email delivered to ${lead.email}`,
      status: "success",
    });
  }

  // Email opened
  if (lead.initialEmail.opened) {
    events.push({
      type: "email_opened",
      timestamp: lead.initialEmail.openedAt,
      label: "Email Opened",
      detail: "Lead opened the email",
      status: "success",
    });
  }

  // Email clicked
  if (lead.initialEmail.clicked) {
    events.push({
      type: "email_clicked",
      timestamp: lead.initialEmail.clickedAt,
      label: "Link Clicked",
      detail: "Lead clicked a link in the email",
      status: "success",
    });
  }

  // Call triggered
  if (lead.initialCall.triggered) {
    events.push({
      type: "call_triggered",
      timestamp: lead.initialCall.triggeredAt,
      label: "Call Triggered",
      detail: `Retell.AI call initiated (Status: ${lead.initialCall.status})`,
      status: lead.initialCall.status === "completed" ? "success" :
              lead.initialCall.status === "failed" ? "error" :
              lead.initialCall.status === "no_answer" ? "warning" : "neutral",
    });
  }

  // Call completed/failed
  if (lead.initialCall.status === "completed") {
    events.push({
      type: "call_completed",
      timestamp: lead.initialCall.triggeredAt,
      label: "Call Completed",
      detail: lead.initialCall.duration ? `Duration: ${Math.floor(lead.initialCall.duration / 60)}m ${lead.initialCall.duration % 60}s` : "Call answered and completed",
      status: "success",
    });
  } else if (lead.initialCall.status === "failed") {
    events.push({
      type: "call_failed",
      timestamp: lead.initialCall.triggeredAt,
      label: "Call Failed",
      detail: "Call could not be connected",
      status: "error",
    });
  } else if (lead.initialCall.status === "no_answer") {
    events.push({
      type: "call_no_answer",
      timestamp: lead.initialCall.triggeredAt,
      label: "No Answer",
      detail: "Lead did not answer the call",
      status: "warning",
    });
  }

  // Follow-up emails
  if (lead.followUpEmails && lead.followUpEmails.length > 0) {
    for (const fu of lead.followUpEmails) {
      const isCompleted = fu.status === "sent" || fu.status === "opened" || fu.status === "clicked";
      events.push({
        type: "follow_up_email",
        timestamp: fu.sentAt || fu.scheduledFor,
        label: `Follow-up Email #${fu.sequenceNumber}`,
        detail: `${fu.emailType || "follow_up"} — ${fu.subject || "No subject"} (${fu.status})`,
        status: isCompleted ? "success" : fu.status === "failed" ? "error" : "pending",
      });
    }
  }

  // Follow-up calls
  if (lead.followUpCalls && lead.followUpCalls.length > 0) {
    for (const fc of lead.followUpCalls) {
      const isCompleted = fc.status === "completed" || fc.status === "in_progress";
      events.push({
        type: "follow_up_call",
        timestamp: fc.initiatedAt || fc.scheduledFor,
        label: `Follow-up Call #${fc.attemptNumber}`,
        detail: `${fc.status}${fc.duration ? ` — ${Math.floor(fc.duration / 60)}m ${fc.duration % 60}s` : ""}`,
        status: isCompleted ? "success" : fc.status === "failed" || fc.status === "no_answer" ? "warning" : "pending",
      });
    }
  }

  // Sort by timestamp (nulls at end)
  events.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  return events;
}

function getEventIcon(type: TimelineEvent["type"]) {
  switch (type) {
    case "email_sent": return <Send className="w-4 h-4" />;
    case "email_opened": return <MailOpen className="w-4 h-4" />;
    case "email_clicked": return <MousePointerClick className="w-4 h-4" />;
    case "call_triggered": return <Phone className="w-4 h-4" />;
    case "call_completed": return <PhoneCall className="w-4 h-4" />;
    case "call_failed": return <PhoneOff className="w-4 h-4" />;
    case "call_no_answer": return <PhoneOff className="w-4 h-4" />;
    case "replied": return <Reply className="w-4 h-4" />;
    case "unsubscribed": return <Ban className="w-4 h-4" />;
    case "follow_up_email": return <Mail className="w-4 h-4" />;
    case "follow_up_call": return <Phone className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

function getStatusColor(status?: TimelineEvent["status"]) {
  switch (status) {
    case "success": return "bg-green-500 text-white";
    case "warning": return "bg-amber-500 text-white";
    case "error": return "bg-red-500 text-white";
    case "pending": return "bg-blue-400 text-white";
    default: return "bg-gray-400 text-white";
  }
}

function getStatusBorderColor(status?: TimelineEvent["status"]) {
  switch (status) {
    case "success": return "border-green-200 bg-green-50";
    case "warning": return "border-amber-200 bg-amber-50";
    case "error": return "border-red-200 bg-red-50";
    case "pending": return "border-blue-200 bg-blue-50";
    default: return "border-gray-200 bg-gray-50";
  }
}

function formatTimestamp(ts: Date | string | null) {
  if (!ts) return "Pending";
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LeadEngagementCard({ lead, isExpanded, onToggle }: { lead: any; isExpanded: boolean; onToggle: () => void }) {
  const timeline = buildTimeline(lead);
  const engagementScore = (lead.initialEmail.opened ? 1 : 0) + (lead.initialEmail.clicked ? 2 : 0) + (lead.initialCall.status === "completed" ? 3 : 0);

  return (
    <Card className={`transition-all duration-200 ${isExpanded ? "ring-2 ring-primary/20" : "hover:shadow-md"}`}>
      <CardHeader className="cursor-pointer pb-3" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{lead.leadName}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-0.5">
                <Building2 className="w-3 h-3" />
                {lead.companyName}
                {lead.email && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-xs">{lead.email}</span>
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Status badges */}
            {lead.initialEmail.sent && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="gap-1 text-xs border-green-200 text-green-700 bg-green-50">
                      <Send className="w-3 h-3" /> Sent
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Email sent {lead.initialEmail.sentAt ? new Date(lead.initialEmail.sentAt).toLocaleDateString() : ""}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {lead.initialEmail.opened && (
              <Badge variant="outline" className="gap-1 text-xs border-blue-200 text-blue-700 bg-blue-50">
                <MailOpen className="w-3 h-3" /> Opened
              </Badge>
            )}
            {lead.initialEmail.clicked && (
              <Badge variant="outline" className="gap-1 text-xs border-purple-200 text-purple-700 bg-purple-50">
                <MousePointerClick className="w-3 h-3" /> Clicked
              </Badge>
            )}
            {lead.initialCall.triggered && (
              <Badge variant="outline" className={`gap-1 text-xs ${
                lead.initialCall.status === "completed" ? "border-green-200 text-green-700 bg-green-50" :
                lead.initialCall.status === "failed" || lead.initialCall.status === "no_answer" ? "border-red-200 text-red-700 bg-red-50" :
                "border-orange-200 text-orange-700 bg-orange-50"
              }`}>
                <Phone className="w-3 h-3" /> {lead.initialCall.status === "completed" ? "Called" : lead.initialCall.status}
              </Badge>
            )}
            {/* Engagement score indicator */}
            <div className={`w-2 h-2 rounded-full ${
              engagementScore >= 4 ? "bg-green-500" :
              engagementScore >= 2 ? "bg-amber-500" :
              engagementScore >= 1 ? "bg-blue-500" : "bg-gray-300"
            }`} />
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {/* Timeline */}
          <div className="relative pl-6 border-l-2 border-muted ml-4 space-y-4 mt-2">
            {timeline.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">No engagement events yet</div>
            ) : (
              timeline.map((event, idx) => (
                <div key={idx} className="relative">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[calc(1.5rem+5px)] w-6 h-6 rounded-full flex items-center justify-center ${getStatusColor(event.status)}`}>
                    {getEventIcon(event.type)}
                  </div>
                  {/* Event content */}
                  <div className={`ml-2 p-3 rounded-lg border ${getStatusBorderColor(event.status)}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{event.label}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    {event.detail && (
                      <p className="text-xs text-muted-foreground mt-1">{event.detail}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Lead contact info */}
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
            {lead.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" /> {lead.phone}
              </span>
            )}
            {lead.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" /> {lead.email}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" /> {lead.companyName}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const campaignId = Number(params.id);
  const [expandedLeadId, setExpandedLeadId] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const campaignQuery = trpc.campaigns.get.useQuery(campaignId, {
    enabled: !!campaignId,
    refetchInterval: isLive ? 10000 : false,
  });
  const reportQuery = trpc.reports.campaignReport.useQuery(campaignId, {
    enabled: !!campaignId,
    refetchInterval: isLive ? 10000 : false,
  });

  // Update last refreshed timestamp when data changes
  useEffect(() => {
    if (reportQuery.dataUpdatedAt) {
      setLastRefreshed(new Date(reportQuery.dataUpdatedAt));
    }
  }, [reportQuery.dataUpdatedAt]);

  if (!campaignId || isNaN(campaignId)) {
    return (
      <div className="container py-8">
        <p className="text-muted-foreground">Invalid campaign ID</p>
      </div>
    );
  }

  const campaign = campaignQuery.data;
  const report = reportQuery.data;

  return (
    <div className="container py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/email-composer")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <button
            onClick={() => setIsLive(!isLive)}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all hover:bg-muted"
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {isLive ? "Live" : "Paused"}
          </button>
          <span className="text-xs text-muted-foreground">
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { reportQuery.refetch(); campaignQuery.refetch(); }}
            disabled={reportQuery.isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reportQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {campaignQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="grid grid-cols-5 gap-4 mt-6">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        </div>
      ) : !campaign ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MailWarning className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">Campaign not found</p>
            <p className="text-muted-foreground mt-1">This campaign may have been deleted.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Campaign header */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <Badge variant={
                campaign.status === "active" ? "default" :
                campaign.status === "completed" ? "secondary" :
                campaign.status === "paused" ? "outline" : "secondary"
              }>
                {campaign.status}
              </Badge>
            </div>
            {campaign.description && (
              <p className="text-muted-foreground mt-1">{campaign.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Created {new Date(campaign.createdAt).toLocaleDateString()}
              {campaign.launchedAt && ` · Launched ${new Date(campaign.launchedAt).toLocaleDateString()}`}
            </p>
          </div>

          {/* Stats overview */}
          {report && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold">{report.summary.totalLeads}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Leads</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold">{report.summary.totalEmailsSent}</p>
                  <p className="text-xs text-muted-foreground mt-1">Emails Sent</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{report.summary.totalEmailsOpened}</p>
                  <p className="text-xs text-muted-foreground mt-1">Opens</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-purple-600">{report.summary.totalEmailsClicked}</p>
                  <p className="text-xs text-muted-foreground mt-1">Clicks</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-orange-600">{report.summary.totalCallsMade}</p>
                  <p className="text-xs text-muted-foreground mt-1">Calls Made</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Engagement funnel */}
          {report && report.summary.totalLeads > 0 && (
            <Card className="mb-8">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Engagement Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Emails Sent", value: report.summary.totalEmailsSent, total: report.summary.totalLeads, color: "bg-blue-500" },
                    { label: "Opened", value: report.summary.totalEmailsOpened, total: report.summary.totalEmailsSent || 1, color: "bg-green-500" },
                    { label: "Clicked", value: report.summary.totalEmailsClicked, total: report.summary.totalEmailsSent || 1, color: "bg-purple-500" },
                    { label: "Calls Made", value: report.summary.totalCallsMade, total: report.summary.totalEmailsClicked || report.summary.totalEmailsOpened || 1, color: "bg-orange-500" },
                  ].map((step) => (
                    <div key={step.label} className="flex items-center gap-3">
                      <span className="text-sm w-24 text-muted-foreground">{step.label}</span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${step.color} rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                          style={{ width: `${Math.max(Math.round((step.value / step.total) * 100), step.value > 0 ? 8 : 0)}%` }}
                        >
                          {step.value > 0 && (
                            <span className="text-xs text-white font-medium">{step.value}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium w-12 text-right">
                        {step.total > 0 ? Math.round((step.value / step.total) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lead timeline cards */}
          <div className="space-y-1 mb-4">
            <h2 className="text-lg font-semibold">Lead Engagement Timeline</h2>
            <p className="text-sm text-muted-foreground">Click on a lead to view their full engagement journey</p>
          </div>

          {reportQuery.isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : report && report.leads.length > 0 ? (
            <div className="space-y-3">
              {report.leads.map((lead: any) => (
                <LeadEngagementCard
                  key={lead.leadId}
                  lead={lead}
                  isExpanded={expandedLeadId === lead.leadId}
                  onToggle={() => setExpandedLeadId(expandedLeadId === lead.leadId ? null : lead.leadId)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No leads in this campaign yet</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
