import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Mail, Phone, BarChart3 } from "lucide-react";
import LeadsPage from "./Leads";
import CampaignsPage from "./Campaigns";
import SettingsPage from "./Settings";
import AnalyticsPage from "./Analytics";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

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
    <DashboardLayout>
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
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <OverviewTab />
          </TabsContent>

          {/* Leads Tab */}
          <TabsContent value="leads">
            <LeadsPage />
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            <CampaignsPage />
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
    </DashboardLayout>
  );
}

function OverviewTab() {
  const campaignsQuery = trpc.campaigns.list.useQuery();

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

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Get started with your lead generation</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Campaign
          </Button>
          <Button variant="outline" className="gap-2">
            <Mail className="w-4 h-4" />
            Generate Leads
          </Button>
          <Button variant="outline" className="gap-2">
            <Phone className="w-4 h-4" />
            Configure Retell.AI
          </Button>
        </CardContent>
      </Card>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Campaigns</CardTitle>
          <CardDescription>Your latest email campaigns</CardDescription>
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
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {campaign.sentCount} sent • {campaign.openCount} opens
                    </p>
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
