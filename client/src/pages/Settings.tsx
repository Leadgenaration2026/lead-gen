import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Phone, Mail, PenTool } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const settingsQuery = trpc.settings.get.useQuery();
  const updateSettingsMutation = trpc.settings.update.useMutation();
  const signatureQuery = trpc.signature.get.useQuery();
  const updateSignatureMutation = trpc.signature.update.useMutation();

  const [formData, setFormData] = useState({
    retellApiKey: "",
    retellAgentId: "",
    senderPhoneNumber: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    senderEmail: "",
    senderName: "",
  });

  const [signatureHtml, setSignatureHtml] = useState("");
  const [signaturePlainText, setSignaturePlainText] = useState("");
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setFormData({
        retellApiKey: "",
        retellAgentId: settingsQuery.data.retellAgentId || "",
        senderPhoneNumber: settingsQuery.data.senderPhoneNumber || "",
        smtpHost: settingsQuery.data.smtpHost || "",
        smtpPort: settingsQuery.data.smtpPort || 587,
        smtpUsername: settingsQuery.data.smtpUsername || "",
        smtpPassword: "",
        senderEmail: settingsQuery.data.senderEmail || "",
        senderName: settingsQuery.data.senderName || "",
      });
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (signatureQuery.data) {
      setSignatureHtml(signatureQuery.data.signatureHtml || "");
      setSignaturePlainText(signatureQuery.data.signaturePlainText || "");
    }
  }, [signatureQuery.data]);

  const handleSaveSettings = async () => {
    try {
      await updateSettingsMutation.mutateAsync(formData);
      toast.success("Settings saved successfully");
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const handleSaveSignature = async () => {
    try {
      await updateSignatureMutation.mutateAsync({
        signatureHtml,
        signaturePlainText,
      });
      toast.success("Signature saved successfully");
    } catch (error) {
      toast.error("Failed to save signature");
    }
  };

  const applySignatureTemplate = (template: string) => {
    const templates: Record<string, string> = {
      professional: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p style="margin: 0; font-weight: bold; font-size: 16px;">Your Name</p>
  <p style="margin: 2px 0; color: #555;">Your Title | Your Company</p>
  <p style="margin: 2px 0; color: #555;">Phone: +1 (555) 123-4567</p>
  <p style="margin: 2px 0; color: #555;">Email: your@email.com</p>
  <p style="margin: 8px 0 0 0;"><a href="https://calendly.com/nitin-virtualassistant/30min" style="color: #2563eb; text-decoration: none; font-weight: 500;">Schedule a Meeting</a></p>
</div>`,
      minimal: `<div style="font-family: Arial, sans-serif; font-size: 13px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 10px;">
  <p style="margin: 0;"><strong>Your Name</strong> | Your Company</p>
  <p style="margin: 2px 0;">your@email.com | +1 (555) 123-4567</p>
</div>`,
      bold: `<div style="font-family: Arial, sans-serif; font-size: 14px;">
  <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
    <tr>
      <td style="border-left: 3px solid #2563eb; padding-left: 12px;">
        <p style="margin: 0; font-weight: bold; font-size: 16px; color: #1a1a1a;">Your Name</p>
        <p style="margin: 2px 0; color: #555;">Your Title</p>
        <p style="margin: 2px 0; color: #555;">Your Company</p>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #555;">+1 (555) 123-4567 | your@email.com</p>
        <p style="margin: 6px 0 0 0;"><a href="https://calendly.com/nitin-virtualassistant/30min" style="background: #2563eb; color: white; padding: 6px 14px; border-radius: 4px; text-decoration: none; font-size: 12px; font-weight: 500;">Book a Call</a></p>
      </td>
    </tr>
  </table>
</div>`,
    };
    setSignatureHtml(templates[template] || "");
    toast.info("Template applied! Edit the details to match your information.");
  };

  if (settingsQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure your integrations, email credentials, and signature
        </p>
      </div>

      <Tabs defaultValue="integrations" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Retell.AI
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email / SMTP
          </TabsTrigger>
          <TabsTrigger value="signature" className="flex items-center gap-2">
            <PenTool className="w-4 h-4" />
            Signature
          </TabsTrigger>
        </TabsList>

        {/* Retell.AI Tab */}
        <TabsContent value="integrations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Retell.AI Configuration</CardTitle>
              <CardDescription>
                Configure your Retell.AI API credentials for automated outbound calls
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  placeholder="Your Retell.AI API key"
                  value={formData.retellApiKey}
                  onChange={(e) => setFormData({ ...formData, retellApiKey: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Get your API key from your Retell.AI dashboard at retellai.com
                </p>
              </div>
              <div className="space-y-2">
                <Label>Agent ID</Label>
                <Input
                  placeholder="Your Retell.AI agent ID"
                  value={formData.retellAgentId}
                  onChange={(e) => setFormData({ ...formData, retellAgentId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  The ID of the voice agent to use for outbound calls
                </p>
              </div>
              <div className="space-y-2">
                <Label>Sender Phone Number</Label>
                <Input
                  placeholder="+1234567890"
                  value={formData.senderPhoneNumber}
                  onChange={(e) => setFormData({ ...formData, senderPhoneNumber: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  The phone number to use for outbound calls (E.164 format, e.g. +14155551234)
                </p>
              </div>
              <div className="pt-4">
                <Button
                  onClick={handleSaveSettings}
                  disabled={updateSettingsMutation.isPending}
                  className="gap-2"
                >
                  {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Retell.AI Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email / SMTP Tab */}
        <TabsContent value="email" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration (SMTP)</CardTitle>
              <CardDescription>
                Configure your SMTP settings for sending personalized emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>SMTP Host</Label>
                <Input
                  placeholder="smtp.gmail.com"
                  value={formData.smtpHost}
                  onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMTP Port</Label>
                  <Input
                    type="number"
                    placeholder="587"
                    value={formData.smtpPort}
                    onChange={(e) => setFormData({ ...formData, smtpPort: parseInt(e.target.value) || 587 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SMTP Username</Label>
                  <Input
                    placeholder="your-email@gmail.com"
                    value={formData.smtpUsername}
                    onChange={(e) => setFormData({ ...formData, smtpUsername: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>SMTP Password</Label>
                <Input
                  type="password"
                  placeholder="Your SMTP password or app password"
                  value={formData.smtpPassword}
                  onChange={(e) => setFormData({ ...formData, smtpPassword: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  For Gmail, use an App Password (Settings &gt; Security &gt; App Passwords)
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sender Email Address</Label>
                  <Input
                    type="email"
                    placeholder="noreply@yourcompany.com"
                    value={formData.senderEmail}
                    onChange={(e) => setFormData({ ...formData, senderEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sender Name</Label>
                  <Input
                    placeholder="Your Name or Company"
                    value={formData.senderName}
                    onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                  />
                </div>
              </div>
              <div className="pt-4">
                <Button
                  onClick={handleSaveSettings}
                  disabled={updateSettingsMutation.isPending}
                  className="gap-2"
                >
                  {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Email Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signature Tab */}
        <TabsContent value="signature" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Signature</CardTitle>
              <CardDescription>
                Create your professional email signature. This will be automatically appended to all emails you send.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template Buttons */}
              <div className="space-y-2">
                <Label>Quick Templates</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => applySignatureTemplate("professional")}>
                    Professional
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applySignatureTemplate("minimal")}>
                    Minimal
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applySignatureTemplate("bold")}>
                    Bold with CTA
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click a template to start, then edit the details below
                </p>
              </div>

              {/* Signature HTML Editor */}
              <div className="space-y-2">
                <Label>Signature HTML</Label>
                <Textarea
                  value={signatureHtml}
                  onChange={(e) => setSignatureHtml(e.target.value)}
                  placeholder="Paste your HTML signature here or use a template above..."
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>

              {/* Plain Text Version */}
              <div className="space-y-2">
                <Label>Plain Text Version (Optional)</Label>
                <Textarea
                  value={signaturePlainText}
                  onChange={(e) => setSignaturePlainText(e.target.value)}
                  placeholder="Plain text version for email clients that don't support HTML..."
                  rows={4}
                  className="text-sm"
                />
              </div>

              {/* Preview */}
              {signatureHtml && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Preview</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSignaturePreview(!showSignaturePreview)}
                    >
                      {showSignaturePreview ? "Hide Preview" : "Show Preview"}
                    </Button>
                  </div>
                  {showSignaturePreview && (
                    <div
                      className="border rounded-lg p-4 bg-white"
                      dangerouslySetInnerHTML={{ __html: signatureHtml }}
                    />
                  )}
                </div>
              )}

              {/* Save Button */}
              <div className="pt-4">
                <Button
                  onClick={handleSaveSignature}
                  disabled={updateSignatureMutation.isPending || !signatureHtml}
                  className="gap-2"
                >
                  {updateSignatureMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Signature
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="bg-amber-50 border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-900">Signature Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-800 space-y-1">
              <p>Your signature is automatically added to every email you send.</p>
              <p>Keep it concise: Name, title, company, phone, and one CTA link.</p>
              <p>Avoid images in signatures as they can trigger spam filters.</p>
              <p>Your Calendly link is already included in the email body CTA.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
