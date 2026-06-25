import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Play, Pause, Trash2, ShieldCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import { ActivityFeed } from "@/components/ActivityFeed";

export default function CampaignsPage() {
  const [, navigate] = useLocation();
  const campaignsQuery = trpc.campaigns.list.useQuery();
  const launchCampaignMutation = trpc.campaigns.launch.useMutation();
  const pauseCampaignMutation = trpc.campaigns.pause.useMutation();
  const deleteCampaignMutation = trpc.campaigns.delete.useMutation();
  const sendTestEmailMutation = trpc.email.sendTestEmail.useMutation();
  const verifyEmailsMutation = trpc.verification.verifyEmails.useMutation();
  const createInboxTestMutation = trpc.verification.createInboxTest.useMutation();

  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  const handleLaunchCampaign = async (campaignId: number) => {
    try {
      const result = await launchCampaignMutation.mutateAsync(campaignId);
      const blocked = (result as any)?.skippedUndeliverable || 0;
      if (blocked > 0) {
        toast.success(`Campaign launched! ${(result as any)?.sentCount || 0} emails sent. ${blocked} undeliverable email(s) auto-blocked.`);
      } else {
        toast.success(`Campaign launched! ${(result as any)?.sentCount || 0} emails sent.`);
      }
      campaignsQuery.refetch();
    } catch (error: any) {
      const msg = error?.message || "Failed to launch campaign";
      toast.error(msg);
    }
  };

  const handlePauseCampaign = async (campaignId: number) => {
    try {
      await pauseCampaignMutation.mutateAsync(campaignId);
      toast.success("Campaign paused");
      campaignsQuery.refetch();
    } catch (error) {
      toast.error("Failed to pause campaign");
    }
  };

  const handleDeleteCampaign = async (campaignId: number) => {
    if (!confirm("Are you sure you want to delete this campaign? This action cannot be undone.")) return;
    try {
      await deleteCampaignMutation.mutateAsync(campaignId);
      toast.success("Campaign deleted");
      campaignsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete campaign");
    }
  };

  return (
    <div className="space-y-6">
      {/* Campaigns List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Your Campaigns ({campaignsQuery.data?.length || 0})
          </CardTitle>
          <CardDescription>Manage your email campaigns and track performance</CardDescription>
        </CardHeader>
        <CardContent>
          {campaignsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaignsQuery.data && campaignsQuery.data.length > 0 ? (
            <div className="space-y-4">
              {campaignsQuery.data.map((campaign) => (
                <div
                  key={campaign.id}
                  className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold cursor-pointer hover:text-primary transition-colors" onClick={() => setSelectedCampaignId(selectedCampaignId === campaign.id ? null : campaign.id)}>{campaign.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
                    </div>
                    <Badge variant={
                      campaign.status === "active" ? "default" :
                      campaign.status === "draft" ? "secondary" :
                      campaign.status === "paused" ? "outline" :
                      "secondary"
                    }>
                      {campaign.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 py-3 border-y border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Leads</p>
                      <p className="text-lg font-semibold">{campaign.totalLeads}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sent</p>
                      <p className="text-lg font-semibold">{campaign.sentCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Opens</p>
                      <p className="text-lg font-semibold text-green-600">{campaign.openCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Clicks</p>
                      <p className="text-lg font-semibold text-purple-600">{campaign.clickCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Calls</p>
                      <p className="text-lg font-semibold text-orange-600">{campaign.callCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Bounced</p>
                      <p className="text-lg font-semibold text-red-600">{(campaign as any).bounceCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Bounce Rate</p>
                      <p className="text-lg font-semibold text-red-500">
                        {campaign.sentCount > 0 ? Math.round((((campaign as any).bounceCount || 0) / campaign.sentCount) * 100) : 0}%
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {campaign.status === "draft" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await sendTestEmailMutation.mutateAsync({
                                subject: campaign.subject || campaign.name,
                                body: campaign.emailTemplate || "Preview not available",
                              });
                              toast.success("Preview email sent to your inbox! Check before launching.");
                            } catch (error: any) {
                              toast.error(error?.message || "Failed to send preview email");
                            }
                          }}
                          disabled={sendTestEmailMutation.isPending}
                          className="gap-2"
                        >
                          <Mail className="w-4 h-4" />
                          {sendTestEmailMutation.isPending ? "Sending..." : "Send Preview"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const result = await verifyEmailsMutation.mutateAsync({ campaignId: String(campaign.id) });
                              if (result.doNotSendCount > 0) {
                                toast.warning(`Email Verification: ${result.safeToSendCount} safe to send, ${result.doNotSendCount} should NOT be sent (${result.undeliverable} undeliverable, ${result.risky} risky)`);
                              } else {
                                toast.success(`All ${result.safeToSendCount} emails verified as safe to send!`);
                              }
                            } catch (error: any) {
                              toast.error(error?.message || "Email verification failed");
                            }
                          }}
                          disabled={verifyEmailsMutation.isPending}
                          className="gap-2"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          {verifyEmailsMutation.isPending ? "Verifying..." : "Verify Emails"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const result = await createInboxTestMutation.mutateAsync({ campaignId: String(campaign.id) });
                              if (result.dashboardUrl) {
                                window.open(result.dashboardUrl, "_blank");
                                toast.success("Opening Bouncer dashboard. Use email verification to check your list before sending.", { duration: 8000 });
                              }
                            } catch (error: any) {
                              toast.error(error?.message || "Inbox test failed");
                            }
                          }}
                          disabled={createInboxTestMutation.isPending}
                          className="gap-2"
                        >
                          <Inbox className="w-4 h-4" />
                          {createInboxTestMutation.isPending ? "Loading..." : "Test Inbox"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleLaunchCampaign(campaign.id)}
                          disabled={launchCampaignMutation.isPending}
                          className="gap-2"
                        >
                          <Play className="w-4 h-4" />
                          Launch
                        </Button>
                      </>
                    )}
                    {campaign.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePauseCampaign(campaign.id)}
                        disabled={pauseCampaignMutation.isPending}
                        className="gap-2"
                      >
                        <Pause className="w-4 h-4" />
                        Pause
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedCampaignId(selectedCampaignId === campaign.id ? null : campaign.id)}
                    >
                      {selectedCampaignId === campaign.id ? "Hide Details" : "View Tracking"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    >
                      View Full Details
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteCampaign(campaign.id)}
                      disabled={deleteCampaignMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {selectedCampaignId === campaign.id && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <ActivityFeed campaignId={campaign.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No campaigns yet. Use the Email Composer to create one.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
