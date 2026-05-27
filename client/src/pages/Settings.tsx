import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const settingsQuery = trpc.settings.get.useQuery();
  const updateSettingsMutation = trpc.settings.update.useMutation();

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

  const handleSaveSettings = async () => {
    try {
      await updateSettingsMutation.mutateAsync(formData);
      toast.success("Settings saved successfully");
    } catch (error) {
      toast.error("Failed to save settings");
    }
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
      {/* Retell.AI Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Retell.AI Configuration</CardTitle>
          <CardDescription>
            Configure your Retell.AI API credentials for outbound call triggering
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              placeholder="Your Retell.AI API key"
              value={formData.retellApiKey}
              onChange={(e) => setFormData({ ...formData, retellApiKey: e.target.value })}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Get your API key from your Retell.AI dashboard
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Agent ID</label>
            <Input
              placeholder="Your Retell.AI agent ID"
              value={formData.retellAgentId}
              onChange={(e) => setFormData({ ...formData, retellAgentId: e.target.value })}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The ID of the voice agent to use for outbound calls
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Sender Phone Number</label>
            <Input
              placeholder="+1234567890"
              value={formData.senderPhoneNumber}
              onChange={(e) => setFormData({ ...formData, senderPhoneNumber: e.target.value })}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The phone number to use when making outbound calls (E.164 format)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SMTP Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Email Configuration</CardTitle>
          <CardDescription>
            Configure your SMTP settings for sending personalized emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">SMTP Host</label>
            <Input
              placeholder="smtp.gmail.com"
              value={formData.smtpHost}
              onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
              className="mt-2"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">SMTP Port</label>
              <Input
                type="number"
                placeholder="587"
                value={formData.smtpPort}
                onChange={(e) => setFormData({ ...formData, smtpPort: parseInt(e.target.value) || 587 })}
                className="mt-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">SMTP Username</label>
              <Input
                placeholder="your-email@gmail.com"
                value={formData.smtpUsername}
                onChange={(e) => setFormData({ ...formData, smtpUsername: e.target.value })}
                className="mt-2"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">SMTP Password</label>
            <Input
              type="password"
              placeholder="Your SMTP password or app password"
              value={formData.smtpPassword}
              onChange={(e) => setFormData({ ...formData, smtpPassword: e.target.value })}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              For Gmail, use an App Password instead of your regular password
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Sender Email Address</label>
            <Input
              type="email"
              placeholder="noreply@yourcompany.com"
              value={formData.senderEmail}
              onChange={(e) => setFormData({ ...formData, senderEmail: e.target.value })}
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Sender Name</label>
            <Input
              placeholder="Your Company Name"
              value={formData.senderName}
              onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSaveSettings}
          disabled={updateSettingsMutation.isPending}
          className="gap-2"
          size="lg"
        >
          {updateSettingsMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
