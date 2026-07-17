import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useSearch } from "wouter";
import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Mail, Phone, BarChart3, FolderPlus, Eye, ExternalLink, MousePointerClick, ShieldCheck, AlertTriangle, MailWarning, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import LeadsPage from "./Leads";
import SettingsPage from "./Settings";
import AnalyticsPage from "./Analytics";
import EmailComposerPage from "./EmailComposer";
import SocialOutreachPage from "./SocialOutreach";
import CampaignsPage from "./Campaigns";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const urlTab = new URLSearchParams(searchString).get("tab");
  const [activeTab, setActiveTab] = useState(urlTab || "overview");

  useEffect(() => {
    if (urlTab && ["overview", "leads", "compose", "campaigns", "social", "analytics", "settings"].includes(urlTab)) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Lead Generation & Outreach
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your leads, campaigns, and automated outreach
            </p>
          </div>
        </div>

        {/* Main Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="compose">Email Composer</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="social">Social Outreach</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <OverviewTab />
          </TabsContent>

          {/* Leads Tab - shows only leads not yet assigned to any campaign */}
          <TabsContent value="leads">
            <LeadsPage showOnlyUnassigned={true} />
          </TabsContent>

          {/* Email Composer Tab - Unified single + bulk */}
          <TabsContent value="compose">
            <EmailComposerPage />
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            <CampaignsPage />
          </TabsContent>

          {/* Social Outreach Tab */}
          <TabsContent value="social">
            <SocialOutreachPage />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <AnalyticsPage />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <SettingsPage />
          </TabsContent>
        </Tabs>
      </div>
  );
}

function OverviewTab() {
  const campaignsQuery = trpc.campaigns.list.useQuery();
  const bouncerCreditsQuery = trpc.verification.getBouncerCredits.useQuery();

  const totalCampaigns = campaignsQuery.data?.length || 0;
  const activeCampaigns = campaignsQuery.data?.filter(c => c.status === "active").length || 0;
  const totalEmails = campaignsQuery.data?.reduce((sum, c) => sum + (c.sentCount || 0), 0) || 0;
  const totalOpens = campaignsQuery.data?.reduce((sum, c) => sum + (c.openCount || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totalCampaigns}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeCampaigns} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Emails Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totalEmails}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Email Opens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totalOpens}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalEmails > 0 ? Math.round((totalOpens / totalEmails) * 100) : 0}% open rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Calls Triggered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {campaignsQuery.data?.reduce((sum, c) => sum + (c.callCount || 0), 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Via Retell.AI
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bouncer Credit Balance Widget */}
      <Card className="border-green-200 bg-gradient-to-r from-green-50/50 to-emerald-50/50">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <ShieldCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Bouncer Email Verification</p>
              {bouncerCreditsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Checking credits...</p>
              ) : !bouncerCreditsQuery.data?.configured ? (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  API key not configured
                </p>
              ) : bouncerCreditsQuery.data.credits === -1 ? (
                <p className="text-xs text-red-600">Unable to fetch credits — check API key</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {bouncerCreditsQuery.data.credits.toLocaleString()} verification credits remaining
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {bouncerCreditsQuery.data?.configured && bouncerCreditsQuery.data.credits >= 0 && (
              <span className={`text-lg font-bold ${
                bouncerCreditsQuery.data.credits > 500 ? "text-green-600" :
                bouncerCreditsQuery.data.credits > 100 ? "text-amber-600" :
                "text-red-600"
              }`}>
                {bouncerCreditsQuery.data.credits.toLocaleString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => window.open("https://app.usebouncer.com", "_blank")}
            >
              {bouncerCreditsQuery.data?.configured ? "Top Up" : "Configure"}
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Get started with your lead generation</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" className="gap-2" onClick={() => window.location.href = '/search-preview'}>
            <Search className="w-4 h-4" />
            Search Leads
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.location.href = '/email-composer'}>
            <Mail className="w-4 h-4" />
            Compose Email
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.location.href = '/dashboard?tab=leads'}>
            <Plus className="w-4 h-4" />
            Generate Leads
          </Button>
          <Button variant="outline" className="gap-2">
            <Phone className="w-4 h-4" />
            Configure Retell.AI
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.location.href = '/lead-sets'}>
            <FolderPlus className="w-4 h-4" />
            Manage Lead Sets
          </Button>
        </CardContent>
      </Card>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Campaigns</CardTitle>
            <CardDescription>Click any campaign to view full activity timeline</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.location.href = '/email-composer'}>
            View All
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {campaignsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaignsQuery.data && campaignsQuery.data.length > 0 ? (
            <div className="space-y-3">
              {campaignsQuery.data.slice(0, 5).map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => window.location.href = `/campaigns/${campaign.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm group-hover:text-primary transition-colors">{campaign.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {campaign.sentCount} sent</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {campaign.openCount} opens</span>
                      <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3" /> {(campaign as any).clickCount || 0} clicks</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {(campaign as any).callCount || 0} calls</span>
                      {((campaign as any).bounceCount || 0) > 0 && (
                        <span className="flex items-center gap-1 text-red-600"><MailWarning className="w-3 h-3" /> {(campaign as any).bounceCount} bounced</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      campaign.status === "active"
                        ? "bg-green-100 text-green-800"
                        : campaign.status === "draft"
                        ? "bg-gray-100 text-gray-800"
                        : campaign.status === "paused"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-blue-100 text-blue-800"
                    }`}>
                      {campaign.status}
                    </span>
                    <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No campaigns yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
