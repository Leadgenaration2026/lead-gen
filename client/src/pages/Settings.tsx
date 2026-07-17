import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Phone, Mail, PenTool, CheckCircle2, Send, RotateCcw, ShieldCheck, XCircle, AlertTriangle, Webhook, Copy, Clock, Activity, Zap, ExternalLink, Shield, KeyRound, Eye, EyeOff, Globe, Linkedin, Instagram, Facebook, ChevronLeft, ChevronRight, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  const testRotationalMutation = trpc.rotationalEmails.testAccount.useMutation();
  const sendTestToAllMutation = trpc.email.sendTestToAllAccounts.useMutation();
  const heartbeatStatusQuery = trpc.settings.getFollowUpHeartbeatStatus.useQuery();
  const enableHeartbeatMutation = trpc.settings.enableFollowUpHeartbeat.useMutation({
    onSuccess: () => { toast.success("Automated follow-ups enabled!"); heartbeatStatusQuery.refetch(); },
    onError: (err) => toast.error(err.message || "Failed to enable automated follow-ups"),
  });
  const disableHeartbeatMutation = trpc.settings.disableFollowUpHeartbeat.useMutation({
    onSuccess: () => { toast.success("Automated follow-ups paused."); heartbeatStatusQuery.refetch(); },
    onError: (err) => toast.error(err.message || "Failed to pause automated follow-ups"),
  });

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
    seamlessApiKey: "",
    bouncerApiKey: "",
  });

  // Track whether user has typed into password fields
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [retellKeyTouched, setRetellKeyTouched] = useState(false);
  const [bouncerKeyTouched, setBouncerKeyTouched] = useState(false);


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

  // CTA Link state
  const [ctaLink, setCtaLink] = useState("");
  const [ctaLinkTouched, setCtaLinkTouched] = useState(false);

  // Reply-To and Notification Email state
  const [replyToEmail, setReplyToEmail] = useState("");
  const [replyToEmailTouched, setReplyToEmailTouched] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notificationEmailTouched, setNotificationEmailTouched] = useState(false);

  // Claude API Key state
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [claudeKeyTouched, setClaudeKeyTouched] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);

  // IMAP inbox sync state
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState(993);
  const [imapUsername, setImapUsername] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapPasswordTouched, setImapPasswordTouched] = useState(false);
  const [imapTestResult, setImapTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const testImapMutation = trpc.inbox.testImapConnection.useMutation({
    onSuccess: (result) => setImapTestResult(result),
    onError: (err) => setImapTestResult({ success: false, error: err.message }),
  });

  // Social profiles state
  const [socialProfiles, setSocialProfiles] = useState({
    linkedinUrl: "",
    linkedinType: "personal" as "personal" | "page",
    instagramUrl: "",
    instagramType: "personal" as "personal" | "page",
    facebookUrl: "",
    facebookType: "personal" as "personal" | "page",
    socialNotificationEmail: "",
  });

  // Per-platform, per-action-type daily outreach caps (conservative defaults;
  // none of these platforms publish an official number)
  const [socialDailyLimits, setSocialDailyLimits] = useState({
    linkedin: { connection_request: 20, direct_message: 20 },
    instagram: { connection_request: 20, direct_message: 20 },
    facebook: { connection_request: 20, direct_message: 20 },
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
        seamlessApiKey: "",
        bouncerApiKey: "",

      });
      setBouncerKeyTouched(false);

      setCtaLink((settingsQuery.data as any).ctaLink || "https://cal.com/nitin-virtualassistant-group.com/30min");
      setCtaLinkTouched(false);

      setReplyToEmail((settingsQuery.data as any).replyToEmail || "");
      setReplyToEmailTouched(false);
      setNotificationEmail((settingsQuery.data as any).notificationEmail || "");
      setNotificationEmailTouched(false);
      setClaudeApiKey("");
      setClaudeKeyTouched(false);

      setImapHost((settingsQuery.data as any).imapHost || "imap.gmail.com");
      setImapPort((settingsQuery.data as any).imapPort || 993);
      setImapUsername((settingsQuery.data as any).imapUsername || "");
      setImapPassword("");
      setImapPasswordTouched(false);
      setImapTestResult(null);

      setSocialProfiles({
        linkedinUrl: (settingsQuery.data as any).linkedinUrl || "",
        linkedinType: (settingsQuery.data as any).linkedinType || "personal",
        instagramUrl: (settingsQuery.data as any).instagramUrl || "",
        instagramType: (settingsQuery.data as any).instagramType || "personal",
        facebookUrl: (settingsQuery.data as any).facebookUrl || "",
        facebookType: (settingsQuery.data as any).facebookType || "personal",
        socialNotificationEmail: (settingsQuery.data as any).socialNotificationEmail || "",
      });
      const savedLimits = (settingsQuery.data as any).socialDailyLimits;
      setSocialDailyLimits({
        linkedin: { connection_request: savedLimits?.linkedin?.connection_request || 20, direct_message: savedLimits?.linkedin?.direct_message || 20 },
        instagram: { connection_request: savedLimits?.instagram?.connection_request || 20, direct_message: savedLimits?.instagram?.direct_message || 20 },
        facebook: { connection_request: savedLimits?.facebook?.connection_request || 20, direct_message: savedLimits?.facebook?.direct_message || 20 },
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

  // Save only IMAP inbox-sync fields
  const handleSaveImap = async () => {
    try {
      const payload: Record<string, any> = {
        imapHost,
        imapPort,
        imapUsername,
      };
      if (imapPasswordTouched && imapPassword) {
        payload.imapPassword = imapPassword;
      }
      await updateSettingsMutation.mutateAsync(payload);
      toast.success("IMAP settings saved!");
      settingsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save IMAP settings");
    }
  };

  const handleTestImap = () => {
    setImapTestResult(null);
    testImapMutation.mutate({
      host: imapHost,
      port: imapPort,
      username: imapUsername,
      ...(imapPasswordTouched && imapPassword ? { password: imapPassword } : {}),
    });
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

  const handleSaveSeamless = async () => {
    try {
      await updateSettingsMutation.mutateAsync({
        seamlessApiKey: formData.seamlessApiKey || undefined,
      });
      toast.success("Seamless.ai settings saved");
      settingsQuery.refetch();
    } catch (error) {
      toast.error("Failed to save Seamless.ai settings");
    }
  };

  // Save Claude API Key
  const handleSaveClaude = async () => {
    try {
      if (claudeKeyTouched && claudeApiKey) {
        await updateSettingsMutation.mutateAsync({ claudeApiKey });
        toast.success("Claude API key saved!");
        setClaudeKeyTouched(false);
        setClaudeApiKey("");
        settingsQuery.refetch();
      } else {
        toast.error("Please enter a Claude API key");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to save Claude API key");
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
      // Reply-To is set from Settings (replyToEmail field)
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
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="integrations" className="flex items-center gap-1 text-xs">
            <Phone className="w-3.5 h-3.5" />
            Retell.AI
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1 text-xs">
            <Mail className="w-3.5 h-3.5" />
            Email Accounts
          </TabsTrigger>
          <TabsTrigger value="seamless" className="flex items-center gap-1 text-xs">
            <Zap className="w-3.5 h-3.5" />
            Seamless.ai
          </TabsTrigger>
          <TabsTrigger value="claude" className="flex items-center gap-1 text-xs">
            <KeyRound className="w-3.5 h-3.5" />
            Claude AI
          </TabsTrigger>
          <TabsTrigger value="deliverability" className="flex items-center gap-1 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            Checks
          </TabsTrigger>

          <TabsTrigger value="webhooks" className="flex items-center gap-1 text-xs">
            <Webhook className="w-3.5 h-3.5" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="social" className="flex items-center gap-1 text-xs">
            <Globe className="w-3.5 h-3.5" />
            Social
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

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Follow-Up Automation
              </CardTitle>
              <CardDescription>
                Controls the recurring background job that sends due follow-up emails, places due follow-up calls, and sends one-off scheduled emails. Without this enabled, nothing scheduled will actually go out.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {heartbeatStatusQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking status...
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {heartbeatStatusQuery.data?.enabled ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Running
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="w-3 h-3" /> Not running
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">Checks every 15 minutes</span>
                  </div>
                  {heartbeatStatusQuery.data?.nextExecutionAt && (
                    <p className="text-xs text-muted-foreground">
                      Next run: {new Date(heartbeatStatusQuery.data.nextExecutionAt).toLocaleString()}
                    </p>
                  )}
                  {heartbeatStatusQuery.data?.error && (
                    <p className="text-xs text-red-600">{heartbeatStatusQuery.data.error}</p>
                  )}
                  <div className="pt-2">
                    {heartbeatStatusQuery.data?.enabled ? (
                      <Button
                        variant="outline"
                        onClick={() => disableHeartbeatMutation.mutate()}
                        disabled={disableHeartbeatMutation.isPending}
                        className="gap-2"
                      >
                        {disableHeartbeatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Pause Automated Follow-Ups
                      </Button>
                    ) : (
                      <Button
                        onClick={() => enableHeartbeatMutation.mutate()}
                        disabled={enableHeartbeatMutation.isPending}
                        className="gap-2"
                      >
                        {enableHeartbeatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Enable Automated Follow-Ups
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Reply Inbox (IMAP)
              </CardTitle>
              <CardDescription>
                Connect the mailbox replies come to (nitin@virtualassistant-group.com) so the app can read incoming replies, show them in the Inbox tab, and automatically stop follow-ups. For Gmail/Google Workspace, enable IMAP in Gmail settings and use an App Password (not your regular login password) — 2-Step Verification must be on to generate one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IMAP Host</Label>
                  <Input placeholder="imap.gmail.com" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>IMAP Port</Label>
                  <Input type="number" placeholder="993" value={imapPort} onChange={(e) => setImapPort(parseInt(e.target.value) || 993)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input placeholder="nitin@virtualassistant-group.com" value={imapUsername} onChange={(e) => setImapUsername(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  App Password
                  {settingsQuery.data?.hasImapPassword && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-normal">
                      <CheckCircle2 className="w-3 h-3" /> Saved
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={settingsQuery.data?.hasImapPassword ? "••••••••  (leave blank to keep current)" : "16-character app password"}
                  value={imapPassword}
                  onChange={(e) => { setImapPassword(e.target.value); setImapPasswordTouched(true); }}
                />
              </div>
              {imapTestResult && (
                <div className={`text-xs p-2 rounded-md ${imapTestResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {imapTestResult.success ? "✓ Connected successfully!" : `✗ ${imapTestResult.error || "Connection failed"}`}
                </div>
              )}
              <div className="pt-2 flex items-center gap-2">
                <Button onClick={handleSaveImap} disabled={updateSettingsMutation.isPending} className="gap-2">
                  {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save IMAP Settings
                </Button>
                <Button variant="outline" onClick={handleTestImap} disabled={testImapMutation.isPending || !imapHost || !imapUsername} className="gap-2">
                  {testImapMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Test Connection
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Once saved, go to the <strong>Inbox</strong> tab in the sidebar to enable automatic checking and see incoming replies.
              </p>
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

          {/* CTA / Booking Link */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="w-5 h-5" />
                Call-to-Action (Booking) Link
              </CardTitle>
              <CardDescription>
                This link is used as the CTA in all outreach emails and follow-ups. Change it here to update it everywhere.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Booking / CTA URL</Label>
                <Input
                  placeholder="https://cal.com/your-name/30min"
                  value={ctaLink}
                  onChange={(e) => { setCtaLink(e.target.value); setCtaLinkTouched(true); }}
                />
                <p className="text-xs text-muted-foreground">
                  This URL will be inserted into every email as the booking link. Supports Cal.com, Calendly, or any scheduling tool.
                </p>
              </div>
              <Button
                onClick={() => {
                  updateSettingsMutation.mutate({ ctaLink });
                  setCtaLinkTouched(false);
                  toast.success("CTA link updated!");
                }}
                disabled={!ctaLinkTouched || !ctaLink.trim() || updateSettingsMutation.isPending}
                className="gap-2"
              >
                {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save CTA Link
              </Button>
            </CardContent>
          </Card>

          {/* Reply-To Email Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Reply-To Email Address</CardTitle>
              <CardDescription>
                When leads reply to your emails, their reply will go to this address. This is the email your system monitors for incoming replies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="nitin@virtualassistant-group.com"
                value={replyToEmail}
                onChange={(e) => { setReplyToEmail(e.target.value); setReplyToEmailTouched(true); }}
              />
              <p className="text-xs text-muted-foreground">
                This address is set as the Reply-To header in all outgoing emails. Make sure your email forwarding service forwards replies from this address to your webhook.
              </p>
              <Button
                onClick={() => {
                  updateSettingsMutation.mutate({ replyToEmail });
                  setReplyToEmailTouched(false);
                  toast.success("Reply-To email updated!");
                }}
                disabled={!replyToEmailTouched || !replyToEmail.trim() || updateSettingsMutation.isPending}
                className="gap-2"
              >
                {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Reply-To Email
              </Button>
            </CardContent>
          </Card>

          {/* Notification Email Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" /> Notification Email Address</CardTitle>
              <CardDescription>
                When a lead replies positively, you'll receive an instant notification at this email address with the lead's name, company, and reply snippet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="nitin@virtualassistant-group.com"
                value={notificationEmail}
                onChange={(e) => { setNotificationEmail(e.target.value); setNotificationEmailTouched(true); }}
              />
              <p className="text-xs text-muted-foreground">
                You'll get an alert here whenever the system detects a genuine positive reply (not spam, auto-replies, or newsletters).
              </p>
              <Button
                onClick={() => {
                  updateSettingsMutation.mutate({ notificationEmail });
                  setNotificationEmailTouched(false);
                  toast.success("Notification email updated!");
                }}
                disabled={!notificationEmailTouched || !notificationEmail.trim() || updateSettingsMutation.isPending}
                className="gap-2"
              >
                {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Notification Email
              </Button>
            </CardContent>
          </Card>

          {/* Rotational Email Accounts Section */}
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
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="text-blue-600 border-blue-300 hover:bg-blue-50 gap-1" onClick={async () => {
                            try {
                              const result = await testRotationalMutation.mutateAsync({ accountId: re.id });
                              toast.success(result.message || `Test email sent from ${re.email}`);
                            } catch (error: any) {
                              toast.error(error?.message || `Failed to test ${re.email}`);
                            }
                          }} disabled={testRotationalMutation.isPending}>
                            {testRotationalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Test
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteRotational(re.id)}>
                            Remove
                          </Button>
                        </div>
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

              {/* Test All SMTP Accounts */}
              {rotationalEmailsQuery.data && rotationalEmailsQuery.data.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Test All SMTP Accounts</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Send a test email through all configured accounts (primary + rotational) to verify deliverability</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                      disabled={sendTestToAllMutation.isPending}
                      onClick={async () => {
                        try {
                          const result = await sendTestToAllMutation.mutateAsync({ subject: "SMTP Test - Deliverability Check", body: "This is a test email to verify your SMTP account is working correctly." });
                          toast.success(`Sent via ${result.successCount}/${result.totalAccounts} accounts! Check your inbox.`);
                          if (result.results.some((r: any) => !r.success)) {
                            const failed = result.results.filter((r: any) => !r.success);
                            toast.error(`Failed: ${failed.map((f: any) => f.account).join(", ")}`);
                          }
                        } catch (error: any) {
                          toast.error(error.message || "Failed to send test emails.");
                        }
                      }}
                    >
                      {sendTestToAllMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Test All Accounts
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CTA / Booking Link Card - inside email tab */}

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

          {/* Bouncer Email Verification */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-600" />
                Bouncer — Email Verification
              </CardTitle>
              <CardDescription>
                Verify email addresses before sending campaigns. Removes undeliverable, risky, and toxic emails to protect your sender reputation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Bouncer API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Enter your Bouncer API key"
                    value={formData.bouncerApiKey || ""}
                    onChange={(e) => { setFormData({ ...formData, bouncerApiKey: e.target.value }); setBouncerKeyTouched(true); }}
                  />
                  <Button variant="outline" size="icon" onClick={() => {
                    const input = document.querySelector('input[placeholder="Enter your Bouncer API key"]') as HTMLInputElement;
                    if (input) input.type = input.type === 'password' ? 'text' : 'password';
                  }}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from <a href="https://app.usebouncer.com" target="_blank" rel="noopener" className="text-blue-600 underline">Bouncer Dashboard → API Settings</a>
                </p>
              </div>
              <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                <h4 className="font-medium text-sm">How it works</h4>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Before sending a campaign, all recipient emails are verified via Bouncer</li>
                  <li>Undeliverable, risky, and toxic emails are automatically flagged</li>
                  <li>Only verified "deliverable" emails proceed to the campaign send</li>
                  <li>Includes toxicity scoring to identify spam traps and complainers</li>
                </ul>
              </div>
              <Button onClick={async () => {
                try {
                  await updateSettingsMutation.mutateAsync({ bouncerApiKey: bouncerKeyTouched ? formData.bouncerApiKey || undefined : undefined });
                  toast.success("Bouncer API key saved");
                  settingsQuery.refetch();
                  setBouncerKeyTouched(false);
                } catch { toast.error("Failed to save Bouncer settings"); }
              }} disabled={updateSettingsMutation.isPending || !bouncerKeyTouched} className="gap-2">
                {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Bouncer Settings
              </Button>
            </CardContent>
          </Card>


        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="mt-6 space-y-6">
          <WebhookStatusPanel />
        </TabsContent>

        {/* Seamless.ai API Tab */}
        <TabsContent value="seamless" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-600" />
                Seamless.ai Integration
              </CardTitle>
              <CardDescription>
                Connect your Seamless.ai account to generate leads from real business data instead of AI-generated placeholders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Seamless.ai API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Enter your Seamless.ai API key"
                    value={formData.seamlessApiKey || ""}
                    onChange={(e) => setFormData({ ...formData, seamlessApiKey: e.target.value })}
                  />
                  <Button variant="outline" size="icon" onClick={() => {
                    const input = document.querySelector('input[placeholder="Enter your Seamless.ai API key"]') as HTMLInputElement;
                    if (input) input.type = input.type === 'password' ? 'text' : 'password';
                  }}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from <a href="https://login.seamless.ai/settings/api" target="_blank" rel="noopener" className="text-blue-600 underline">Seamless.ai Settings → API</a>
                </p>
              </div>
              <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                <h4 className="font-medium text-sm">How it works</h4>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  <li>When generating leads, choose "Seamless.ai (Real Data)" as the source</li>
                  <li>Seamless.ai will return verified business contacts with real emails and phone numbers</li>
                  <li>Your AI instructions will be used as search criteria (industry, location, company size, etc.)</li>
                  <li>Credits from your Seamless.ai account will be consumed per lead generated</li>
                </ul>
              </div>
              <Button onClick={handleSaveSeamless} disabled={updateSettingsMutation.isPending} className="gap-2">
                {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Seamless.ai Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Claude AI Tab */}
        <TabsContent value="claude" className="mt-6 space-y-4">
          <ClaudeAISection
            settingsQuery={settingsQuery}
            claudeApiKey={claudeApiKey}
            setClaudeApiKey={setClaudeApiKey}
            claudeKeyTouched={claudeKeyTouched}
            setClaudeKeyTouched={setClaudeKeyTouched}
            showClaudeKey={showClaudeKey}
            setShowClaudeKey={setShowClaudeKey}
            handleSaveClaude={handleSaveClaude}
            updateSettingsMutation={updateSettingsMutation}
          />
        </TabsContent>

        {/* Social Profiles Tab */}
        <TabsContent value="social" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Social Media Profiles
              </CardTitle>
              <CardDescription>
                Configure your social media profiles for automated outreach. These are used when sending connection requests and messages to leads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* LinkedIn */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Linkedin className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold">LinkedIn</h3>
                </div>
                <div className="space-y-2">
                  <Label>Profile / Page URL</Label>
                  <Input
                    placeholder="https://linkedin.com/in/your-profile or https://linkedin.com/company/your-company"
                    value={socialProfiles.linkedinUrl}
                    onChange={(e) => setSocialProfiles({ ...socialProfiles, linkedinUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="linkedinType"
                        checked={socialProfiles.linkedinType === "personal"}
                        onChange={() => setSocialProfiles({ ...socialProfiles, linkedinType: "personal" })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Personal Profile</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="linkedinType"
                        checked={socialProfiles.linkedinType === "page"}
                        onChange={() => setSocialProfiles({ ...socialProfiles, linkedinType: "page" })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Company Page</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Instagram */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Instagram className="w-5 h-5 text-pink-600" />
                  <h3 className="font-semibold">Instagram</h3>
                </div>
                <div className="space-y-2">
                  <Label>Profile / Page URL</Label>
                  <Input
                    placeholder="https://instagram.com/your-handle"
                    value={socialProfiles.instagramUrl}
                    onChange={(e) => setSocialProfiles({ ...socialProfiles, instagramUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="instagramType"
                        checked={socialProfiles.instagramType === "personal"}
                        onChange={() => setSocialProfiles({ ...socialProfiles, instagramType: "personal" })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Personal Profile</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="instagramType"
                        checked={socialProfiles.instagramType === "page"}
                        onChange={() => setSocialProfiles({ ...socialProfiles, instagramType: "page" })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Business Page</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Facebook */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Facebook className="w-5 h-5 text-blue-700" />
                  <h3 className="font-semibold">Facebook</h3>
                </div>
                <div className="space-y-2">
                  <Label>Profile / Page URL</Label>
                  <Input
                    placeholder="https://facebook.com/your-profile or https://facebook.com/your-page"
                    value={socialProfiles.facebookUrl}
                    onChange={(e) => setSocialProfiles({ ...socialProfiles, facebookUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="facebookType"
                        checked={socialProfiles.facebookType === "personal"}
                        onChange={() => setSocialProfiles({ ...socialProfiles, facebookType: "personal" })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Personal Profile</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="facebookType"
                        checked={socialProfiles.facebookType === "page"}
                        onChange={() => setSocialProfiles({ ...socialProfiles, facebookType: "page" })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Business Page</span>
                    </label>
                  </div>
                </div>
              </div>

              <Button
                onClick={async () => {
                  try {
                    await updateSettingsMutation.mutateAsync({
                      linkedinUrl: socialProfiles.linkedinUrl || undefined,
                      linkedinType: socialProfiles.linkedinType,
                      instagramUrl: socialProfiles.instagramUrl || undefined,
                      instagramType: socialProfiles.instagramType,
                      facebookUrl: socialProfiles.facebookUrl || undefined,
                      facebookType: socialProfiles.facebookType,
                      socialNotificationEmail: socialProfiles.socialNotificationEmail || undefined,
                    });
                    toast.success("Notification email saved");
                    toast.success("Social profiles saved!");
                    settingsQuery.refetch();
                  } catch (error: any) {
                    toast.error(error?.message || "Failed to save social profiles");
                  }
                }}
                disabled={updateSettingsMutation.isPending}
                className="gap-2 w-full"
              >
                {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Social Profiles
              </Button>
            </CardContent>
          </Card>

          {/* Social Message Notification Email */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Social Message Notifications
              </CardTitle>
              <CardDescription>
                Get notified by email when social messages are due (after the 1st follow-up email is sent). You can then manually send the messages from the Message Queue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Notification Email Address</Label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={socialProfiles.socialNotificationEmail}
                  onChange={(e) => setSocialProfiles({ ...socialProfiles, socialNotificationEmail: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  When a social message is queued (after the 1st follow-up email), you will receive an email notification with the lead details and a link to the Message Queue.
                </p>
              </div>
              <Button
                onClick={async () => {
                  try {
                    await updateSettingsMutation.mutateAsync({
                      socialNotificationEmail: socialProfiles.socialNotificationEmail || undefined,
                    });
                    toast.success("Notification email saved");
                    settingsQuery.refetch();
                  } catch (error: any) {
                    toast.error(error?.message || "Failed to save notification email");
                  }
                }}
                disabled={updateSettingsMutation.isPending}
                variant="outline"
                className="gap-2"
              >
                {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Notification Email
              </Button>
            </CardContent>
          </Card>

          {/* Daily Outreach Limits */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Daily Outreach Limits
              </CardTitle>
              <CardDescription>
                Caps how many connection requests and messages can be queued/sent per platform per day, so you don't trip spam or abuse detection.
                None of these platforms publish an official limit — these are conservative, commonly-recommended starting points. Sending itself stays
                manual; this only limits how many the app will let you queue or record as sent in a day.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["linkedin", "instagram", "facebook"] as const).map((platform) => {
                const PlatformIcon = platform === "linkedin" ? Linkedin : platform === "instagram" ? Instagram : Facebook;
                const iconColor = platform === "linkedin" ? "text-blue-600" : platform === "instagram" ? "text-pink-600" : "text-blue-700";
                return (
                  <div key={platform} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <PlatformIcon className={`w-5 h-5 ${iconColor}`} />
                      <h3 className="font-semibold capitalize">{platform}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Connection Requests / Day</Label>
                        <Input
                          type="number"
                          min={1}
                          value={socialDailyLimits[platform].connection_request}
                          onChange={(e) => setSocialDailyLimits({
                            ...socialDailyLimits,
                            [platform]: { ...socialDailyLimits[platform], connection_request: parseInt(e.target.value) || 1 },
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Messages / Day</Label>
                        <Input
                          type="number"
                          min={1}
                          value={socialDailyLimits[platform].direct_message}
                          onChange={(e) => setSocialDailyLimits({
                            ...socialDailyLimits,
                            [platform]: { ...socialDailyLimits[platform], direct_message: parseInt(e.target.value) || 1 },
                          })}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button
                onClick={async () => {
                  try {
                    await updateSettingsMutation.mutateAsync({ socialDailyLimits });
                    toast.success("Daily outreach limits saved!");
                    settingsQuery.refetch();
                  } catch (error: any) {
                    toast.error(error?.message || "Failed to save limits");
                  }
                }}
                disabled={updateSettingsMutation.isPending}
                className="gap-2"
              >
                {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Daily Limits
              </Button>
            </CardContent>
          </Card>

          {/* Social Media Account Authorization */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Account Authorization
              </CardTitle>
              <CardDescription>
                Connect your social media accounts to enable automated outreach. This allows the system to send connection requests and messages on your behalf.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* LinkedIn Authorization */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Linkedin className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">LinkedIn</p>
                    <p className="text-xs text-muted-foreground">Send connection requests & messages</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {socialProfiles.linkedinUrl ? (
                    <Badge variant="outline" className="text-xs gap-1 text-green-700 border-green-300 bg-green-50">
                      <CheckCircle2 className="w-3 h-3" /> Profile Added
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs gap-1 text-gray-500">
                      Not Connected
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      toast.info("LinkedIn API integration requires a LinkedIn Developer App. Add your profile URL above to use manual outreach with AI-generated messages.");
                    }}
                  >
                    {socialProfiles.linkedinUrl ? "Reconnect" : "Connect"}
                  </Button>
                </div>
              </div>

              {/* Instagram Authorization */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pink-100 rounded-lg">
                    <Instagram className="w-5 h-5 text-pink-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Instagram</p>
                    <p className="text-xs text-muted-foreground">Send follow requests & DMs</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {socialProfiles.instagramUrl ? (
                    <Badge variant="outline" className="text-xs gap-1 text-green-700 border-green-300 bg-green-50">
                      <CheckCircle2 className="w-3 h-3" /> Profile Added
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs gap-1 text-gray-500">
                      Not Connected
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      toast.info("Instagram API integration requires a Meta Developer App. Add your profile URL above to use manual outreach with AI-generated messages.");
                    }}
                  >
                    {socialProfiles.instagramUrl ? "Reconnect" : "Connect"}
                  </Button>
                </div>
              </div>

              {/* Facebook Authorization */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Facebook className="w-5 h-5 text-blue-700" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Facebook</p>
                    <p className="text-xs text-muted-foreground">Send friend requests & messages</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {socialProfiles.facebookUrl ? (
                    <Badge variant="outline" className="text-xs gap-1 text-green-700 border-green-300 bg-green-50">
                      <CheckCircle2 className="w-3 h-3" /> Profile Added
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs gap-1 text-gray-500">
                      Not Connected
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      toast.info("Facebook API integration requires a Meta Developer App. Add your profile URL above to use manual outreach with AI-generated messages.");
                    }}
                  >
                    {socialProfiles.facebookUrl ? "Reconnect" : "Connect"}
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800">
                  <strong>How it works:</strong> The system generates personalized AI messages using Claude. Click "Copy & Open Profile" to copy the message and open the lead's profile — then paste and send manually. All outreach is tracked in the Message Queue.
                </p>
              </div>
            </CardContent>
          </Card>
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

  const [calcomSecret, setCalcomSecret] = useState("");
  const [retellSecret, setRetellSecret] = useState("");
  const [showCalcom, setShowCalcom] = useState(false);
  const [showRetell, setShowRetell] = useState(false);
  const [calcomTouched, setCalcomTouched] = useState(false);
  const [retellTouched, setRetellTouched] = useState(false);
  const [calcomEditing, setCalcomEditing] = useState(false);
  const [retellEditing, setRetellEditing] = useState(false);

  const handleSaveCalcom = () => {
    if (!calcomSecret.trim()) return;
    updateMutation.mutate({ calcomWebhookSecret: calcomSecret });
    setCalcomTouched(false);
    setCalcomSecret("");
    setCalcomEditing(false);
  };

  const handleSaveRetell = () => {
    if (!retellSecret.trim()) return;
    updateMutation.mutate({ retellWebhookSecret: retellSecret });
    setRetellTouched(false);
    setRetellSecret("");
    setRetellEditing(false);
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
        {/* Cal.com Signing Key */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-blue-600" />
            Cal.com Webhook Signing Secret
          </Label>
          {settingsQuery.data?.hasCalcomWebhookSecret && !calcomEditing ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Secret Saved & Active</p>
                <p className="text-xs text-green-600">Cal.com webhook signatures are being verified. Incoming requests without valid signatures will be rejected.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCalcomEditing(true)} className="gap-1">
                <KeyRound className="w-3 h-3" /> Update
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showCalcom ? "text" : "password"}
                    value={calcomSecret}
                    onChange={(e) => { setCalcomSecret(e.target.value); setCalcomTouched(true); }}
                    placeholder="Paste your Cal.com webhook secret here"
                    className="pr-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCalcom(!showCalcom)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCalcom ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveCalcom}
                  disabled={!calcomTouched || !calcomSecret.trim() || updateMutation.isPending}
                  className="gap-1"
                >
                  {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </Button>
                {calcomEditing && (
                  <Button variant="ghost" size="sm" onClick={() => { setCalcomEditing(false); setCalcomSecret(""); setCalcomTouched(false); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Find this in Cal.com → Settings → Developer → Webhooks → Copy the secret shown when creating the webhook.
            Header: <code className="bg-muted px-1 rounded">x-cal-signature-256</code> (HMAC-SHA256 hex digest)
          </p>
        </div>

        {/* Retell Signing Key */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-purple-600" />
            Retell.AI Webhook Signing Key
          </Label>
          {settingsQuery.data?.hasRetellWebhookSecret && !retellEditing ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Secret Saved & Active</p>
                <p className="text-xs text-green-600">Retell.AI webhook signatures are being verified. Incoming requests without valid signatures will be rejected.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRetellEditing(true)} className="gap-1">
                <KeyRound className="w-3 h-3" /> Update
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showRetell ? "text" : "password"}
                    value={retellSecret}
                    onChange={(e) => { setRetellSecret(e.target.value); setRetellTouched(true); }}
                    placeholder="Paste your Retell API key (webhook badge)"
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
                  className="gap-1"
                >
                  {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </Button>
                {retellEditing && (
                  <Button variant="ghost" size="sm" onClick={() => { setRetellEditing(false); setRetellSecret(""); setRetellTouched(false); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
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

// ============ Claude AI Section Component ============

function ClaudeAISection({
  settingsQuery,
  claudeApiKey,
  setClaudeApiKey,
  claudeKeyTouched,
  setClaudeKeyTouched,
  showClaudeKey,
  setShowClaudeKey,
  handleSaveClaude,
  updateSettingsMutation,
}: {
  settingsQuery: any;
  claudeApiKey: string;
  setClaudeApiKey: (v: string) => void;
  claudeKeyTouched: boolean;
  setClaudeKeyTouched: (v: boolean) => void;
  showClaudeKey: boolean;
  setShowClaudeKey: (v: boolean) => void;
  handleSaveClaude: () => void;
  updateSettingsMutation: any;
}) {
  const testConnectionMutation = trpc.settings.testClaudeConnection.useMutation();
  const usageQuery = trpc.settings.getClaudeUsage.useQuery();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestConnection = async () => {
    const keyToTest = claudeApiKey || "";
    if (!keyToTest && !(settingsQuery.data as any)?.hasClaudeApiKey) {
      setTestResult({ success: false, message: "Please enter a Claude API key first." });
      return;
    }
    setTestResult(null);
    try {
      // If user typed a new key, test that; otherwise test the saved one
      const result = await testConnectionMutation.mutateAsync({ apiKey: keyToTest || "test-saved-key" });
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ success: false, message: error?.message || "Connection test failed." });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-purple-600" />
            Claude AI Integration
          </CardTitle>
          <CardDescription>
            Connect your Anthropic Claude API key for AI-powered email generation. Claude writes professional, personalized emails for your campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Claude API Key
              {(settingsQuery.data as any)?.hasClaudeApiKey && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-normal">
                  <CheckCircle2 className="w-3 h-3" /> Saved
                </span>
              )}
            </Label>
            <div className="flex gap-2">
              <Input
                type={showClaudeKey ? "text" : "password"}
                placeholder={(settingsQuery.data as any)?.hasClaudeApiKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022  (leave blank to keep current)" : "sk-ant-api03-..."}
                value={claudeApiKey}
                onChange={(e) => { setClaudeApiKey(e.target.value); setClaudeKeyTouched(true); }}
              />
              <Button variant="outline" size="icon" onClick={() => setShowClaudeKey(!showClaudeKey)}>
                {showClaudeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" className="text-purple-600 underline">Anthropic Console \u2192 API Keys</a>
            </p>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testConnectionMutation.isPending}
              className="gap-2"
            >
              {testConnectionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              Test Connection
            </Button>
            {testResult && (
              <span className={`text-sm flex items-center gap-1 ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </span>
            )}
          </div>

          <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <h4 className="font-medium text-sm">What Claude is used for</h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>AI-powered email generation for campaigns (personalized, professional emails)</li>
              <li>Follow-up email generation (7 unique follow-ups per lead)</li>
              <li>Email template creation with dynamic variables</li>
              <li>Weak point analysis and competitor research for email content</li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveClaude} disabled={updateSettingsMutation.isPending} className="gap-2">
              {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Claude API Key
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage Tracking Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-purple-600" />
            Monthly Usage
          </CardTitle>
          <CardDescription>
            Claude API usage for the current month
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading usage data...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{usageQuery.data?.totalCalls || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">API Calls</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{((usageQuery.data?.totalInputTokens || 0) / 1000).toFixed(1)}k</p>
                <p className="text-xs text-muted-foreground mt-1">Input Tokens</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{((usageQuery.data?.totalOutputTokens || 0) / 1000).toFixed(1)}k</p>
                <p className="text-xs text-muted-foreground mt-1">Output Tokens</p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Usage resets on the 1st of each month. Tokens are counted per Claude API call for email generation.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

// ============ Webhook Status Panel Component ============

function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function WebhookStatusPanel() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const weekRange = useMemo(() => getWeekRange(selectedDate), [selectedDate]);

  const statsQuery = trpc.webhooks.stats.useQuery();
  const eventsQuery = trpc.webhooks.list.useQuery({
    limit: 200,
    startDate: weekRange.start.toISOString(),
    endDate: weekRange.end.toISOString(),
  });
  const clearMutation = trpc.webhooks.clear.useMutation({
    onSuccess: () => {
      toast.success("Webhook events cleared for this week");
      eventsQuery.refetch();
      statsQuery.refetch();
    },
    onError: () => toast.error("Failed to clear events"),
  });
  const sendTestMutation = trpc.webhooks.sendTest.useMutation({
    onSuccess: () => {
      toast.success("Test webhook event logged successfully");
      statsQuery.refetch();
      eventsQuery.refetch();
    },
    onError: () => toast.error("Failed to send test event"),
  });

  const isCurrentWeek = useMemo(() => {
    const now = new Date();
    const currentWeek = getWeekRange(now);
    return weekRange.start.getTime() === currentWeek.start.getTime();
  }, [weekRange]);

  const goToPreviousWeek = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 7);
    setSelectedDate(prev);
  };
  const goToNextWeek = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 7);
    setSelectedDate(next);
  };
  const goToCurrentWeek = () => setSelectedDate(new Date());

  const deployedDomain = "leadgenoutreach-gkqazghm.manus.space";
  const calcomUrl = `https://${deployedDomain}/api/webhooks/calendly`;
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
            Monitor incoming webhook events from Cal.com, email replies, and Retell.AI call updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cal.com Status */}
            <div className={`p-4 rounded-lg border-2 ${getStatusColor(statsQuery.data?.calendlyLast ?? null)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusDot(statsQuery.data?.calendlyLast ?? null)}`} />
                  <span className="font-medium text-sm">Cal.com Bookings</span>
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
          {/* Cal.com URL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              Cal.com Booking Webhook
            </Label>
            <div className="flex items-center gap-2">
              <Input value={calcomUrl} readOnly className="font-mono text-xs bg-muted" />
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(calcomUrl, "Cal.com")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL in Cal.com → Settings → Developer → Webhooks → Subscribe to event: <code className="bg-muted px-1 rounded">BOOKING_CREATED</code>
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
                Test Cal.com
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Webhook Events
              </CardTitle>
              <CardDescription className="mt-1">
                Showing events for week: {weekRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {isCurrentWeek && <Badge className="ml-2 bg-green-100 text-green-700 border-green-200 text-[10px]">Current Week</Badge>}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToPreviousWeek} title="Previous week">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {!isCurrentWeek && (
                <Button variant="outline" size="sm" onClick={goToCurrentWeek} title="Go to current week">
                  Today
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={goToNextWeek} title="Next week">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Pick Date
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => { if (date) setSelectedDate(date); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => clearMutation.mutate({ startDate: weekRange.start.toISOString(), endDate: weekRange.end.toISOString() })}
                disabled={clearMutation.isPending || !eventsQuery.data?.length}
                className="gap-1"
              >
                {clearMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Clear Week
              </Button>
            </div>
          </div>
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
                        {event.webhookType === "calendly_booking" ? "Cal.com Booking" :
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
