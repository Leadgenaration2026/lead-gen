import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail, MailOpen, MousePointerClick, Phone, MessageCircle, Globe, Linkedin, Instagram, Facebook, Send, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { WebsiteInsightsPanel } from "@/components/WebsiteInsightsPanel";

interface LeadDetailDrawerProps {
  leadId: number | null;
  open: boolean;
  onClose: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  email_sent: <Send className="w-4 h-4 text-blue-500" />,
  email_opened: <MailOpen className="w-4 h-4 text-green-500" />,
  email_clicked: <MousePointerClick className="w-4 h-4 text-purple-500" />,
  followup_email: <Mail className="w-4 h-4 text-indigo-500" />,
  call: <Phone className="w-4 h-4 text-orange-500" />,
  social_outreach: <MessageCircle className="w-4 h-4 text-pink-500" />,
};

const statusColors: Record<string, string> = {
  sent: "bg-blue-100 text-blue-700",
  opened: "bg-green-100 text-green-700",
  open: "bg-green-100 text-green-700",
  clicked: "bg-purple-100 text-purple-700",
  click: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  scheduled: "bg-yellow-100 text-yellow-700",
  draft: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-700",
  initiated: "bg-blue-100 text-blue-700",
  ringing: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  no_answer: "bg-orange-100 text-orange-700",
  voicemail: "bg-orange-100 text-orange-700",
  pending: "bg-gray-100 text-gray-600",
};

export function LeadDetailDrawer({ leadId, open, onClose }: LeadDetailDrawerProps) {
  const timelineQuery = trpc.leads.timeline.useQuery(leadId!, { enabled: !!leadId && open });

  const data = timelineQuery.data;
  const lead = data?.lead;
  const timeline = data?.timeline || [];
  const stats = data?.stats;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">
            {lead ? lead.ownerName || lead.companyName : "Lead Details"}
          </SheetTitle>
          <SheetDescription>
            Full engagement timeline and activity history
          </SheetDescription>
        </SheetHeader>

        {timelineQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-muted-foreground">No data available</div>
        ) : (
          <div className="space-y-6">
            {/* Lead Info Card */}
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">Company</span>
                  <span className="text-sm font-semibold">{lead?.companyName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">Contact</span>
                  <span className="text-sm">{lead?.ownerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">Email</span>
                  <a href={`mailto:${lead?.email}`} className="text-sm text-blue-600 hover:underline">{lead?.email}</a>
                </div>
                {lead?.phoneNumber && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-muted-foreground">Phone</span>
                    <span className="text-sm">{lead.phoneNumber}</span>
                  </div>
                )}
                {lead?.industry && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-muted-foreground">Industry</span>
                    <Badge variant="outline" className="text-xs">{lead.industry}</Badge>
                  </div>
                )}
                {lead?.companySize && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-muted-foreground">Company Size</span>
                    <Badge variant="outline" className="text-xs">{lead.companySize}</Badge>
                  </div>
                )}
                {/* Social Links */}
                <div className="flex gap-2 pt-2">
                  {lead?.website && (
                    <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors" title="Website">
                      <Globe className="w-4 h-4 text-gray-600" />
                    </a>
                  )}
                  {lead?.linkedinUrl && (
                    <a href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors" title="LinkedIn">
                      <Linkedin className="w-4 h-4 text-blue-700" />
                    </a>
                  )}
                  {lead?.instagramUrl && (
                    <a href={lead.instagramUrl.startsWith('http') ? lead.instagramUrl : `https://${lead.instagramUrl}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md bg-pink-50 hover:bg-pink-100 transition-colors" title="Instagram">
                      <Instagram className="w-4 h-4 text-pink-600" />
                    </a>
                  )}
                  {lead?.facebookUrl && (
                    <a href={lead.facebookUrl.startsWith('http') ? lead.facebookUrl : `https://${lead.facebookUrl}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors" title="Facebook">
                      <Facebook className="w-4 h-4 text-blue-600" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Website Insights */}
            {lead?.website && (
              <WebsiteInsightsPanel
                domain={lead.website}
                leadId={lead.id}
                companyName={lead.companyName}
                industry={lead.industry || undefined}
                compact
              />
            )}

            {/* Stats Summary */}
            {stats && (
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="text-lg font-bold text-blue-700">{stats.emailsSent}</div>
                  <div className="text-xs text-blue-600">Emails Sent</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50 border border-green-100">
                  <div className="text-lg font-bold text-green-700">{stats.emailsOpened}</div>
                  <div className="text-xs text-green-600">Opened</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-50 border border-purple-100">
                  <div className="text-lg font-bold text-purple-700">{stats.emailsClicked}</div>
                  <div className="text-xs text-purple-600">Clicked</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                  <div className="text-lg font-bold text-indigo-700">{stats.followUpsSent}</div>
                  <div className="text-xs text-indigo-600">Follow-ups</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <div className="text-lg font-bold text-orange-700">{stats.callsMade}</div>
                  <div className="text-xs text-orange-600">Calls Made</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-pink-50 border border-pink-100">
                  <div className="text-lg font-bold text-pink-700">{stats.socialSent}</div>
                  <div className="text-xs text-pink-600">Social Sent</div>
                </div>
              </div>
            )}

            <Separator />

            {/* Timeline */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Engagement Timeline</h3>
              {timeline.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No activity recorded yet
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />
                  
                  <div className="space-y-4">
                    {timeline.map((item, idx) => (
                      <div key={idx} className="flex gap-3 relative">
                        {/* Icon */}
                        <div className="relative z-10 flex items-center justify-center w-9 h-9 rounded-full bg-background border border-border shadow-sm shrink-0">
                          {typeIcons[item.type] || <Clock className="w-4 h-4 text-gray-400" />}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{item.title}</span>
                            <Badge className={`text-[10px] px-1.5 py-0 ${statusColors[item.status] || "bg-gray-100 text-gray-600"}`}>
                              {item.status}
                            </Badge>
                          </div>
                          {item.detail && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(item.date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
