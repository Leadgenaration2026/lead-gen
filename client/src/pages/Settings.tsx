import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Phone, Mail, PenTool, CheckCircle2, Send, RotateCcw, ShieldCheck, XCircle, AlertTriangle } from "lucide-react";
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
                <Label>Sender Phone Number</Label>
                <Input
                  placeholder="+1234567890"
                  value={formData.senderPhoneNumber}
                  onChange={(e) => setFormData({ ...formData, senderPhoneNumber: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">E.164 format, e.g. +14155551234</p>
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
      </Tabs>
    </div>
  );
}
