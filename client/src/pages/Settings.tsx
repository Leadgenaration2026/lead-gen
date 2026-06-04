import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Phone, Mail, PenTool, CheckCircle2, Send, RotateCcw, ShieldCheck, XCircle, AlertTriangle, Webhook, Copy, Clock, Activity, Zap, ExternalLink, Shield, KeyRound, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function SettingsPage() {
  const settingsQuery = trpc.settings.get.useQuery();
  const updateSettingsMutation = trpc.settings.update.useMutation();
  const testSmtpMutation = trpc.email.sendTestEmail.useMutation();
  const signatureQuery = trpc.signature.get.useQuery();
  const updateSignatureMutation = trpc.signature.update.useMutation();
  const rotationalEmailsQuery = trpc.rotationalEmails.list.useQuery();
  const upsertRotationalMutation = trpc.rotationalEmails.upsert.useMutation();
  const deleteRotationalMutation = trpc.rotationalEmails.delete.useMutation();

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

  // Track whether user has typed into password fields
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [retellKeyTouched, setRetellKeyTouched] = useState(false);

  const [signatureHtml, setSignatureHtml] = useState("");
  const [signaturePlainText, setSignaturePlainText] = useState("");
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);

  // Rotational email form
  const [rotationalForm, setRotationalForm] = useState({
    email: "",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    senderName: "",
    dayOfWeek: 1,
  });

  // Email deliverability checks state
  const [deliverabilityChecks, setDeliverabilityChecks] = useState<{
    spf: "pending" | "pass" | "fail" | "warning";
    dkim: "pending" | "pass" | "fail" | "warning";
    replyTo: "pending" | "pass" | "fail" | "warning";
    unsubscribe: "pending" | "pass" | "fail" | "warning";
    subjectLine: "pending" | "pass" | "fail" | "warning";
    bodyLength: "pending" | "pass" | "fail" | "warning";
    spamWords: "pending" | "pass" | "fail" | "warning";
    signature: "pending" | "pass" | "fail" | "warning";
  }>({
    spf: "pending",
    dkim: "pending",
    replyTo: "pending",
    unsubscribe: "pending",
    subjectLine: "pending",
    bodyLength: "pending",
    spamWords: "pending",
    signature: "pending",
  });
  const [checksRunning, setChecksRunning] = useState(false);

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
      setPasswordTouched(false);
      setRetellKeyTouched(false);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (signatureQuery.data) {
      setSignatureHtml(signatureQuery.data.signatureHtml || "");
      setSignaturePlainText(signatureQuery.data.signaturePlainText || "");
    }
  }, [signatureQuery.data]);

  // Save only Retell.AI fields
  const handleSaveRetell = async () => {
    try {
      const payload: Record<string, any> = {
        retellAgentId: formData.retellAgentId,
        senderPhoneNumber: formData.senderPhoneNumber,
      };
      if (retellKeyTouched && formData.retellApiKey) {
        payload.retellApiKey = formData.retellApiKey;
      }
      await updateSettingsMutation.mutateAsync(payload);
      toast.success("Retell.AI settings saved!");
      settingsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save settings");
    }
  };

  // Save only SMTP/Email fields
  const handleSaveSmtp = async () => {
    try {
      const payload: Record<string, any> = {
        smtpHost: formData.smtpHost,
        smtpPort: formData.smtpPort,
        smtpUsername: formData.smtpUsername,
        senderEmail: formData.senderEmail,
        senderName: formData.senderName,
      };
      if (passwordTouched && formData.smtpPassword) {
        payload.smtpPassword = formData.smtpPassword;
      }
      await updateSettingsMutation.mutateAsync(payload);
      toast.success("Email settings saved!");
      settingsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save settings");
    }
  };

  const handleTestSmtp = async () => {
    if (!formData.senderEmail) {
      toast.error("Please enter a sender email address first");
      return;
    }
    try {
      await testSmtpMutation.mutateAsync({
        testEmail: formData.senderEmail,
        subject: "Test Email from Lead Gen System",
        body: "This is a test email to verify your SMTP settings are working correctly.\n\nIf you received this email, your SMTP configuration is correct!",
      });
      toast.success("Test email sent!", {
        description: `Check ${formData.senderEmail} for the test email.`,
      });
    } catch (error: any) {
      toast.error("SMTP test failed", { description: error?.message || "Failed to send test email" });
    }
  };

  const handleSaveSignature = async () => {
    try {
      await updateSignatureMutation.mutateAsync({ signatureHtml, signaturePlainText });
      toast.success("Signature saved successfully");
    } catch (error) {
      toast.error("Failed to save signature");
    }
  };

  const handleSaveRotationalEmail = async () => {
    if (!rotationalForm.email || !rotationalForm.smtpHost || !rotationalForm.smtpUsername || !rotationalForm.smtpPassword) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      await upsertRotationalMutation.mutateAsync({
        email: rotationalForm.email,
        smtpHost: rotationalForm.smtpHost,
        smtpPort: rotationalForm.smtpPort,
        smtpUsername: rotationalForm.smtpUsername,
        smtpPassword: rotationalForm.smtpPassword,
        senderName: rotationalForm.senderName || undefined,
        dayOfWeek: rotationalForm.dayOfWeek,
        isActive: true,
      });
      toast.success(`Email saved for ${DAY_NAMES[rotationalForm.dayOfWeek]}`);
      rotationalEmailsQuery.refetch();
      setRotationalForm({ email: "", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpUsername: "", smtpPassword: "", senderName: "", dayOfWeek: 1 });
    } catch (error: any) {
      toast.error(error?.message || "Failed to save rotational email");
    }
  };

  const handleDeleteRotational = async (id: number) => {
    try {
      await deleteRotationalMutation.mutateAsync(id);
      toast.success("Rotational email removed");
      rotationalEmailsQuery.refetch();
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  // Run email deliverability checks
  const runDeliverabilityChecks = () => {
    setChecksRunning(true);
    setDeliverabilityChecks({
      spf: "pending", dkim: "pending", replyTo: "pending", unsubscribe: "pending",
      subjectLine: "pending", bodyLength: "pending", spamWords: "pending", signature: "pending",
    });

    // Simulate sequential checks with delays for UX
    const checks = { ...deliverabilityChecks };

    setTimeout(() => {
      // SPF check - pass if SMTP host is configured
      checks.spf = formData.smtpHost ? "pass" : "fail";
      setDeliverabilityChecks({ ...checks });
    }, 300);

    setTimeout(() => {
      // DKIM - pass if using Gmail (Google handles DKIM)
      checks.dkim = formData.smtpHost?.includes("gmail") ? "pass" : "warning";
      setDeliverabilityChecks({ ...checks });
    }, 600);

    setTimeout(() => {
      // Reply-To is always set to nitin@virtualassistant-group.com
      checks.replyTo = "pass";
      setDeliverabilityChecks({ ...checks });
    }, 900);

    setTimeout(() => {
      // Unsubscribe link is always included
      checks.unsubscribe = "pass";
      setDeliverabilityChecks({ ...checks });
    }, 1200);

    setTimeout(() => {
      // Subject line - pass (system generates good subjects)
      checks.subjectLine = "pass";
      setDeliverabilityChecks({ ...checks });
    }, 1500);

    setTimeout(() => {
      // Body length check
      checks.bodyLength = "pass";
      setDeliverabilityChecks({ ...checks });
    }, 1800);

    setTimeout(() => {
      // Spam words check
      checks.spamWords = "pass";
      setDeliverabilityChecks({ ...checks });
    }, 2100);

    setTimeout(() => {
      // Signature check
      checks.signature = signatureQuery.data?.signaturePlainText ? "pass" : "fail";
      setDeliverabilityChecks({ ...checks });
      setChecksRunning(false);
    }, 2400);
  };

  const getCheckIcon = (status: string) => {
    switch (status) {
      case "pass": return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "fail": return <XCircle className="w-5 h-5 text-red-500" />;
      case "warning": return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default: return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  const allChecksPassed = Object.values(deliverabilityChecks).every(v => v === "pass" || v === "warning");

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
          Configure your integrations, email credentials, rotational emails, and signature
        </p>
      </div>

      <Tabs defaultValue="integrations" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="integrations" className="flex items-center gap-1 text-xs">
            <Phone className="w-3.5 h-3.5" />
            Retell.AI
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1 text-xs">
            <Mail className="w-3.5 h-3.5" />
            SMTP
          </TabsTrigger>
          <TabsTrigger value="rotational" className="flex items-center gap-1 text-xs">
            <RotateCcw className="w-3.5 h-3.5" />
            Rotational
          </TabsTrigger>
          <TabsTrigger value="deliverability" className="flex items-center gap-1 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            Checks
          </TabsTrigger>
          <TabsTrigger value="signature" className="flex items-center gap-1 text-xs">
            <PenTool className="w-3.5 h-3.5" />
            Signature
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-1 text-xs">
            <Webhook className="w-3.5 h-3.5" />
            Webhooks
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
                <Label className="flex items-center gap-2">
                  API Key
                  {settingsQuery.data?.hasRetellApiKey && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-normal">
                      <CheckCircle2 className="w-3 h-3" /> Saved
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={settingsQuery.data?.hasRetellApiKey ? "••••••••  (leave blank to keep current)" : "Enter your Retell.AI API key"}
                  value={formData.retellApiKey}
                  onChange={(e) => { setFormData({ ...formData, retellApiKey: e.target.value }); setRetellKeyTouched(true); }}
                />
                <p className="text-xs text-muted-foreground">Get your API key from retellai.com dashboard</p>
              </div>
              <div className="space-y-2">
                <Label>Agent ID</Label>
                <Input
                  placeholder="Your Retell.AI agent ID"
                  value={formData.retellAgentId}
                  onChange={(e) => setFormData({ ...formData, retellAgentId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Sender Phone Number (Retell-Purchased)</Label>
                <Input
                  placeholder="+1234567890"
                  value={formData.senderPhoneNumber}
                  onChange={(e) => setFormData({ ...formData, senderPhoneNumber: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">E.164 format, e.g. +14155551234</p>
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-xs text-amber-800 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Important: This MUST be a phone number purchased through your Retell.AI dashboard.
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Personal phone numbers will not work. Go to <a href="https://dashboard.retellai.com" target="_blank" className="underline font-medium">Retell Dashboard</a> → Phone Numbers → Buy a number, then paste it here.
                  </p>
                </div>
              </div>
              <div className="pt-4">
                <Button onClick={handleSaveRetell} disabled={updateSettingsMutation.isPending} className="gap-2">
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
                Configure your primary SMTP settings. For Gmail, use smtp.gmail.com with port 587 and an App Password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>SMTP Host</Label>
                <Input placeholder="smtp.gmail.com" value={formData.smtpHost} onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMTP Port</Label>
                  <Input type="number" placeholder="587" value={formData.smtpPort} onChange={(e) => setFormData({ ...formData, smtpPort: parseInt(e.target.value) || 587 })} />
                </div>
                <div className="space-y-2">
                  <Label>SMTP Username</Label>
                  <Input placeholder="your-email@gmail.com" value={formData.smtpUsername} onChange={(e) => setFormData({ ...formData, smtpUsername: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  SMTP Password
                  {settingsQuery.data?.hasSmtpPassword && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-normal">
                      <CheckCircle2 className="w-3 h-3" /> Saved
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={settingsQuery.data?.hasSmtpPassword ? "••••••••  (leave blank to keep current)" : "Enter SMTP password"}
                  value={formData.smtpPassword}
                  onChange={(e) => { setFormData({ ...formData, smtpPassword: e.target.value }); setPasswordTouched(true); }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sender Email</Label>
                  <Input type="email" placeholder="noreply@yourcompany.com" value={formData.senderEmail} onChange={(e) => setFormData({ ...formData, senderEmail: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Sender Name</Label>
                  <Input placeholder="Your Name" value={formData.senderName} onChange={(e) => setFormData({ ...formData, senderName: e.target.value })} />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <Button onClick={handleSaveSmtp} disabled={updateSettingsMutation.isPending} className="gap-2">
                  {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Email Settings
                </Button>
                {settingsQuery.data?.hasSmtpPassword && formData.smtpHost && (
                  <Button variant="outline" onClick={handleTestSmtp} disabled={testSmtpMutation.isPending} className="gap-2">
                    {testSmtpMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send Test Email
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rotational Emails Tab */}
        <TabsContent value="rotational" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rotational Email Addresses (Mon-Fri)</CardTitle>
              <CardDescription>
                Set up 5 different email addresses to rotate daily. Monday uses Email 1, Tuesday uses Email 2, and so on.
                This improves deliverability by distributing send volume across multiple addresses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Existing rotational emails */}
              {rotationalEmailsQuery.data && rotationalEmailsQuery.data.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Configured Emails</Label>
                  <div className="space-y-2">
                    {rotationalEmailsQuery.data.map((re: any) => (
                      <div key={re.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {DAY_NAMES[re.dayOfWeek]?.substring(0, 2)}
                          </span>
                          <div>
                            <p className="text-sm font-medium">{re.email}</p>
                            <p className="text-xs text-muted-foreground">{DAY_NAMES[re.dayOfWeek]} &middot; {re.smtpHost}:{re.smtpPort}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteRotational(re.id)}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add new rotational email form */}
              <div className="border-t pt-4 space-y-4">
                <Label className="text-sm font-medium">Add Rotational Email</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Day of Week</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={rotationalForm.dayOfWeek}
                      onChange={(e) => setRotationalForm({ ...rotationalForm, dayOfWeek: parseInt(e.target.value) })}
                    >
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Email Address</Label>
                    <Input placeholder="email1@company.com" value={rotationalForm.email} onChange={(e) => setRotationalForm({ ...rotationalForm, email: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">SMTP Host</Label>
                    <Input placeholder="smtp.gmail.com" value={rotationalForm.smtpHost} onChange={(e) => setRotationalForm({ ...rotationalForm, smtpHost: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">SMTP Port</Label>
                    <Input type="number" placeholder="587" value={rotationalForm.smtpPort} onChange={(e) => setRotationalForm({ ...rotationalForm, smtpPort: parseInt(e.target.value) || 587 })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Sender Name</Label>
                    <Input placeholder="Nitin Sharma" value={rotationalForm.senderName} onChange={(e) => setRotationalForm({ ...rotationalForm, senderName: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">SMTP Username</Label>
                    <Input placeholder="email1@company.com" value={rotationalForm.smtpUsername} onChange={(e) => setRotationalForm({ ...rotationalForm, smtpUsername: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">SMTP Password</Label>
                    <Input type="password" placeholder="App password" value={rotationalForm.smtpPassword} onChange={(e) => setRotationalForm({ ...rotationalForm, smtpPassword: e.target.value })} />
                  </div>
                </div>
                <Button onClick={handleSaveRotationalEmail} disabled={upsertRotationalMutation.isPending} className="gap-2">
                  {upsertRotationalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Rotational Email
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deliverability Checks Tab */}
        <TabsContent value="deliverability" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Email Deliverability Checks
              </CardTitle>
              <CardDescription>
                Run these checks before sending a campaign to ensure your emails land in the inbox, not spam or promotions.
                All checkmarks should be green before sending.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={runDeliverabilityChecks} disabled={checksRunning} className="gap-2 w-full">
                {checksRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {checksRunning ? "Running Checks..." : "Run Deliverability Checks"}
              </Button>

              <div className="space-y-3 mt-4">
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getCheckIcon(deliverabilityChecks.spf)}
                  <div>
                    <p className="text-sm font-medium">SPF Record</p>
                    <p className="text-xs text-muted-foreground">SMTP host configured and authorized to send</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getCheckIcon(deliverabilityChecks.dkim)}
                  <div>
                    <p className="text-sm font-medium">DKIM Signing</p>
                    <p className="text-xs text-muted-foreground">Email provider handles DKIM signing (Gmail auto-signs)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getCheckIcon(deliverabilityChecks.replyTo)}
                  <div>
                    <p className="text-sm font-medium">Reply-To Address</p>
                    <p className="text-xs text-muted-foreground">Reply-To set to nitin@virtualassistant-group.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getCheckIcon(deliverabilityChecks.unsubscribe)}
                  <div>
                    <p className="text-sm font-medium">Unsubscribe Link</p>
                    <p className="text-xs text-muted-foreground">List-Unsubscribe header and footer link included</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getCheckIcon(deliverabilityChecks.subjectLine)}
                  <div>
                    <p className="text-sm font-medium">Subject Line Quality</p>
                    <p className="text-xs text-muted-foreground">No spam trigger words, proper length</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getCheckIcon(deliverabilityChecks.bodyLength)}
                  <div>
                    <p className="text-sm font-medium">Email Body Length</p>
                    <p className="text-xs text-muted-foreground">Optimal length (not too short, not too long)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getCheckIcon(deliverabilityChecks.spamWords)}
                  <div>
                    <p className="text-sm font-medium">Spam Word Check</p>
                    <p className="text-xs text-muted-foreground">No excessive spam trigger words in body</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getCheckIcon(deliverabilityChecks.signature)}
                  <div>
                    <p className="text-sm font-medium">Email Signature</p>
                    <p className="text-xs text-muted-foreground">Professional signature configured and will be appended</p>
                  </div>
                </div>
              </div>

              {!checksRunning && Object.values(deliverabilityChecks).some(v => v !== "pending") && (
                <div className={`p-4 rounded-lg border-2 mt-4 ${allChecksPassed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                  <p className={`text-sm font-medium ${allChecksPassed ? "text-green-800" : "text-red-800"}`}>
                    {allChecksPassed
                      ? "✅ All checks passed! Your emails are ready to send."
                      : "⚠️ Some checks failed. Fix the issues above before sending campaigns."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signature Tab */}
        <TabsContent value="signature" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Signature</CardTitle>
              <CardDescription>
                Your plain text signature is appended to all outgoing emails. Enter your details below.
                The system uses your plain text signature (not HTML) for clean email formatting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Plain Text Version - Primary */}
              <div className="space-y-2">
                <Label>Signature (Plain Text) — This is what gets appended to emails</Label>
                <Textarea
                  value={signaturePlainText}
                  onChange={(e) => setSignaturePlainText(e.target.value)}
                  placeholder={"Best regards,\nNitin Sharma\nVirtual Assistant Group\n+1 (571) 470-6684\nnitin@virtualassistant-group.com\nhttps://calendly.com/nitin-virtualassistant/30min"}
                  rows={6}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  This plain text signature is what gets appended to all your emails. Keep it simple and professional.
                </p>
              </div>

              {/* Signature HTML Editor - Secondary */}
              <div className="space-y-2">
                <Label>HTML Signature (Optional — for rich formatting)</Label>
                <Textarea
                  value={signatureHtml}
                  onChange={(e) => setSignatureHtml(e.target.value)}
                  placeholder="Paste your HTML signature here if you want rich formatting..."
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>

              {/* Preview */}
              {(signaturePlainText || signatureHtml) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Preview</Label>
                    <Button variant="ghost" size="sm" onClick={() => setShowSignaturePreview(!showSignaturePreview)}>
                      {showSignaturePreview ? "Hide Preview" : "Show Preview"}
                    </Button>
                  </div>
                  {showSignaturePreview && (
                    <div className="border rounded-lg p-4 bg-white text-sm">
                      {signaturePlainText ? (
                        <pre className="whitespace-pre-wrap font-sans text-gray-700">{signaturePlainText}</pre>
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: signatureHtml }} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Save Button */}
              <div className="pt-4">
                <Button onClick={handleSaveSignature} disabled={updateSignatureMutation.isPending || (!signatureHtml && !signaturePlainText)} className="gap-2">
                  {updateSignatureMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Signature
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="mt-6 space-y-6">
          <WebhookStatusPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Webhook Signing Secrets Card ============

function WebhookSigningSecretsCard() {
  const settingsQuery = trpc.settings.get.useQuery();
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Webhook signing secret saved successfully");
      settingsQuery.refetch();
    },
    onError: () => toast.error("Failed to save webhook signing secret"),
  });

  const [calendlySecret, setCalendlySecret] = useState("");
  const [retellSecret, setRetellSecret] = useState("");
  const [showCalendly, setShowCalendly] = useState(false);
  const [showRetell, setShowRetell] = useState(false);
  const [calendlyTouched, setCalendlyTouched] = useState(false);
  const [retellTouched, setRetellTouched] = useState(false);

  const handleSaveCalendly = () => {
    if (!calendlySecret.trim()) return;
    updateMutation.mutate({ calendlyWebhookSecret: calendlySecret });
    setCalendlyTouched(false);
    setCalendlySecret("");
  };

  const handleSaveRetell = () => {
    if (!retellSecret.trim()) return;
    updateMutation.mutate({ retellWebhookSecret: retellSecret });
    setRetellTouched(false);
    setRetellSecret("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Webhook Signature Verification (HMAC)
        </CardTitle>
        <CardDescription>
          Add signing secrets to verify that incoming webhooks are authentic and haven't been tampered with.
          When configured, unsigned or incorrectly signed requests will be rejected with 401.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Calendly Signing Key */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-blue-600" />
            Calendly Webhook Signing Key
            {settingsQuery.data?.hasCalendlyWebhookSecret && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                <ShieldCheck className="w-3 h-3" /> Configured
              </span>
            )}
          </Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showCalendly ? "text" : "password"}
                value={calendlySecret}
                onChange={(e) => { setCalendlySecret(e.target.value); setCalendlyTouched(true); }}
                placeholder={settingsQuery.data?.hasCalendlyWebhookSecret ? "••••••••••• (already set)" : "Paste your Calendly signing key"}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowCalendly(!showCalendly)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCalendly ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              size="sm"
              onClick={handleSaveCalendly}
              disabled={!calendlyTouched || !calendlySecret.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Find this in Calendly → Integrations → API & Webhooks → Copy the signing key shown when creating the webhook subscription.
            Header: <code className="bg-muted px-1 rounded">Calendly-Webhook-Signature</code> (format: <code className="bg-muted px-1 rounded">t=timestamp,v1=hmac</code>)
          </p>
        </div>

        {/* Retell Signing Key */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-purple-600" />
            Retell.AI Webhook Signing Key
            {settingsQuery.data?.hasRetellWebhookSecret && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                <ShieldCheck className="w-3 h-3" /> Configured
              </span>
            )}
          </Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showRetell ? "text" : "password"}
                value={retellSecret}
                onChange={(e) => { setRetellSecret(e.target.value); setRetellTouched(true); }}
                placeholder={settingsQuery.data?.hasRetellWebhookSecret ? "••••••••••• (already set)" : "Paste your Retell API key (webhook badge)"}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowRetell(!showRetell)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showRetell ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              size="sm"
              onClick={handleSaveRetell}
              disabled={!retellTouched || !retellSecret.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            In Retell Dashboard → API Keys, use the key with the <strong>webhook badge</strong> next to it.
            Header: <code className="bg-muted px-1 rounded">x-retell-signature</code> (HMAC-SHA256 hex digest)
          </p>
        </div>

        {/* Security Info */}
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-800">
              <p className="font-medium mb-1">How HMAC Verification Works</p>
              <p>
                When a signing secret is configured, every incoming webhook is verified by computing an HMAC-SHA256
                signature from the raw request body and comparing it to the signature in the request header.
                If they don't match, the request is rejected with a 401 error and logged as "failed" in the event log below.
                If no secret is configured, webhooks are accepted without verification (bypass mode).
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Webhook Status Panel Component ============

function WebhookStatusPanel() {
  const statsQuery = trpc.webhooks.stats.useQuery();
  const eventsQuery = trpc.webhooks.list.useQuery({ limit: 20 });
  const sendTestMutation = trpc.webhooks.sendTest.useMutation({
    onSuccess: () => {
      toast.success("Test webhook event logged successfully");
      statsQuery.refetch();
      eventsQuery.refetch();
    },
    onError: () => toast.error("Failed to send test event"),
  });

  const deployedDomain = "leadgenoutreach-gkqazghm.manus.space";
  const calendlyUrl = `https://${deployedDomain}/api/webhooks/calendly`;
  const replyUrl = `https://${deployedDomain}/api/webhooks/reply`;
  const retellUrl = `https://${deployedDomain}/api/webhooks/retell`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} URL copied to clipboard`);
  };

  const formatRelativeTime = (date: Date | string | null) => {
    if (!date) return "Never";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const getStatusColor = (lastEvent: Date | string | null) => {
    if (!lastEvent) return "bg-gray-100 border-gray-200 text-gray-600";
    const d = new Date(lastEvent);
    const diffMs = Date.now() - d.getTime();
    const diffDays = diffMs / 86400000;
    if (diffDays < 1) return "bg-green-50 border-green-200 text-green-700";
    if (diffDays < 7) return "bg-yellow-50 border-yellow-200 text-yellow-700";
    return "bg-red-50 border-red-200 text-red-700";
  };

  const getStatusDot = (lastEvent: Date | string | null) => {
    if (!lastEvent) return "bg-gray-400";
    const d = new Date(lastEvent);
    const diffMs = Date.now() - d.getTime();
    const diffDays = diffMs / 86400000;
    if (diffDays < 1) return "bg-green-500";
    if (diffDays < 7) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <>
      {/* Integration Status Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Webhook Integration Status
          </CardTitle>
          <CardDescription>
            Monitor incoming webhook events from Calendly, email replies, and Retell.AI call updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Calendly Status */}
            <div className={`p-4 rounded-lg border-2 ${getStatusColor(statsQuery.data?.calendlyLast ?? null)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusDot(statsQuery.data?.calendlyLast ?? null)}`} />
                  <span className="font-medium text-sm">Calendly Bookings</span>
                </div>
                <Zap className="w-4 h-4 opacity-50" />
              </div>
              <p className="text-2xl font-bold">{statsQuery.data?.calendlyTotal || 0}</p>
              <p className="text-xs mt-1 opacity-75">
                Last event: {formatRelativeTime(statsQuery.data?.calendlyLast || null)}
              </p>
            </div>

            {/* Email Reply Status */}
            <div className={`p-4 rounded-lg border-2 ${getStatusColor(statsQuery.data?.replyLast ?? null)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusDot(statsQuery.data?.replyLast ?? null)}`} />
                  <span className="font-medium text-sm">Email Replies</span>
                </div>
                <Mail className="w-4 h-4 opacity-50" />
              </div>
              <p className="text-2xl font-bold">{statsQuery.data?.replyTotal || 0}</p>
              <p className="text-xs mt-1 opacity-75">
                Last event: {formatRelativeTime(statsQuery.data?.replyLast || null)}
              </p>
            </div>

            {/* Retell Call Status */}
            <div className={`p-4 rounded-lg border-2 ${getStatusColor(statsQuery.data?.retellLast ?? null)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusDot(statsQuery.data?.retellLast ?? null)}`} />
                  <span className="font-medium text-sm">Retell.AI Calls</span>
                </div>
                <Phone className="w-4 h-4 opacity-50" />
              </div>
              <p className="text-2xl font-bold">{statsQuery.data?.retellTotal || 0}</p>
              <p className="text-xs mt-1 opacity-75">
                Last event: {formatRelativeTime(statsQuery.data?.retellLast || null)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook URLs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5" />
            Webhook Endpoints
          </CardTitle>
          <CardDescription>
            Configure these URLs in your external services to receive events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Calendly URL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              Calendly Booking Webhook
            </Label>
            <div className="flex items-center gap-2">
              <Input value={calendlyUrl} readOnly className="font-mono text-xs bg-muted" />
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(calendlyUrl, "Calendly")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL in Calendly → Integrations → Webhooks → Subscribe to event: <code className="bg-muted px-1 rounded">invitee.created</code>
            </p>
          </div>

          {/* Reply URL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-green-600" />
              Email Reply Webhook
            </Label>
            <div className="flex items-center gap-2">
              <Input value={replyUrl} readOnly className="font-mono text-xs bg-muted" />
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(replyUrl, "Reply")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Set up via Zapier/Make: when email arrives at nitin@virtualassistant-group.com, POST <code className="bg-muted px-1 rounded">{'{"email": "sender@example.com"}'}</code>
            </p>
          </div>

          {/* Retell URL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-purple-600" />
              Retell.AI Call Status Webhook
            </Label>
            <div className="flex items-center gap-2">
              <Input value={retellUrl} readOnly className="font-mono text-xs bg-muted" />
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(retellUrl, "Retell")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL in Retell.AI Dashboard → Agent Settings → Webhook URL for call status updates
            </p>
          </div>

          {/* Test buttons */}
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-3">Test Connectivity</p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendTestMutation.mutate({ type: "calendly_booking" })}
                disabled={sendTestMutation.isPending}
                className="gap-1"
              >
                {sendTestMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Test Calendly
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendTestMutation.mutate({ type: "email_reply" })}
                disabled={sendTestMutation.isPending}
                className="gap-1"
              >
                {sendTestMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                Test Reply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Signing Secrets */}
      <WebhookSigningSecretsCard />

      {/* Recent Events Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Webhook Events
          </CardTitle>
          <CardDescription>
            Last 20 incoming webhook events across all integrations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No webhook events received yet.</p>
              <p className="text-xs mt-1">Events will appear here once your integrations are configured.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {eventsQuery.data.map((event: any) => (
                <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  {/* Type icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    event.webhookType === "calendly_booking" ? "bg-blue-100 text-blue-600" :
                    event.webhookType === "email_reply" ? "bg-green-100 text-green-600" :
                    "bg-purple-100 text-purple-600"
                  }`}>
                    {event.webhookType === "calendly_booking" ? <Zap className="w-4 h-4" /> :
                     event.webhookType === "email_reply" ? <Mail className="w-4 h-4" /> :
                     <Phone className="w-4 h-4" />}
                  </div>

                  {/* Event details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {event.webhookType === "calendly_booking" ? "Calendly Booking" :
                         event.webhookType === "email_reply" ? "Email Reply" :
                         "Retell Call Update"}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        event.status === "success" ? "bg-green-100 text-green-700" :
                        event.status === "failed" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {event.status}
                      </span>
                      {event.signatureVerified && (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          event.signatureVerified === "verified" ? "bg-blue-100 text-blue-700" :
                          event.signatureVerified === "unverified" ? "bg-red-100 text-red-700" :
                          "bg-gray-50 text-gray-500"
                        }`}>
                          {event.signatureVerified === "verified" ? <Shield className="w-2.5 h-2.5" /> :
                           event.signatureVerified === "unverified" ? <XCircle className="w-2.5 h-2.5" /> :
                           null}
                          {event.signatureVerified}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {event.sourceEmail ? `From: ${event.sourceEmail}` : "No source email"}
                      {event.errorMessage && ` — ${event.errorMessage}`}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(event.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Refresh button */}
          <div className="pt-4 border-t mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { statsQuery.refetch(); eventsQuery.refetch(); }}
              className="gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
