import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Globe, TrendingUp, TrendingDown, Search, BarChart3, ArrowUpRight, AlertTriangle, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface WebsiteInsightsPanelProps {
  domain: string; // Website URL or domain
  leadId?: number; // Optional: for generating personalized email
  onGenerateEmail?: (subject: string, body: string) => void; // Callback when email is generated
  compact?: boolean; // Compact mode for drawer
}

interface InsightsData {
  domain: string;
  totalVisits: number | null;
  uniqueVisitors: number | null;
  bounceRate: number | null;
  globalRank: number | null;
  topKeywords: Array<{
    keyword: string;
    trafficShare: number;
    position: number;
    source: "organic" | "paid";
  }>;
  trafficSources: {
    organic: number;
    paid: number;
    direct: number;
    referral: number;
    social: number;
    email: number;
    display: number;
  } | null;
  topLandingPages: Array<{
    url: string;
    trafficShare: number;
    keywords: number;
  }>;
  analysisDate: string;
  errors: string[];
}

export function WebsiteInsightsPanel({ domain, leadId, onGenerateEmail, compact = false }: WebsiteInsightsPanelProps) {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [analyzed, setAnalyzed] = useState(false);

  const analyzeMutation = trpc.websiteAnalysis.analyze.useMutation();
  const generateEmailMutation = trpc.websiteAnalysis.generatePersonalizedEmail.useMutation();

  const handleAnalyze = async () => {
    try {
      const result = await analyzeMutation.mutateAsync({ domain });
      setInsights(result.insights as InsightsData);
      setSummary(result.summary as string);
      setAnalyzed(true);
      toast.success("Website analysis complete!");
    } catch (error: any) {
      toast.error(error.message || "Failed to analyze website");
    }
  };

  const handleGenerateEmail = async () => {
    if (!leadId || !summary) {
      toast.error("Need lead and analysis data to generate email");
      return;
    }
    try {
      const result = await generateEmailMutation.mutateAsync({
        leadId,
        websiteInsightsSummary: summary,
        emailType: "value_prop",
      });
      onGenerateEmail?.(result.subject, result.body);
      toast.success("Personalized email generated from website insights!");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate email");
    }
  };

  const formatNumber = (num: number | null) => {
    if (num === null) return "N/A";
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getBounceRateColor = (rate: number | null) => {
    if (rate === null) return "text-gray-500";
    const pct = rate > 1 ? rate : rate * 100;
    if (pct > 60) return "text-red-600";
    if (pct > 40) return "text-amber-600";
    return "text-green-600";
  };

  if (!analyzed) {
    return (
      <Card className={`border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 ${compact ? "" : ""}`}>
        <CardHeader className={compact ? "pb-2 pt-3 px-4" : "pb-3"}>
          <CardTitle className={`flex items-center gap-2 ${compact ? "text-sm" : "text-base"}`}>
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            Website Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className={compact ? "px-4 pb-3" : ""}>
          <p className="text-xs text-muted-foreground mb-3">
            Analyze their website traffic, SEO performance, and identify opportunities where Virtual Assistant Group can help.
          </p>
          <Button
            onClick={handleAnalyze}
            disabled={analyzeMutation.isPending}
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
            size={compact ? "sm" : "default"}
          >
            {analyzeMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing {domain}...</>
            ) : (
              <><Search className="w-4 h-4" /> Analyze Website</>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/50">
      <CardHeader className={compact ? "pb-2 pt-3 px-4" : "pb-3"}>
        <CardTitle className={`flex items-center gap-2 ${compact ? "text-sm" : "text-base"}`}>
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          Website Insights
          <Badge variant="outline" className="text-[10px] ml-auto bg-emerald-100 text-emerald-700 border-emerald-300">
            SimilarWeb
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-3 ${compact ? "px-4 pb-3" : ""}`}>
        {/* Key Metrics Grid */}
        <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-2`}>
          <div className="text-center p-2 rounded-lg bg-white/70 border border-emerald-100">
            <div className="text-sm font-bold text-emerald-700">{formatNumber(insights?.totalVisits ?? null)}</div>
            <div className="text-[10px] text-muted-foreground">Monthly Visits</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/70 border border-emerald-100">
            <div className={`text-sm font-bold ${getBounceRateColor(insights?.bounceRate ?? null)}`}>
              {insights?.bounceRate !== null && insights?.bounceRate !== undefined
                ? `${(insights.bounceRate > 1 ? insights.bounceRate : insights.bounceRate * 100).toFixed(0)}%`
                : "N/A"}
            </div>
            <div className="text-[10px] text-muted-foreground">Bounce Rate</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/70 border border-emerald-100">
            <div className="text-sm font-bold text-emerald-700">
              {insights?.globalRank ? `#${insights.globalRank.toLocaleString()}` : "N/A"}
            </div>
            <div className="text-[10px] text-muted-foreground">Global Rank</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/70 border border-emerald-100">
            <div className="text-sm font-bold text-emerald-700">
              {insights?.topKeywords?.length || 0}
            </div>
            <div className="text-[10px] text-muted-foreground">Keywords Found</div>
          </div>
        </div>

        {/* Traffic Sources */}
        {insights?.trafficSources && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-emerald-800">Traffic Sources</p>
            <div className="space-y-1">
              {(() => {
                const ts = insights.trafficSources!;
                const total = ts.organic + ts.paid + ts.direct + ts.referral + ts.social + ts.email + ts.display;
                if (total === 0) return <p className="text-xs text-muted-foreground">No data available</p>;
                const sources = [
                  { name: "Organic", value: ts.organic, color: "bg-green-500" },
                  { name: "Paid", value: ts.paid, color: "bg-red-400" },
                  { name: "Direct", value: ts.direct, color: "bg-blue-500" },
                  { name: "Social", value: ts.social, color: "bg-pink-500" },
                  { name: "Referral", value: ts.referral, color: "bg-purple-500" },
                ].filter(s => s.value > 0).sort((a, b) => b.value - a.value);

                return sources.map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${s.color}`} />
                    <span className="text-xs flex-1">{s.name}</span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full ${s.color} rounded-full`} style={{ width: `${(s.value / total * 100).toFixed(0)}%` }} />
                    </div>
                    <span className="text-xs font-medium w-8 text-right">{(s.value / total * 100).toFixed(0)}%</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Top Keywords */}
        {insights?.topKeywords && insights.topKeywords.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-emerald-800">Top Keywords</p>
            <div className="flex flex-wrap gap-1">
              {insights.topKeywords.slice(0, compact ? 5 : 8).map((kw, idx) => (
                <Badge key={idx} variant="outline" className="text-[10px] bg-white/80 gap-1">
                  {kw.source === "paid" && <span className="text-red-500">$</span>}
                  {kw.keyword}
                  {kw.position > 0 && <span className="text-muted-foreground">#{kw.position}</span>}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Opportunities / Issues */}
        {insights && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Opportunities for VAG
            </p>
            <div className="space-y-1">
              {insights.bounceRate !== null && (insights.bounceRate > 1 ? insights.bounceRate : insights.bounceRate * 100) > 60 && (
                <div className="flex items-start gap-1.5 text-xs">
                  <TrendingDown className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                  <span>High bounce rate — content optimization & UX improvements needed</span>
                </div>
              )}
              {insights.totalVisits !== null && insights.totalVisits < 5000 && (
                <div className="flex items-start gap-1.5 text-xs">
                  <TrendingUp className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                  <span>Low traffic — SEO content strategy can boost organic visibility</span>
                </div>
              )}
              {insights.trafficSources && (() => {
                const ts = insights.trafficSources!;
                const total = ts.organic + ts.paid + ts.direct + ts.referral + ts.social + ts.email + ts.display;
                if (total > 0 && (ts.organic / total) < 0.2) {
                  return (
                    <div className="flex items-start gap-1.5 text-xs">
                      <Search className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                      <span>Weak organic search — SEO & blog content can drive free traffic</span>
                    </div>
                  );
                }
                if (total > 0 && (ts.social / total) < 0.05) {
                  return (
                    <div className="flex items-start gap-1.5 text-xs">
                      <Globe className="w-3 h-3 text-pink-500 mt-0.5 shrink-0" />
                      <span>Minimal social presence — social media management opportunity</span>
                    </div>
                  );
                }
                return null;
              })()}
              {insights.topKeywords.length < 5 && (
                <div className="flex items-start gap-1.5 text-xs">
                  <Search className="w-3 h-3 text-purple-500 mt-0.5 shrink-0" />
                  <span>Limited keyword visibility — keyword research & content creation needed</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          {leadId && onGenerateEmail && (
            <Button
              onClick={handleGenerateEmail}
              disabled={generateEmailMutation.isPending}
              className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              {generateEmailMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Generate Email from Insights</>
              )}
            </Button>
          )}
          <Button
            onClick={handleAnalyze}
            disabled={analyzeMutation.isPending}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            {analyzeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            Re-analyze
          </Button>
        </div>

        {/* Errors */}
        {insights?.errors && insights.errors.length > 0 && (
          <p className="text-[10px] text-amber-600">
            Note: Some data unavailable ({insights.errors.length} API{insights.errors.length > 1 ? "s" : ""} returned limited data)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
