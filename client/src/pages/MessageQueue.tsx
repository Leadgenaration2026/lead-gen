import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Linkedin, Instagram, Facebook, Copy, ExternalLink, CheckCircle2,
  Clock, MessageSquare, Filter, Trash2, Send, ThumbsUp, Reply, ThumbsDown, MessageCircle
} from "lucide-react";

type FilterPlatform = "all" | "linkedin" | "instagram" | "facebook";
type FilterStatus = "all" | "pending" | "sent";

const PLATFORM_ICONS: Record<string, typeof Linkedin> = {
  linkedin: Linkedin,
  instagram: Instagram,
  facebook: Facebook,
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "text-blue-600 bg-blue-50 border-blue-200",
  instagram: "text-pink-600 bg-pink-50 border-pink-200",
  facebook: "text-blue-700 bg-blue-50 border-blue-200",
};

// Facebook (m.me) and Instagram (ig.me) both support opening a DM thread
// directly with a specific username. LinkedIn has no equivalent -- there's
// no documented way to deep-link into a message thread, so the profile page
// (whose Connect/Pending/Message button state already reveals whether a
// connection was accepted) is the only option there.
function getDirectMessageUrl(platform: string, profileUrl: string | null): string | null {
  if (!profileUrl) return null;
  let username: string;
  try {
    const url = new URL(profileUrl);
    username = url.pathname.split("/").filter(Boolean)[0] || "";
  } catch {
    return null;
  }
  if (!username || username === "profile.php") return null; // e.g. facebook.com/profile.php?id=... has no vanity username
  if (platform === "facebook") return `https://m.me/${username}`;
  if (platform === "instagram") return `https://ig.me/m/${username}`;
  return null;
}

export default function MessageQueue() {
  const [filterPlatform, setFilterPlatform] = useState<FilterPlatform>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const messagesQuery = trpc.social.listAll.useQuery({ limit: 200 });
  const leadsQuery = trpc.leads.list.useQuery();
  const markSentMutation = trpc.social.markSent.useMutation({
    onSuccess: () => messagesQuery.refetch(),
  });
  const deleteMutation = trpc.social.delete.useMutation({
    onSuccess: () => { toast.success("Message deleted"); messagesQuery.refetch(); },
    onError: (err) => toast.error(err.message || "Failed to delete message"),
  });
  const markResponseMutation = trpc.social.markResponse.useMutation({
    onSuccess: () => messagesQuery.refetch(),
    onError: (err) => toast.error(err.message || "Failed to update response"),
  });

  const messages = useMemo(() => {
    let items = messagesQuery.data || [];
    if (filterPlatform !== "all") {
      items = items.filter(m => m.platform === filterPlatform);
    }
    if (filterStatus !== "all") {
      items = items.filter(m => m.status === filterStatus);
    }
    return items;
  }, [messagesQuery.data, filterPlatform, filterStatus]);

  const leads = useMemo(() => {
    const map = new Map<number, any>();
    (leadsQuery.data || []).forEach(l => map.set(l.id, l));
    return map;
  }, [leadsQuery.data]);

  const stats = useMemo(() => {
    const all = messagesQuery.data || [];
    return {
      total: all.length,
      pending: all.filter(m => m.status === "pending").length,
      sent: all.filter(m => m.status === "sent").length,
      accepted: all.filter((m: any) => m.responseStatus === "accepted").length,
      replied: all.filter((m: any) => m.responseStatus === "replied").length,
      linkedin: all.filter(m => m.platform === "linkedin").length,
      instagram: all.filter(m => m.platform === "instagram").length,
      facebook: all.filter(m => m.platform === "facebook").length,
    };
  }, [messagesQuery.data]);

  const handleCopyMessage = (id: number, message: string) => {
    navigator.clipboard.writeText(message);
    setCopiedId(id);
    toast.success("Message copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenProfile = (profileUrl: string | null) => {
    if (profileUrl) {
      window.open(profileUrl, "_blank");
    } else {
      toast.error("No profile URL available for this lead");
    }
  };

  const handleCopyAndOpen = (id: number, message: string, profileUrl: string | null, status: string) => {
    handleCopyMessage(id, message);
    setTimeout(() => handleOpenProfile(profileUrl), 300);
    // Copying + opening the profile is the moment the user is about to actually
    // send this on the platform, so mark it sent (if it isn't already).
    if (status !== "sent") {
      markSentMutation.mutate(id);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(messages.map(m => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBatchCopy = () => {
    const selectedMessages = messages.filter(m => selectedIds.has(m.id));
    const text = selectedMessages.map((m, i) => {
      const lead = leads.get(m.leadId);
      return `--- Message ${i + 1} (${m.platform}) ---\nTo: ${lead?.ownerName || "Unknown"} (${lead?.companyName || ""})\nProfile: ${m.profileUrl || "N/A"}\n\n${m.message}\n`;
    }).join("\n");
    navigator.clipboard.writeText(text);
    toast.success(`${selectedMessages.length} messages copied to clipboard!`);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Delete this message from the queue? This can't be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const handleBatchDelete = () => {
    if (!window.confirm(`Delete ${selectedIds.size} message(s) from the queue? This can't be undone.`)) return;
    selectedIds.forEach((id) => deleteMutation.mutate(id));
    setSelectedIds(new Set());
  };

  const handleBatchOpenProfiles = () => {
    const selectedMessages = messages.filter(m => selectedIds.has(m.id));
    const urls = selectedMessages.map(m => m.profileUrl).filter(Boolean);
    if (urls.length === 0) {
      toast.error("No profile URLs available for selected messages");
      return;
    }
    if (urls.length > 5) {
      toast.warning(`Opening first 5 profiles (${urls.length} selected). Browsers may block multiple popups.`);
    }
    urls.slice(0, 5).forEach((url, i) => {
      setTimeout(() => window.open(url!, "_blank"), i * 500);
    });
    toast.success(`Opening ${Math.min(urls.length, 5)} profiles...`);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Message Queue</h2>
          <p className="text-sm text-muted-foreground mt-1">
            All your social outreach messages in one place. Copy, open profiles, and send them manually in batch.
            Once sent, use <strong>"Open Chat"</strong> to jump straight to the conversation on Facebook/Instagram and check for a reply —
            LinkedIn doesn't support a direct link to a message thread, so use <strong>"Profile"</strong> there: the Connect/Pending/Message
            button on their profile tells you whether they've accepted.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-xl font-bold">{stats.total}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</div>
            <div className="text-xl font-bold text-amber-600">{stats.pending}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Sent</div>
            <div className="text-xl font-bold text-green-600">{stats.sent}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> Accepted</div>
            <div className="text-xl font-bold text-emerald-600">{stats.accepted}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Reply className="w-3 h-3" /> Replied</div>
            <div className="text-xl font-bold text-indigo-600">{stats.replied}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Linkedin className="w-3 h-3" /> LinkedIn</div>
            <div className="text-xl font-bold text-blue-600">{stats.linkedin}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Instagram className="w-3 h-3" /> Instagram</div>
            <div className="text-xl font-bold text-pink-600">{stats.instagram}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Facebook className="w-3 h-3" /> Facebook</div>
            <div className="text-xl font-bold text-blue-700">{stats.facebook}</div>
          </Card>
        </div>

        {/* Filters & Batch Actions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="w-4 h-4" />
                Messages ({messages.length})
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select value={filterPlatform} onValueChange={(v) => setFilterPlatform(v as FilterPlatform)}>
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
                    <SelectTrigger className="h-8 w-[100px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-1.5 border-l pl-3">
                    <Badge variant="secondary" className="text-xs">{selectedIds.size} selected</Badge>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleBatchCopy}>
                      <Copy className="w-3 h-3" /> Copy All
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleBatchOpenProfiles}>
                      <ExternalLink className="w-3 h-3" /> Open Profiles
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700" onClick={handleBatchDelete}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">No messages in queue</p>
                <p className="text-xs mt-1">Generate messages from the Social Outreach tab to see them here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select All */}
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg">
                  <Checkbox
                    checked={selectedIds.size === messages.length && messages.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">Select all ({messages.length})</span>
                </div>

                {/* Message List */}
                {messages.map((msg) => {
                  const lead = leads.get(msg.leadId);
                  const PlatformIcon = PLATFORM_ICONS[msg.platform] || MessageSquare;
                  const platformColor = PLATFORM_COLORS[msg.platform] || "";

                  return (
                    <div
                      key={msg.id}
                      className={`border rounded-lg p-3 transition-all hover:shadow-sm ${
                        selectedIds.has(msg.id) ? "border-blue-300 bg-blue-50/30" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedIds.has(msg.id)}
                          onCheckedChange={() => handleToggleSelect(msg.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <Badge variant="outline" className={`text-xs gap-1 ${platformColor}`}>
                              <PlatformIcon className="w-3 h-3" />
                              {msg.platform}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {msg.messageType.replace("_", " ")}
                            </Badge>
                            <Badge
                              variant={msg.status === "sent" ? "default" : "secondary"}
                              className={`text-xs ${msg.status === "sent" ? "bg-green-100 text-green-800 border-green-200" : "bg-amber-100 text-amber-800 border-amber-200"}`}
                            >
                              {msg.status === "sent" ? <CheckCircle2 className="w-3 h-3 mr-0.5" /> : <Clock className="w-3 h-3 mr-0.5" />}
                              {msg.status}
                            </Badge>
                            {(msg as any).responseStatus === "accepted" && (
                              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                                <ThumbsUp className="w-3 h-3" /> Accepted
                              </Badge>
                            )}
                            {(msg as any).responseStatus === "replied" && (
                              <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200 gap-1">
                                <Reply className="w-3 h-3" /> Replied
                              </Badge>
                            )}
                            {(msg as any).responseStatus === "declined" && (
                              <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 gap-1">
                                <ThumbsDown className="w-3 h-3" /> Declined
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDate(msg.sentAt || msg.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium">{lead?.ownerName || "Unknown"}</span>
                            {lead?.companyName && (
                              <span className="text-xs text-muted-foreground">— {lead.companyName}</span>
                            )}
                          </div>
                          <div className="bg-muted/40 rounded-md p-2.5 mb-2">
                            <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-xs gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                              onClick={() => handleCopyAndOpen(msg.id, msg.message, msg.profileUrl, msg.status)}
                            >
                              {copiedId === msg.id ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {copiedId === msg.id ? "Copied!" : "Copy & Open Profile"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleCopyMessage(msg.id, msg.message)}
                            >
                              <Copy className="w-3 h-3" /> Copy Only
                            </Button>
                            {msg.profileUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleOpenProfile(msg.profileUrl)}
                              >
                                <ExternalLink className="w-3 h-3" /> Profile
                              </Button>
                            )}
                            {msg.status === "sent" && getDirectMessageUrl(msg.platform, msg.profileUrl) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1 text-indigo-700"
                                onClick={() => window.open(getDirectMessageUrl(msg.platform, msg.profileUrl)!, "_blank")}
                              >
                                <MessageCircle className="w-3 h-3" /> Open Chat
                              </Button>
                            )}
                            {msg.status !== "sent" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1 text-green-700"
                                onClick={() => markSentMutation.mutate(msg.id)}
                              >
                                <Send className="w-3 h-3" /> Mark as Sent
                              </Button>
                            )}
                            {msg.status === "sent" && (
                              <Select
                                value={(msg as any).responseStatus || "none"}
                                onValueChange={(v) => markResponseMutation.mutate({ id: msg.id, responseStatus: v as any })}
                              >
                                <SelectTrigger className="h-7 w-[130px] text-xs">
                                  <SelectValue placeholder="Response..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No response yet</SelectItem>
                                  <SelectItem value="accepted">Accepted</SelectItem>
                                  <SelectItem value="replied">Replied</SelectItem>
                                  <SelectItem value="declined">Declined</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1 text-red-600 hover:text-red-700"
                              onClick={() => handleDelete(msg.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {msg.characterCount || msg.message.length} chars
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
