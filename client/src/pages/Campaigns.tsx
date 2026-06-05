import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Mail, Play, Pause, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LeadPicker } from "@/components/LeadPicker";
import { AIWriteButton } from "@/components/AIWriteButton";

export default function CampaignsPage() {
  const campaignsQuery = trpc.campaigns.list.useQuery();
  const leadsQuery = trpc.leads.list.useQuery();
  const leadSetsQuery = trpc.leadSets.list.useQuery();
  const createCampaignMutation = trpc.campaigns.create.useMutation();
  const launchCampaignMutation = trpc.campaigns.launch.useMutation();
  const pauseCampaignMutation = trpc.campaigns.pause.useMutation();
  const deleteCampaignMutation = trpc.campaigns.delete.useMutation();
  const sendTestEmailMutation = trpc.email.sendTestEmail.useMutation();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedLeadSetId, setSelectedLeadSetId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    subject: "",
    emailTemplate: "",
    leadIds: [] as number[],
  });

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
      });
      toast.success(`Campaign created with ${formData.leadIds.length} leads!`);
      setFormData({
        name: "",
        description: "",
        subject: "",
        emailTemplate: "",
        leadIds: [],
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
                <AIWriteButton
                  onGenerated={(s, b) => setFormData({ ...formData, subject: s, emailTemplate: b })}
                  includeVariables={true}
                  buttonLabel="AI Write"
                  buttonVariant="outline"
                  buttonSize="sm"
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                />
              </div>
              <Textarea
                placeholder="HTML email template with personalization variables"
                value={formData.emailTemplate}
                onChange={(e) => setFormData({ ...formData, emailTemplate: e.target.value })}
                className="mt-1.5 min-h-28 font-mono text-xs"
              />
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
                      <h3 className="font-semibold">{campaign.name}</h3>
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

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 py-3 border-y border-border">
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
                      <p className="text-lg font-semibold">{campaign.openCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Calls</p>
                      <p className="text-lg font-semibold">{campaign.callCount}</p>
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
                      {selectedCampaignId === campaign.id ? "Hide" : "View"} Activity
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
