import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, MousePointerClick, Phone, CheckCircle2 } from "lucide-react";

interface ActivityFeedProps {
  campaignId: number;
}

export function ActivityFeed({ campaignId }: ActivityFeedProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [isPolling, setIsPolling] = useState(true);

  const activityQuery = trpc.campaigns.activity.useQuery(campaignId, {
    enabled: true,
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
        return null;
    }
  };

  const getActivityLabel = (activity: any) => {
    const labels = [];
    if (activity.emailSent) labels.push("Email Sent");
    if (activity.emailOpened) labels.push("Email Opened");
    if (activity.emailClicked) labels.push("Link Clicked");
    if (activity.callTriggered) labels.push("Call Triggered");
    return labels.join(" → ");
  };

  const getActivityStatus = (activity: any) => {
    if (activity.callTriggered) return "called";
    if (activity.emailClicked) return "clicked";
    if (activity.emailOpened) return "opened";
    if (activity.emailSent) return "sent";
    return "pending";
  };

  const formatTime = (date: Date | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Activity Feed</CardTitle>
          <CardDescription>Real-time campaign activity updates</CardDescription>
        </div>
        <button
          onClick={() => setIsPolling(!isPolling)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isPolling ? "Pause" : "Resume"}
        </button>
      </CardHeader>
      <CardContent>
        {activityQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : activities && activities.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activities.map((activity, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="mt-1">
                  {getActivityIcon(getActivityStatus(activity))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{activity.leadName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {activity.companyName}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getActivityLabel(activity)}
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {activity.emailSent && (
                      <Badge variant="outline" className="text-xs">
                        {formatTime(activity.emailSentAt)}
                      </Badge>
                    )}
                    {activity.emailOpened && (
                      <Badge variant="secondary" className="text-xs">
                        Opened {formatTime(activity.emailOpenedAt)}
                      </Badge>
                    )}
                    {activity.emailClicked && (
                      <Badge variant="secondary" className="text-xs">
                        Clicked {formatTime(activity.emailClickedAt)}
                      </Badge>
                    )}
                    {activity.callTriggered && (
                      <Badge variant="secondary" className="text-xs">
                        Called {formatTime(activity.callTriggeredAt)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No activity yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
