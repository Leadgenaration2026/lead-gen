import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Mail, Play, Pause, Trash2, RefreshCw, ShieldCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LeadPicker } from "@/components/LeadPicker";
import { AIWriteButton } from "@/components/AIWriteButton";

export default function CampaignsPage() {
  const [, navigate] = useLocation();
  const campaignsQuery = trpc.campaigns.list.useQuery();
  const leadsQuery = trpc.leads.list.useQuery();
  const leadSetsQuery = trpc.leadSets.list.useQuery();
  const createCampaignMutation = trpc.campaigns.create.useMutation();
  const launchCampaignMutation = trpc.campaigns.launch.useMutation();
  const pauseCampaignMutation = trpc.campaigns.pause.useMutation();
  const deleteCampaignMutation = trpc.campaigns.delete.useMutation();
  const sendTestEmailMutation = trpc.email.sendTestEmail.useMutation();
  const verifyEmailsMutation = trpc.verification.verifyEmails.useMutation();
  const createInboxTestMutation = trpc.verification.createInboxTest.useMutation();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedLeadSetId, setSelectedLeadSetId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    subject: "",
    emailTemplate: "",
    leadIds: [] as number[],
    dailySendLimit: undefined as number | undefined,
  });
  const [lastCampaignAIPrompt, setLastCampaignAIPrompt] = useState<{ prompt: string; emailType: string; companyContext?: string } | null>(null);
  const regenerateTemplateMutation = trpc.email.generateAITemplate.useMutation();

  // Filter leads by selected lead set
  const filteredLeads = useMemo(() => {
    const allLeads = leadsQuery.data || [];
    if (!selectedLeadSetId) return allLeads;
    return allLeads.filter((l: any) => l.leadSetId === selectedLeadSetId);
  }, [leadsQuery.data, selectedLeadSetId]);

  const handleCreateCampaign = async () => {
    if (!formData.name || !formData.subject || !formData.emailTemplate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formData.leadIds.length === 0) {
      toast.error("Please select at least one lead for this campaign");
      return;
    }

    try {
      await createCampaignMutation.mutateAsync({
        ...formData,
        leadIds: formData.leadIds,
        dailySendLimit: formData.dailySendLimit || undefined,
      });
      toast.success(`Campaign created with ${formData.leadIds.length} leads!`);
      setFormData({
        name: "",
        description: "",
        subject: "",
        emailTemplate: "",
        leadIds: [],
        dailySendLimit: undefined,
      });
      setIsOpen(false);
      campaignsQuery.refetch();
    } catch (error) {
      toast.error("Failed to create campaign");
    }
  };

  const handleLaunchCampaign = async (campaignId: number) => {
    try {
      await launchCampaignMutation.mutateAsync(campaignId);
      toast.success("Campaign launched successfully");
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
      {/* Create Campaign Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Campaign
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>
              Set up a new email campaign with personalized templates and select target leads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Campaign Name *</label>
                <Input
                  placeholder="e.g., Q2 SaaS Outreach"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Brief campaign description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Email Subject *</label>
              <Input
                placeholder="e.g., Quick question about {{companyName}}"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">Use {"{{ownerName}}"}, {"{{companyName}}"}, {"{{email}}"} for personalization</p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Email Template *</label>
                <div className="flex items-center gap-2">
                  {formData.emailTemplate && lastCampaignAIPrompt && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={async () => {
                        try {
                          const result = await regenerateTemplateMutation.mutateAsync({
                            prompt: lastCampaignAIPrompt.prompt,
                            emailType: lastCampaignAIPrompt.emailType as any,
                            companyContext: lastCampaignAIPrompt.companyContext || undefined,
                            includeVariables: true,
                            useProblemAnalysis: false,
                          });
                          setFormData({ ...formData, subject: result.subject, emailTemplate: result.body });
                          toast.success("New template variation generated!");
                        } catch (error: any) {
                          toast.error(error.message || "Failed to regenerate");
                        }
                      }}
                      disabled={regenerateTemplateMutation.isPending}
                      className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {regenerateTemplateMutation.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating...</>
                      ) : (
                        <><RefreshCw className="w-3.5 h-3.5" /> Regenerate</>
                      )}
                    </Button>
                  )}
                  <AIWriteButton
                    onGenerated={(s, b) => setFormData({ ...formData, subject: s, emailTemplate: b })}
                    onPromptUsed={(prompt, emailType, companyContext) => setLastCampaignAIPrompt({ prompt, emailType, companyContext })}
                    includeVariables={true}
                    buttonLabel="AI Write"
                    buttonVariant="outline"
                    buttonSize="sm"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  />
                </div>
              </div>
              <Textarea
                placeholder="HTML email template with personalization variables"
                value={formData.emailTemplate}
                onChange={(e) => setFormData({ ...formData, emailTemplate: e.target.value })}
                className="mt-1.5 min-h-28 font-mono text-xs"
              />
              {formData.emailTemplate && lastCampaignAIPrompt && (
                <div className="mt-2 border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-purple-900">Not happy with this template?</p>
                      <p className="text-xs text-purple-600">Click Regenerate above to get a different variation</p>
                    </div>
                    <RefreshCw className="w-4 h-4 text-purple-500" />
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Select Leads *</label>
              <div className="mb-2">
                <select
                  value={selectedLeadSetId || ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setSelectedLeadSetId(val);
                    // Auto-select all leads from the chosen set
                    if (val) {
                      const setLeads = (leadsQuery.data || []).filter((l: any) => l.leadSetId === val);
                      setFormData({ ...formData, leadIds: setLeads.map((l: any) => l.id) });
                    } else {
                      setFormData({ ...formData, leadIds: [] });
                    }
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All Leads (no set filter)</option>
                  {(leadSetsQuery.data || []).map((set: any) => (
                    <option key={set.id} value={set.id}>
                      {set.name} ({(leadsQuery.data || []).filter((l: any) => l.leadSetId === set.id).length} leads)
                    </option>
                  ))}
                </select>
              </div>
              <LeadPicker
                leads={filteredLeads}
                selectedIds={formData.leadIds}
                onChange={(ids) => setFormData({ ...formData, leadIds: ids })}
                isLoading={leadsQuery.isLoading}
              />
            </div>
            {/* Daily Send Limit */}
            <div className="border rounded-lg p-3 bg-blue-50/50 border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-blue-900">Daily Send Limit</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.dailySendLimit !== undefined}
                    onChange={(e) => setFormData({ ...formData, dailySendLimit: e.target.checked ? 30 : undefined })}
                    className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-blue-700">Enable</span>
                </label>
              </div>
              {formData.dailySendLimit !== undefined && (
                <div className="mt-2 space-y-1">
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={formData.dailySendLimit || 30}
                    onChange={(e) => setFormData({ ...formData, dailySendLimit: parseInt(e.target.value) || 30 })}
                    className="text-sm h-8 bg-white w-28"
                  />
                  <p className="text-xs text-blue-700">Emails per day. Remaining leads will be sent on subsequent days.</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateCampaign}
                disabled={createCampaignMutation.isPending}
              >
                {createCampaignMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>Create Campaign ({formData.leadIds.length} leads)</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                                toast.warning(`Email Verification: ${result.safeToSendCount} safe to send, ${result.doNotSendCount} should NOT be sent (${result.invalid} invalid, ${result.spamtrap} spam traps, ${result.abuse} abuse)`);
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
                              toast.success(`Inbox test created! Send your email to ${result.seedAddresses.length} seed addresses. Results in 2-5 min.`, { duration: 10000 });
                              // Copy seed addresses to clipboard
                              const seedList = result.seedAddresses.join(", ");
                              await navigator.clipboard.writeText(seedList);
                              toast.info("Seed addresses copied to clipboard!");
                            } catch (error: any) {
                              toast.error(error?.message || "Inbox test creation failed");
                            }
                          }}
                          disabled={createInboxTestMutation.isPending}
                          className="gap-2"
                        >
                          <Inbox className="w-4 h-4" />
                          {createInboxTestMutation.isPending ? "Creating..." : "Test Inbox"}
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
              <p className="text-muted-foreground">No campaigns yet. Create one to get started!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
