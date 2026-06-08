import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, Trash2, Pencil, Users, Mail, MousePointer, Phone, MessageCircle,
  Linkedin, Instagram, Facebook, Globe, Filter, X, CheckCircle2, AlertCircle,
  Loader2, ExternalLink
} from "lucide-react";

export default function AllLeads() {
  const [search, setSearch] = useState("");
  const [filterSet, setFilterSet] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterEngagement, setFilterEngagement] = useState<string>("all");
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const leadsQuery = trpc.leads.listWithStatus.useQuery();
  const leadSetsQuery = trpc.leadSets.list.useQuery();
  const updateMutation = trpc.leads.update.useMutation({
    onSuccess: () => {
      toast.success("Lead updated successfully");
      setEditingLead(null);
      leadsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.leads.delete.useMutation({
    onSuccess: () => {
      toast.success("Lead deleted");
      setDeletingLeadId(null);
      leadsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredLeads = useMemo(() => {
    if (!leadsQuery.data) return [];
    let result = leadsQuery.data;

    // Search filter
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        l.companyName.toLowerCase().includes(s) ||
        l.ownerName.toLowerCase().includes(s) ||
        l.email.toLowerCase().includes(s) ||
        (l.industry || "").toLowerCase().includes(s)
      );
    }

    // Lead set filter
    if (filterSet !== "all") {
      const setId = parseInt(filterSet);
      result = result.filter(l => l.leadSetId === setId);
    }

    // Status filter
    if (filterStatus !== "all") {
      result = result.filter(l => l.status === filterStatus);
    }

    // Engagement filter
    if (filterEngagement === "engaged") {
      result = result.filter(l => l.engagement.emailsOpened > 0 || l.engagement.emailsClicked > 0 || l.engagement.replied);
    } else if (filterEngagement === "unengaged") {
      result = result.filter(l => l.engagement.emailsSent > 0 && l.engagement.emailsOpened === 0);
    } else if (filterEngagement === "not_contacted") {
      result = result.filter(l => l.engagement.emailsSent === 0);
    }

    return result;
  }, [leadsQuery.data, search, filterSet, filterStatus, filterEngagement]);

  const handleEdit = (lead: any) => {
    setEditingLead(lead);
    setEditForm({
      companyName: lead.companyName,
      ownerName: lead.ownerName,
      email: lead.email,
      phoneNumber: lead.phoneNumber,
      website: lead.website || "",
      industry: lead.industry || "",
      linkedinUrl: lead.linkedinUrl || "",
      instagramUrl: lead.instagramUrl || "",
      facebookUrl: lead.facebookUrl || "",
      status: lead.status,
      tag: lead.tag,
    });
  };

  const handleSaveEdit = () => {
    if (!editingLead) return;
    updateMutation.mutate({ id: editingLead.id, data: editForm });
  };

  const getEngagementBadge = (engagement: any) => {
    if (engagement.replied) return <Badge className="bg-green-100 text-green-800 text-xs">Replied</Badge>;
    if (engagement.emailsClicked > 0) return <Badge className="bg-blue-100 text-blue-800 text-xs">Clicked</Badge>;
    if (engagement.emailsOpened > 0) return <Badge className="bg-yellow-100 text-yellow-800 text-xs">Opened</Badge>;
    if (engagement.emailsSent > 0) return <Badge className="bg-gray-100 text-gray-800 text-xs">Sent</Badge>;
    return <Badge variant="outline" className="text-xs">Not Contacted</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">All Leads</h1>
          <p className="text-muted-foreground">Manage all your leads in one place — view status, edit, or delete.</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {filteredLeads.length} / {leadsQuery.data?.length || 0} leads
        </Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, email, industry..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterSet} onValueChange={setFilterSet}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Lead Set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sets</SelectItem>
                {leadSetsQuery.data?.map(set => (
                  <SelectItem key={set.id} value={String(set.id)}>{set.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEngagement} onValueChange={setFilterEngagement}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Engagement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Engagement</SelectItem>
                <SelectItem value="engaged">Engaged (Opened/Clicked)</SelectItem>
                <SelectItem value="unengaged">Unengaged (Sent, No Open)</SelectItem>
                <SelectItem value="not_contacted">Not Contacted</SelectItem>
              </SelectContent>
            </Select>
            {(search || filterSet !== "all" || filterStatus !== "all" || filterEngagement !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterSet("all"); setFilterStatus("all"); setFilterEngagement("all"); }}>
                <X className="w-4 h-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      {leadsQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No leads found matching your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredLeads.map((lead) => (
            <Card key={lead.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-4">
                  {/* Lead Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm truncate">{lead.ownerName}</span>
                      <span className="text-muted-foreground text-xs">@</span>
                      <span className="text-sm text-muted-foreground truncate">{lead.companyName}</span>
                      {lead.tag && lead.tag !== "none" && (
                        <Badge variant="outline" className={`text-xs ${
                          lead.tag === "hot" ? "border-red-300 text-red-700" :
                          lead.tag === "warm" ? "border-orange-300 text-orange-700" :
                          lead.tag === "cold" ? "border-blue-300 text-blue-700" :
                          "border-purple-300 text-purple-700"
                        }`}>{lead.tag}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{lead.email}</span>
                      {lead.industry && <span>• {lead.industry}</span>}
                    </div>
                    {/* Social profiles */}
                    <div className="flex items-center gap-2 mt-1">
                      {lead.linkedinUrl && (
                        <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                          <Linkedin className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {lead.instagramUrl && (
                        <a href={lead.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:text-pink-800">
                          <Instagram className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {(lead as any).facebookUrl && (
                        <a href={(lead as any).facebookUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-900">
                          <Facebook className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {lead.website && (
                        <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-800">
                          <Globe className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Engagement Stats */}
                  <div className="flex items-center gap-3">
                    {getEngagementBadge(lead.engagement)}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5" title="Emails Sent">
                        <Mail className="w-3 h-3" /> {lead.engagement.emailsSent}
                      </span>
                      <span className="flex items-center gap-0.5" title="Opened">
                        <CheckCircle2 className="w-3 h-3 text-green-600" /> {lead.engagement.emailsOpened}
                      </span>
                      <span className="flex items-center gap-0.5" title="Clicked">
                        <MousePointer className="w-3 h-3 text-blue-600" /> {lead.engagement.emailsClicked}
                      </span>
                      {lead.engagement.socialSent > 0 && (
                        <span className="flex items-center gap-0.5" title="Social Messages">
                          <MessageCircle className="w-3 h-3 text-purple-600" /> {lead.engagement.socialSent}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(lead)} className="h-8 w-8 p-0">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeletingLeadId(lead.id)} className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingLead} onOpenChange={() => setEditingLead(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Owner Name</label>
                <Input value={editForm.ownerName || ""} onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Company Name</label>
                <Input value={editForm.companyName || ""} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input value={editForm.phoneNumber || ""} onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Website</label>
                <Input value={editForm.website || ""} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Industry</label>
                <Input value={editForm.industry || ""} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} />
              </div>
            </div>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Users className="w-3 h-3" /> Social Profiles
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Linkedin className="w-4 h-4 text-blue-600 shrink-0" />
                  <Input value={editForm.linkedinUrl || ""} onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/..." className="text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <Instagram className="w-4 h-4 text-pink-600 shrink-0" />
                  <Input value={editForm.instagramUrl || ""} onChange={(e) => setEditForm({ ...editForm, instagramUrl: e.target.value })} placeholder="https://instagram.com/..." className="text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <Facebook className="w-4 h-4 text-blue-700 shrink-0" />
                  <Input value={editForm.facebookUrl || ""} onChange={(e) => setEditForm({ ...editForm, facebookUrl: e.target.value })} placeholder="https://facebook.com/..." className="text-sm" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tag</label>
                <Select value={editForm.tag} onValueChange={(v) => setEditForm({ ...editForm, tag: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLead(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingLeadId} onOpenChange={() => setDeletingLeadId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this lead? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingLeadId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingLeadId && deleteMutation.mutate(deletingLeadId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
