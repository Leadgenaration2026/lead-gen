import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { LeadPicker } from "@/components/LeadPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, Copy, Trash2, FileText, Sparkles, Eye, BookTemplate, Send, Rocket } from "lucide-react";
import { AIWriteButton } from "@/components/AIWriteButton";

type EmailType = "discovery" | "value_prop" | "social_proof" | "urgency" | "custom";

const emailTypeLabels: Record<EmailType, { label: string; color: string }> = {
  discovery: { label: "Discovery", color: "bg-blue-100 text-blue-700" },
  value_prop: { label: "Value Prop", color: "bg-green-100 text-green-700" },
  social_proof: { label: "Social Proof", color: "bg-purple-100 text-purple-700" },
  urgency: { label: "Urgency", color: "bg-red-100 text-red-700" },
  custom: { label: "Custom", color: "bg-gray-100 text-gray-700" },
};

export default function CampaignTemplates() {
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [createCampaignTemplate, setCreateCampaignTemplate] = useState<any>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignEmailTemplate, setCampaignEmailTemplate] = useState("");
  const [campaignLeadIds, setCampaignLeadIds] = useState<number[]>([]);

  const leadsQuery = trpc.leads.list.useQuery();
  const createCampaignMutation = trpc.campaigns.create.useMutation();
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    subject: "",
    emailTemplate: "",
    emailType: "custom" as EmailType,
    tags: "",
  });

  const templatesQuery = trpc.campaignTemplates.list.useQuery();
  const createMutation = trpc.campaignTemplates.create.useMutation();
  const deleteMutation = trpc.campaignTemplates.delete.useMutation();

  // Save from existing campaign
  const [saveFromCampaignOpen, setSaveFromCampaignOpen] = useState(false);
  const [saveCampaignId, setSaveCampaignId] = useState<number | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveTags, setSaveTags] = useState("");
  const campaignsQuery = trpc.campaigns.list.useQuery();
  const saveFromCampaignMutation = trpc.campaignTemplates.saveFromCampaign.useMutation();

  const handleCreate = async () => {
    if (!newTemplate.name || !newTemplate.subject || !newTemplate.emailTemplate) {
      toast.error("Please fill in name, subject, and email template");
      return;
    }
    try {
      await createMutation.mutateAsync(newTemplate);
      toast.success("Template created successfully!");
      setNewTemplate({ name: "", description: "", subject: "", emailTemplate: "", emailType: "custom", tags: "" });
      setCreateOpen(false);
      templatesQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to create template");
    }
  };

  const handleSaveFromCampaign = async () => {
    if (!saveCampaignId || !saveName) {
      toast.error("Please select a campaign and enter a name");
      return;
    }
    try {
      await saveFromCampaignMutation.mutateAsync({
        campaignId: saveCampaignId,
        name: saveName,
        description: saveDescription,
        tags: saveTags,
      });
      toast.success("Campaign saved as template!");
      setSaveFromCampaignOpen(false);
      setSaveCampaignId(null);
      setSaveName("");
      setSaveDescription("");
      setSaveTags("");
      templatesQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to save campaign as template");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Template deleted");
      templatesQuery.refetch();
    } catch (error: any) {
      toast.error("Failed to delete template");
    }
  };

  const handleCopyToClipboard = (template: any) => {
    navigator.clipboard.writeText(template.emailTemplate);
    toast.success("Email template copied to clipboard!");
  };

  // Quick-launch: navigate to email composer with template data pre-filled via URL params
  const handleQuickLaunch = (template: any) => {
    const params = new URLSearchParams();
    params.set("subject", template.subject || "");
    params.set("body", template.emailTemplate || "");
    params.set("emailType", template.emailType || "custom");
    navigate(`/email-composer?${params.toString()}`);
    toast.success("Template loaded into Email Composer!");
  };

  // Create campaign from template
  const handleCreateCampaignFromTemplate = async () => {
    if (!createCampaignTemplate || !campaignName || !campaignSubject || !campaignEmailTemplate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (campaignLeadIds.length === 0) {
      toast.error("Please select at least one lead");
      return;
    }
    try {
      await createCampaignMutation.mutateAsync({
        name: campaignName,
        description: campaignDescription,
        subject: campaignSubject,
        emailTemplate: campaignEmailTemplate,
        leadIds: campaignLeadIds,
        templateId: createCampaignTemplate.id,
      });
      toast.success("Campaign created from template! Go to Campaigns tab to launch.");
      setCreateCampaignTemplate(null);
      setCampaignName("");
      setCampaignDescription("");
      setCampaignSubject("");
      setCampaignEmailTemplate("");
      setCampaignLeadIds([]);
    } catch (error: any) {
      toast.error(error.message || "Failed to create campaign");
    }
  };

  // Helper to open the create-campaign-from-template dialog with pre-filled fields
  const openCreateCampaignDialog = (template: any) => {
    setCreateCampaignTemplate(template);
    setCampaignName(template.name + " Campaign");
    setCampaignDescription(template.description || "");
    setCampaignSubject(template.subject || "");
    setCampaignEmailTemplate(template.emailTemplate || "");
    setCampaignLeadIds([]);
  };

  const templates = templatesQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaign Templates</h1>
          <p className="text-muted-foreground mt-2">
            Save and reuse your best-performing email campaigns as templates
          </p>
        </div>
        <div className="flex gap-2">
          {/* Save from Existing Campaign */}
          <Dialog open={saveFromCampaignOpen} onOpenChange={setSaveFromCampaignOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <BookTemplate className="w-4 h-4" />
                Save from Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Save Campaign as Template</DialogTitle>
                <DialogDescription>Select an existing campaign to save as a reusable template</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Campaign *</Label>
                  <Select value={saveCampaignId?.toString() || ""} onValueChange={(v) => setSaveCampaignId(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a campaign..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(campaignsQuery.data || []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g., Q2 SaaS Outreach Template" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={saveDescription} onChange={(e) => setSaveDescription(e.target.value)} placeholder="Brief description of this template" />
                </div>
                <div className="space-y-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input value={saveTags} onChange={(e) => setSaveTags(e.target.value)} placeholder="e.g., saas, outreach, cold-email" />
                </div>
                <Button onClick={handleSaveFromCampaign} disabled={saveFromCampaignMutation.isPending} className="w-full">
                  {saveFromCampaignMutation.isPending ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>) : "Save as Template"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Create New Template */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4" />
                Create Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Template</DialogTitle>
                <DialogDescription>Build a reusable email template from scratch</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Template Name *</Label>
                    <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} placeholder="e.g., Cold Outreach - SaaS" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Type</Label>
                    <Select value={newTemplate.emailType} onValueChange={(v) => setNewTemplate({ ...newTemplate, emailType: v as EmailType })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discovery">Discovery</SelectItem>
                        <SelectItem value="value_prop">Value Proposition</SelectItem>
                        <SelectItem value="social_proof">Social Proof</SelectItem>
                        <SelectItem value="urgency">Urgency</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} placeholder="Brief description of when to use this template" />
                </div>
                <div className="space-y-2">
                  <Label>Subject Line *</Label>
                  <Input value={newTemplate.subject} onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })} placeholder="e.g., Quick question about {{companyName}}" />
                  <p className="text-xs text-muted-foreground">Use {"{{ownerName}}"}, {"{{companyName}}"} for personalization</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Email Template *</Label>
                    <AIWriteButton
                      onGenerated={(s, b) => setNewTemplate({ ...newTemplate, subject: s, emailTemplate: b })}
                      includeVariables={true}
                      buttonLabel="AI Write"
                      buttonVariant="outline"
                      buttonSize="sm"
                      className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    />
                  </div>
                  <Textarea value={newTemplate.emailTemplate} onChange={(e) => setNewTemplate({ ...newTemplate, emailTemplate: e.target.value })} placeholder={"Hi {{ownerName}},\n\nI noticed {{companyName}} is doing great work in...\n\nHere's how we can help:\n• Point 1\n• Point 2\n• Point 3\n\nWould you be open to a quick 15-minute chat?\n\nSchedule here: {{ctaLink}}\n\nBest regards"} rows={10} className="text-sm font-mono" />
                  <p className="text-xs text-muted-foreground">Available variables: {"{{ownerName}}"}, {"{{companyName}}"}, {"{{email}}"}, {"{{industry}}"}, {"{{ctaLink}}"}</p>
                </div>
                <div className="space-y-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input value={newTemplate.tags} onChange={(e) => setNewTemplate({ ...newTemplate, tags: e.target.value })} placeholder="e.g., saas, cold-email, b2b" />
                </div>
                <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</>) : "Create Template"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Templates Grid */}
      {templatesQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template: any) => (
            <Card key={template.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription className="text-xs mt-1 line-clamp-2">{template.description}</CardDescription>
                    )}
                  </div>
                  <Badge className={`text-xs shrink-0 ml-2 ${emailTypeLabels[template.emailType as EmailType]?.color || "bg-gray-100 text-gray-700"}`}>
                    {emailTypeLabels[template.emailType as EmailType]?.label || "Custom"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
                  <p className="text-sm font-medium truncate">{template.subject}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Preview</p>
                  <p className="text-xs text-muted-foreground line-clamp-3">{template.emailTemplate?.replace(/<[^>]*>/g, "").slice(0, 150)}...</p>
                </div>
                {template.tags && (
                  <div className="flex flex-wrap gap-1">
                    {template.tags.split(",").map((tag: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs px-1.5 py-0">{tag.trim()}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">Used {template.usageCount || 0} times</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700" title="Quick-launch in Email Composer" onClick={() => handleQuickLaunch(template)}>
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:text-green-700" title="Create Campaign from Template" onClick={() => openCreateCampaignDialog(template)}>
                      <Rocket className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewTemplate(template)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleCopyToClipboard(template)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(template.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-10 h-10 text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold mb-1">No Templates Yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Create templates from scratch or save your best-performing campaigns as reusable templates
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSaveFromCampaignOpen(true)}>
                <BookTemplate className="w-4 h-4 mr-2" />
                Save from Campaign
              </Button>
              <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Campaign from Template Dialog */}
      {createCampaignTemplate && (
        <Dialog open={!!createCampaignTemplate} onOpenChange={() => setCreateCampaignTemplate(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-green-600" />
                Create Campaign from Template
              </DialogTitle>
              <DialogDescription>
                All fields are pre-filled from "{createCampaignTemplate.name}". Edit as needed before creating.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Campaign Name *</Label>
                  <Input
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g., Q3 SaaS Outreach"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={campaignDescription}
                    onChange={(e) => setCampaignDescription(e.target.value)}
                    placeholder="Brief description of this campaign"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email Subject *</Label>
                <Input
                  value={campaignSubject}
                  onChange={(e) => setCampaignSubject(e.target.value)}
                  placeholder="e.g., Quick question about {{companyName}}"
                />
                <p className="text-xs text-muted-foreground">Use {"{{ownerName}}"}, {"{{companyName}}"} for personalization</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Email Template *</Label>
                  <AIWriteButton
                    onGenerated={(s, b) => { setCampaignSubject(s); setCampaignEmailTemplate(b); }}
                    includeVariables={true}
                    buttonLabel="AI Write"
                    buttonVariant="outline"
                    buttonSize="sm"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  />
                </div>
                <Textarea
                  value={campaignEmailTemplate}
                  onChange={(e) => setCampaignEmailTemplate(e.target.value)}
                  rows={10}
                  className="text-sm font-mono"
                  placeholder="HTML email template with personalization variables"
                />
                <p className="text-xs text-muted-foreground">Available variables: {"{{ownerName}}"}, {"{{companyName}}"}, {"{{email}}"}, {"{{industry}}"}, {"{{ctaLink}}"}</p>
              </div>
              <div className="space-y-2">
                <Label>Select Leads *</Label>
                <LeadPicker
                  leads={leadsQuery.data || []}
                  selectedIds={campaignLeadIds}
                  onChange={setCampaignLeadIds}
                  isLoading={leadsQuery.isLoading}
                />
              </div>
              <Button
                onClick={handleCreateCampaignFromTemplate}
                disabled={createCampaignMutation.isPending || !campaignName || !campaignSubject || !campaignEmailTemplate || campaignLeadIds.length === 0}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {createCampaignMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</>
                ) : (
                  <><Rocket className="w-4 h-4 mr-2" />Create Campaign</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Template Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                {previewTemplate.name}
              </DialogTitle>
              <DialogDescription>{previewTemplate.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Subject Line</Label>
                <p className="font-medium text-base mt-1">{previewTemplate.subject}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email Body</Label>
                <div className="mt-2 border rounded-lg p-4 bg-white text-sm whitespace-pre-wrap leading-relaxed">
                  {previewTemplate.emailTemplate}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => handleCopyToClipboard(previewTemplate)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Template
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => {
                  navigator.clipboard.writeText(previewTemplate.emailTemplate);
                  toast.success("Template copied! Go to Email Composer to use it.");
                  setPreviewTemplate(null);
                }}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Use in Email Composer
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
