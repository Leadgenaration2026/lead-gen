import { useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, BarChart3, Mail, MousePointerClick, Phone, TrendingUp, Users, Send, Eye } from "lucide-react";

export default function AnalyticsPage() {
  const { user } = useAuth();
  const overviewQuery = trpc.analytics.overview.useQuery();
  const timeSeriesQuery = trpc.analytics.timeSeries.useQuery();
  const topTemplatesQuery = trpc.analytics.topTemplates.useQuery();

  const overview = overviewQuery.data;
  const timeSeries = timeSeriesQuery.data || [];
  const topTemplates = topTemplatesQuery.data || [];

  if (overviewQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          Email Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Track your campaign performance, open rates, and engagement metrics
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overview?.totals.emailsSent || 0}</p>
                <p className="text-xs text-muted-foreground">Emails Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Eye className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overview?.totals.overallOpenRate || 0}%</p>
                <p className="text-xs text-muted-foreground">Open Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <MousePointerClick className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overview?.totals.overallClickRate || 0}%</p>
                <p className="text-xs text-muted-foreground">Click Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <Phone className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overview?.totals.callsMade || 0}</p>
                <p className="text-xs text-muted-foreground">Calls Made</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-blue-600">{overview?.totals.campaigns || 0}</p>
            <p className="text-sm text-muted-foreground mt-1">Total Campaigns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">{overview?.totals.leads || 0}</p>
            <p className="text-sm text-muted-foreground mt-1">Total Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-purple-600">{overview?.totals.emailsOpened || 0}</p>
            <p className="text-sm text-muted-foreground mt-1">Emails Opened</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Rate Trend - Area Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4 text-green-600" />
              Open Rate Trend
            </CardTitle>
            <CardDescription>Open rate percentage over time by campaign date</CardDescription>
          </CardHeader>
          <CardContent>
            {timeSeries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No data yet. Launch a campaign to see trends.</p>
              </div>
            ) : (
              <OpenRateChart data={timeSeries} />
            )}
          </CardContent>
        </Card>

        {/* Click-Through Rate Trend - Area Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MousePointerClick className="w-4 h-4 text-purple-600" />
              Click-Through Rate Trend
            </CardTitle>
            <CardDescription>CTR percentage over time by campaign date</CardDescription>
          </CardHeader>
          <CardContent>
            {timeSeries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No data yet. Launch a campaign to see trends.</p>
              </div>
            ) : (
              <ClickRateChart data={timeSeries} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            Campaign Comparison
          </CardTitle>
          <CardDescription>Performance metrics across all campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          {!overview?.campaigns || overview.campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No campaigns yet.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {overview.campaigns.map((campaign) => (
                <div key={campaign.id} className="p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium truncate max-w-[60%]">{campaign.name}</span>
                    <Badge variant={campaign.status === "active" ? "default" : "secondary"} className="text-xs">
                      {campaign.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-sm font-semibold">{campaign.sent}</p>
                      <p className="text-[10px] text-muted-foreground">Sent</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-green-600">{campaign.openRate}%</p>
                      <p className="text-[10px] text-muted-foreground">Open Rate</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-purple-600">{campaign.clickRate}%</p>
                      <p className="text-[10px] text-muted-foreground">Click Rate</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-orange-600">{campaign.calls}</p>
                      <p className="text-[10px] text-muted-foreground">Calls</p>
                    </div>
                  </div>
                  {/* Progress bar showing funnel */}
                  <div className="mt-2 flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-muted">
                    {campaign.totalLeads > 0 && (
                      <>
                        <div className="bg-blue-400 transition-all" style={{ width: `${(campaign.sent / campaign.totalLeads) * 100}%` }} />
                        <div className="bg-green-400 transition-all" style={{ width: `${(campaign.opened / campaign.totalLeads) * 100}%` }} />
                        <div className="bg-purple-400 transition-all" style={{ width: `${(campaign.clicked / campaign.totalLeads) * 100}%` }} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Best Performing Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            Top Performing Templates
          </CardTitle>
          <CardDescription>Templates ranked by open rate with engagement metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {topTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No templates yet. Create templates to track their performance.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Template Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Sent</TableHead>
                  <TableHead className="text-center">Open Rate</TableHead>
                  <TableHead className="text-center">Click Rate</TableHead>
                  <TableHead className="text-right">Times Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topTemplates.map((template, index) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {template.emailType?.replace("_", " ") || "custom"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">{template.totalSent}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-semibold text-sm ${template.openRate > 30 ? "text-green-600" : template.openRate > 15 ? "text-yellow-600" : "text-muted-foreground"}`}>
                        {template.openRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-semibold text-sm ${template.clickRate > 10 ? "text-purple-600" : template.clickRate > 5 ? "text-yellow-600" : "text-muted-foreground"}`}>
                        {template.clickRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-blue-600">{template.usageCount}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Open Rate Area Chart Component ============
function OpenRateChart({ data }: { data: Array<{ date: string; openRate: number; sent: number }> }) {
  const maxRate = useMemo(() => Math.max(...data.map((d) => d.openRate), 100), [data]);
  const chartHeight = 160;

  // Build SVG path for area chart
  const points = data.map((d, i) => ({
    x: data.length === 1 ? 50 : (i / (data.length - 1)) * 100,
    y: chartHeight - (d.openRate / maxRate) * chartHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x}% ${p.y}`).join(" ");
  const areaPath = `${linePath} L 100% ${chartHeight} L 0% ${chartHeight} Z`;

  return (
    <div className="space-y-3">
      {/* SVG Area Chart */}
      <div className="relative" style={{ height: `${chartHeight}px` }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-muted-foreground w-8">
          <span>{maxRate}%</span>
          <span>{Math.round(maxRate / 2)}%</span>
          <span>0%</span>
        </div>
        {/* Chart area */}
        <div className="ml-9 h-full relative border-l border-b border-border">
          {/* Grid lines */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-0 right-0 border-t border-dashed border-border/50" />
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/50" />
          </div>
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none">
            {/* Area fill */}
            <path d={areaPath} fill="rgba(34, 197, 94, 0.15)" />
            {/* Line */}
            <path d={linePath} fill="none" stroke="rgb(34, 197, 94)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {/* Data points */}
            {points.map((p, i) => (
              <circle key={i} cx={`${p.x}%`} cy={p.y} r="3" fill="rgb(34, 197, 94)" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {/* Hover tooltips */}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <div key={i} className="flex-1 group relative">
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border rounded-md shadow-md p-2 text-xs whitespace-nowrap z-10">
                  <p className="font-medium">{new Date(d.date).toLocaleDateString()}</p>
                  <p className="text-green-600">Open Rate: {d.openRate}%</p>
                  <p className="text-muted-foreground">{d.sent} emails sent</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* X-axis labels */}
      <div className="ml-9 flex justify-between text-[10px] text-muted-foreground">
        {data.length <= 7 ? (
          data.map((d, i) => (
            <span key={i}>{new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          ))
        ) : (
          <>
            <span>{new Date(data[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <span>{new Date(data[Math.floor(data.length / 2)].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <span>{new Date(data[data.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ============ Click Rate Area Chart Component ============
function ClickRateChart({ data }: { data: Array<{ date: string; clickRate: number; sent: number }> }) {
  const maxRate = useMemo(() => Math.max(...data.map((d) => d.clickRate), 50), [data]);
  const chartHeight = 160;

  const points = data.map((d, i) => ({
    x: data.length === 1 ? 50 : (i / (data.length - 1)) * 100,
    y: chartHeight - (d.clickRate / maxRate) * chartHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x}% ${p.y}`).join(" ");
  const areaPath = `${linePath} L 100% ${chartHeight} L 0% ${chartHeight} Z`;

  return (
    <div className="space-y-3">
      <div className="relative" style={{ height: `${chartHeight}px` }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-muted-foreground w-8">
          <span>{maxRate}%</span>
          <span>{Math.round(maxRate / 2)}%</span>
          <span>0%</span>
        </div>
        {/* Chart area */}
        <div className="ml-9 h-full relative border-l border-b border-border">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-0 right-0 border-t border-dashed border-border/50" />
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/50" />
          </div>
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none">
            <path d={areaPath} fill="rgba(147, 51, 234, 0.12)" />
            <path d={linePath} fill="none" stroke="rgb(147, 51, 234)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {points.map((p, i) => (
              <circle key={i} cx={`${p.x}%`} cy={p.y} r="3" fill="rgb(147, 51, 234)" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <div key={i} className="flex-1 group relative">
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border rounded-md shadow-md p-2 text-xs whitespace-nowrap z-10">
                  <p className="font-medium">{new Date(d.date).toLocaleDateString()}</p>
                  <p className="text-purple-600">Click Rate: {d.clickRate}%</p>
                  <p className="text-muted-foreground">{d.sent} emails sent</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* X-axis labels */}
      <div className="ml-9 flex justify-between text-[10px] text-muted-foreground">
        {data.length <= 7 ? (
          data.map((d, i) => (
            <span key={i}>{new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          ))
        ) : (
          <>
            <span>{new Date(data[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <span>{new Date(data[Math.floor(data.length / 2)].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <span>{new Date(data[data.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </>
        )}
      </div>
    </div>
  );
}
