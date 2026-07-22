import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2, Mail, MousePointerClick, Phone, PhoneCall, PhoneOff, PhoneMissed,
  Calendar, Clock, MessageSquare, AlertTriangle, Eye, ChevronDown, ChevronRight,
  ExternalLink, CalendarCheck, Ban, Reply,
} from "lucide-react";
import { toast } from "sonner";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";

interface ActivityFeedProps {
  campaignId: number;
}

export function ActivityFeed({ campaignId }: ActivityFeedProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const [expandedLead, setExpandedLead] = useState<number | null>(null);

  const activityQuery = trpc.campaigns.activity.useQuery(campaignId, {
    enabled: true,
  });

  const markReplied = trpc.responses.markReplied.useMutation({
    onSuccess: () => {
      toast.success("Lead marked as replied — follow-ups cancelled");
      activityQuery.refetch();
    },
    onError: () => toast.error("Failed to mark as replied"),
  });

  // Poll for updates every 5 seconds
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(() => {
      activityQuery.refetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [isPolling, activityQuery]);

  useEffect(() => {
    if (activityQuery.data) {
      setActivities(activityQuery.data);
    }
  }, [activityQuery.data]);

  const getCallStatusBadge = (activity: any) => {
    if (!activity.callTriggered) {
      return <span className="text-xs text-muted-foreground">&mdash;</span>;
    }
    const status = activity.callStatus;
    const config: Record<string, { className: string; icon: ReactNode; label: string }> = {
      completed: { className: "bg-green-100 text-green-800 border-green-200", icon: <PhoneCall className="w-3 h-3" />, label: "Completed" },
      in_progress: { className: "bg-blue-100 text-blue-800 border-blue-200", icon: <PhoneCall className="w-3 h-3" />, label: "On Call" },
      failed: { className: "bg-red-100 text-red-800 border-red-200", icon: <PhoneOff className="w-3 h-3" />, label: "Failed" },
      no_answer: { className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <PhoneMissed className="w-3 h-3" />, label: "No Answer" },
      initiated: { className: "bg-orange-100 text-orange-800 border-orange-200", icon: <Phone className="w-3 h-3" />, label: "Initiated" },
    };
    const c = config[status] || { className: "bg-orange-100 text-orange-800 border-orange-200", icon: <Phone className="w-3 h-3" />, label: "Triggered" };
    return (
      <Badge className={`text-xs gap-1 ${c.className}`}>
        {c.icon} {c.label}
      </Badge>
    );
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "—";
    const d = new Date(date);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatScheduleDate = (date: Date | string | null) => {
    if (!date) return "Not scheduled";
    const d = new Date(date);
    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Activity Feed</CardTitle>
          <CardDescription>Opens, clicks, calls, and replies for every lead in this campaign</CardDescription>
        </div>
        <button
          onClick={() => setIsPolling(!isPolling)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isPolling ? "⏸ Pause" : "▶ Resume"}
        </button>
      </CardHeader>
      <CardContent>
        {activityQuery.isError ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-foreground font-medium">Couldn't load activity</p>
            <p className="text-xs text-muted-foreground mt-1">
              {activityQuery.error?.message || "Something went wrong fetching this campaign's activity."}
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => activityQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : activityQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : activities && activities.length > 0 ? (
          <div className="overflow-x-auto max-h-[800px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="font-semibold">Lead</TableHead>
                  <TableHead className="font-semibold">Sent</TableHead>
                  <TableHead className="font-semibold text-center">Opens</TableHead>
                  <TableHead className="font-semibold text-center">Clicks</TableHead>
                  <TableHead className="font-semibold text-center">Calls</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-center">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity, idx) => (
                  <>
                    <TableRow
                      key={idx}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedLead(expandedLead === idx ? null : idx)}
                    >
                      <TableCell className="text-muted-foreground">
                        {expandedLead === idx ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{activity.leadName}</p>
                        <p className="text-xs text-muted-foreground">{activity.companyName}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {activity.emailSent ? formatTime(activity.emailSentAt) : "Not sent"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-semibold ${activity.openCount > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {activity.openCount || 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {activity.clickCount > 0 ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-semibold text-purple-600 underline decoration-dotted cursor-help">
                                  {activity.clickCount}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs font-medium mb-1">Clicked links:</p>
                                {(activity.clickBreakdown || []).map((c: any, i: number) => (
                                  <p key={i} className="text-xs truncate max-w-[260px]">
                                    {c.count}&times; &mdash; {c.url}
                                  </p>
                                ))}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="font-semibold text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-semibold ${activity.totalCalls > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                          {activity.totalCalls || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {activity.unsubscribed && (
                            <Badge className="bg-red-50 text-red-700 border-red-200 text-xs gap-1"><Ban className="w-3 h-3" /> Unsubscribed</Badge>
                          )}
                          {activity.meetingBooked && (
                            <Badge className="bg-teal-50 text-teal-700 border-teal-200 text-xs gap-1"><CalendarCheck className="w-3 h-3" /> Meeting Booked</Badge>
                          )}
                          {activity.replied && !activity.meetingBooked && (
                            <Badge className={`text-xs gap-1 ${
                              activity.responseStatus === 'positive' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                              activity.responseStatus === 'negative' ? 'bg-red-100 text-red-800 border-red-200' :
                              'bg-gray-100 text-gray-800 border-gray-200'
                            }`}>
                              <Reply className="w-3 h-3" /> Replied
                            </Badge>
                          )}
                          {!activity.unsubscribed && !activity.meetingBooked && !activity.replied && (
                            <span className="text-xs text-muted-foreground">&mdash;</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {activity.emailSent && activity.emailBody && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <EmailPreviewDialog
                              subject={activity.emailSubject || "(No subject)"}
                              body={activity.emailBody}
                              recipientName={activity.leadName}
                              recipientEmail={activity.email}
                              recipientCompany={activity.companyName}
                              trigger={
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  <Eye className="w-4 h-4 text-muted-foreground" />
                                </Button>
                              }
                            />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>

                    {expandedLead === idx && (
                      <TableRow key={`${idx}-expanded`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={8} className="p-4">
                          <div className="space-y-4">
                            {/* Contact info */}
                            <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {activity.email}</span>
                              <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {activity.phoneNumber}</span>
                              {activity.industry && <Badge variant="outline" className="text-xs">{activity.industry}</Badge>}
                            </div>

                            {/* Calls + recordings */}
                            {activity.callLogs && activity.callLogs.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                  <PhoneCall className="w-4 h-4 text-orange-500" /> Calls
                                </h4>
                                <div className="space-y-2">
                                  {activity.callLogs.map((call: any) => (
                                    <div key={call.id} className="p-2.5 rounded-lg border border-border bg-background">
                                      <div className="flex items-center gap-2 flex-wrap text-xs">
                                        {getCallStatusBadge({ callTriggered: true, callStatus: call.status })}
                                        <span className="text-muted-foreground capitalize">{call.triggerType?.replace("_", " ")}</span>
                                        <span className="text-muted-foreground">{formatTime(call.createdAt)}</span>
                                        {call.duration != null && (
                                          <span className="text-muted-foreground">{Math.floor(call.duration / 60)}m {call.duration % 60}s</span>
                                        )}
                                        {call.endReason && (
                                          <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground">
                                            {call.endReason === "user_hangup" ? "Customer hung up" :
                                             call.endReason === "agent_hangup" ? "Agent ended call" :
                                             call.endReason.replace(/_/g, " ")}
                                          </Badge>
                                        )}
                                      </div>
                                      {call.recordingUrl ? (
                                        <audio controls preload="none" className="w-full h-9 mt-2" src={call.recordingUrl} onClick={(e) => e.stopPropagation()} />
                                      ) : (
                                        <p className="text-xs text-muted-foreground mt-1 italic">
                                          {call.status === "completed" ? "Recording not yet available" : "No recording (call did not connect)"}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Clicked links */}
                            {activity.clickBreakdown && activity.clickBreakdown.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                  <MousePointerClick className="w-4 h-4 text-purple-500" /> Clicked Links
                                </h4>
                                <div className="space-y-1 ml-1">
                                  {activity.clickBreakdown.map((c: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      <Badge variant="outline" className="text-xs">{c.count}&times;</Badge>
                                      <ExternalLink className="w-3 h-3 text-blue-600 shrink-0" />
                                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-[400px]">
                                        {c.url}
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Manual override for response status */}
                            {!activity.replied && !activity.unsubscribed && activity.emailSent && (
                              <div>
                                <p className="text-[10px] text-muted-foreground italic mb-1">Manual override (auto-detected via Calendly booking or email reply):</p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markReplied.mutate({ campaignLeadId: activity.campaignLeadId, responseStatus: "positive" });
                                    }}
                                    disabled={markReplied.isPending}
                                  >
                                    <MessageSquare className="w-3 h-3" /> Mark Positive (Override)
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1 border-red-200 text-red-700 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markReplied.mutate({ campaignLeadId: activity.campaignLeadId, responseStatus: "negative" });
                                    }}
                                    disabled={markReplied.isPending}
                                  >
                                    <MessageSquare className="w-3 h-3" /> Mark Negative
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Next Follow-Up Emails */}
                            <div>
                              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                <Calendar className="w-4 h-4 text-blue-500" /> Next Follow-Up Emails
                              </h4>
                              {activity.nextFollowUpEmails && activity.nextFollowUpEmails.length > 0 ? (
                                <div className="space-y-1.5 ml-1">
                                  {activity.nextFollowUpEmails.map((email: any, emailIdx: number) => (
                                    <div key={emailIdx} className="flex items-center gap-2 text-xs">
                                      <Badge variant="outline" className="text-xs min-w-[24px] justify-center">#{email.sequenceNumber}</Badge>
                                      <span className="text-muted-foreground capitalize">{email.emailType?.replace("_", " ")}</span>
                                      <span className="text-xs font-medium flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> {formatScheduleDate(email.scheduledFor)}
                                      </span>
                                      <Badge variant="outline" className={`text-xs ${email.status === 'scheduled' ? 'border-blue-200 text-blue-700' : 'border-gray-200'}`}>
                                        {email.status}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground ml-1">No follow-up emails scheduled</p>
                              )}
                            </div>

                            {/* Next Follow-Up Calls */}
                            <div>
                              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                <Phone className="w-4 h-4 text-orange-500" /> Next Follow-Up Calls
                              </h4>
                              {activity.nextFollowUpCalls && activity.nextFollowUpCalls.length > 0 ? (
                                <div className="space-y-1.5 ml-1">
                                  {activity.nextFollowUpCalls.map((call: any, callIdx: number) => (
                                    <div key={callIdx} className="flex items-center gap-2 text-xs">
                                      <Badge variant="outline" className="text-xs min-w-[24px] justify-center">#{call.attemptNumber}</Badge>
                                      <span className="text-muted-foreground">{call.phoneNumber}</span>
                                      <span className="text-xs font-medium flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> {formatScheduleDate(call.scheduledFor)}
                                      </span>
                                      <Badge variant="outline" className={`text-xs ${call.status === 'scheduled' ? 'border-orange-200 text-orange-700' : 'border-gray-200'}`}>
                                        {call.status}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground ml-1">No follow-up calls scheduled</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground mt-1">Activity will appear here once the campaign is launched</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
