import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, MousePointerClick, Phone, CheckCircle2, ExternalLink, PhoneCall, PhoneOff, PhoneMissed, Calendar, Clock, MessageSquare, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
      toast.success("Lead marked as replied \u2014 follow-ups cancelled");
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

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "sent":
        return <Mail className="w-4 h-4 text-blue-500" />;
      case "opened":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "clicked":
        return <MousePointerClick className="w-4 h-4 text-purple-500" />;
      case "called":
        return <Phone className="w-4 h-4 text-orange-500" />;
      default:
        return <Mail className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActivityStatus = (activity: any) => {
    if (activity.callTriggered) return "called";
    if (activity.emailClicked) return "clicked";
    if (activity.emailOpened) return "opened";
    if (activity.emailSent) return "sent";
    return "pending";
  };

  const getCallStatusBadge = (activity: any) => {
    if (!activity.callTriggered) return null;
    
    const status = activity.callStatus;
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200 text-xs gap-1">
            <PhoneCall className="w-3 h-3" />
            Call Completed
          </Badge>
        );
      case "in_progress":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs gap-1">
            <PhoneCall className="w-3 h-3" />
            On Call
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 text-xs gap-1">
            <PhoneOff className="w-3 h-3" />
            Call Failed
          </Badge>
        );
      case "no_answer":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs gap-1">
            <PhoneMissed className="w-3 h-3" />
            No Answer
          </Badge>
        );
      case "initiated":
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs gap-1">
            <Phone className="w-3 h-3" />
            Call Initiated
          </Badge>
        );
      default:
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs gap-1">
            <Phone className="w-3 h-3" />
            Call Triggered
          </Badge>
        );
    }
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "";
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
          <CardDescription>Real-time campaign activity with full lead details and schedules</CardDescription>
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
          <div className="space-y-4 max-h-[800px] overflow-y-auto">
            {activities.map((activity, idx) => (
              <div
                key={idx}
                className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setExpandedLead(expandedLead === idx ? null : idx)}
              >
                {/* Header: Lead name + status icon */}
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {getActivityIcon(getActivityStatus(activity))}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Lead Name and Company */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{activity.leadName}</p>
                      <span className="text-xs text-muted-foreground">•</span>
                      <p className="text-sm text-muted-foreground">{activity.companyName}</p>
                      {activity.industry && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <Badge variant="outline" className="text-xs">{activity.industry}</Badge>
                        </>
                      )}
                    </div>

                    {/* Contact Details */}
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {activity.email}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {activity.phoneNumber}
                      </span>
                    </div>

                    {/* Activity Timeline */}
                    <div className="mt-3 space-y-1.5">
                      {activity.emailSent && (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs gap-1">
                            <Mail className="w-3 h-3" />
                            Email Sent
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(activity.emailSentAt)}
                          </span>
                        </div>
                      )}
                      {activity.emailOpened && (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-100 text-green-800 border-green-200 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Email Opened
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(activity.emailOpenedAt)}
                          </span>
                        </div>
                      )}
                      {activity.emailClicked && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs gap-1">
                            <MousePointerClick className="w-3 h-3" />
                            Link Clicked
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(activity.emailClickedAt)}
                          </span>
                        </div>
                      )}
                      {/* Show clicked URLs */}
                      {activity.clickedUrls && activity.clickedUrls.length > 0 && (
                        <div className="ml-6 mt-1">
                          {activity.clickedUrls.map((url: string, urlIdx: number) => (
                            <div key={urlIdx} className="flex items-center gap-1 text-xs text-blue-600">
                              <ExternalLink className="w-3 h-3" />
                              <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-[300px]">
                                {url}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Call Status */}
                      {activity.callTriggered && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {getCallStatusBadge(activity)}
                          <span className="text-xs text-muted-foreground">
                            {formatTime(activity.callTriggeredAt)}
                          </span>
                          {activity.totalCalls > 1 && (
                            <span className="text-xs text-muted-foreground">
                              ({activity.totalCalls} calls total)
                            </span>
                          )}
                        </div>
                      )}
                      {activity.callTriggered && activity.recordingUrl && (
                        <audio
                          controls
                          preload="none"
                          className="w-full h-9 mt-1"
                          src={activity.recordingUrl}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      {/* No call received indicator */}
                      {!activity.callTriggered && activity.emailSent && (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                            <PhoneOff className="w-3 h-3" />
                            No Call Yet
                          </Badge>
                        </div>
                      )}
                      {/* Response Status */}
                      {activity.replied && (
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs gap-1 ${
                            activity.responseStatus === 'positive' 
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : activity.responseStatus === 'negative'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-gray-100 text-gray-800 border-gray-200'
                          }`}>
                            {activity.responseStatus === 'positive' ? '✅' : activity.responseStatus === 'negative' ? '❌' : '➖'}
                            {activity.responseStatus === 'positive' ? 'Positive Response' : activity.responseStatus === 'negative' ? 'Negative Response' : 'Neutral Response'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(activity.repliedAt)}
                          </span>
                        </div>
                      )}
                      {/* Action buttons - Manual admin override for response status */}
                      {!activity.replied && !activity.unsubscribed && activity.emailSent && (
                        <div className="flex flex-col gap-1 mt-2">
                          <p className="text-[10px] text-muted-foreground italic">Manual override (auto-detected via Calendly booking or email reply):</p>
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
                              <MessageSquare className="w-3 h-3" />
                              Mark Positive (Override)
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
                              <MessageSquare className="w-3 h-3" />
                              Mark Negative
                            </Button>
                          </div>
                        </div>
                      )}
                      {/* Unsubscribed indicator */}
                      {activity.unsubscribed && (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-red-50 text-red-700 border-red-200 text-xs gap-1">
                            🚫 Unsubscribed
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(activity.unsubscribedAt)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Expandable: Follow-up Schedule */}
                    {expandedLead === idx && (
                      <div className="mt-4 pt-4 border-t border-border space-y-4">
                        {/* Next 7 Follow-Up Emails */}
                        <div>
                          <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            Next Follow-Up Emails
                          </h4>
                          {activity.nextFollowUpEmails && activity.nextFollowUpEmails.length > 0 ? (
                            <div className="space-y-1.5 ml-6">
                              {activity.nextFollowUpEmails.map((email: any, emailIdx: number) => (
                                <div key={emailIdx} className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="text-xs min-w-[24px] justify-center">
                                    #{email.sequenceNumber}
                                  </Badge>
                                  <span className="text-muted-foreground capitalize">
                                    {email.emailType?.replace("_", " ")}
                                  </span>
                                  <span className="text-xs font-medium flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatScheduleDate(email.scheduledFor)}
                                  </span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${email.status === 'scheduled' ? 'border-blue-200 text-blue-700' : 'border-gray-200'}`}
                                  >
                                    {email.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground ml-6">No follow-up emails scheduled</p>
                          )}
                        </div>

                        {/* Next 7 Follow-Up Calls */}
                        <div>
                          <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                            <Phone className="w-4 h-4 text-orange-500" />
                            Next Follow-Up Calls
                          </h4>
                          {activity.nextFollowUpCalls && activity.nextFollowUpCalls.length > 0 ? (
                            <div className="space-y-1.5 ml-6">
                              {activity.nextFollowUpCalls.map((call: any, callIdx: number) => (
                                <div key={callIdx} className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="text-xs min-w-[24px] justify-center">
                                    #{call.attemptNumber}
                                  </Badge>
                                  <span className="text-muted-foreground">
                                    {call.phoneNumber}
                                  </span>
                                  <span className="text-xs font-medium flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatScheduleDate(call.scheduledFor)}
                                  </span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${call.status === 'scheduled' ? 'border-orange-200 text-orange-700' : 'border-gray-200'}`}
                                  >
                                    {call.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground ml-6">No follow-up calls scheduled</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Expand hint */}
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      {expandedLead === idx ? "Click to collapse" : "Click to see follow-up schedule →"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
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
