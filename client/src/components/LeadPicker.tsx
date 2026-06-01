import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, Users, CheckCircle2 } from "lucide-react";

interface Lead {
  id: number;
  companyName: string;
  ownerName: string;
  email: string;
  phoneNumber: string;
  industry?: string | null;
  status: string;
  tag: string;
}

interface LeadPickerProps {
  leads: Lead[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  isLoading?: boolean;
}

export function LeadPicker({ leads, selectedIds, onChange, isLoading }: LeadPickerProps) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        !search ||
        lead.companyName.toLowerCase().includes(search.toLowerCase()) ||
        lead.ownerName.toLowerCase().includes(search.toLowerCase()) ||
        lead.email.toLowerCase().includes(search.toLowerCase()) ||
        (lead.industry && lead.industry.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus = filterStatus === "all" || lead.status === filterStatus;
      const matchesTag = filterTag === "all" || lead.tag === filterTag;

      return matchesSearch && matchesStatus && matchesTag;
    });
  }, [leads, search, filterStatus, filterTag]);

  const toggleLead = (leadId: number) => {
    if (selectedIds.includes(leadId)) {
      onChange(selectedIds.filter((id) => id !== leadId));
    } else {
      onChange([...selectedIds, leadId]);
    }
  };

  const selectAll = () => {
    const allFilteredIds = filteredLeads.map((l) => l.id);
    const merged = Array.from(new Set([...selectedIds, ...allFilteredIds]));
    onChange(merged);
  };

  const deselectAll = () => {
    const filteredIds = new Set(filteredLeads.map((l) => l.id));
    onChange(selectedIds.filter((id) => !filteredIds.has(id)));
  };

  const removeSelected = (leadId: number) => {
    onChange(selectedIds.filter((id) => id !== leadId));
  };

  const selectedLeads = leads.filter((l) => selectedIds.includes(l.id));

  return (
    <div className="space-y-3">
      {/* Selected leads summary */}
      {selectedIds.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {selectedIds.length} lead{selectedIds.length !== 1 ? "s" : ""} selected
            </span>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600" onClick={() => onChange([])}>
              Clear all
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {selectedLeads.slice(0, 10).map((lead) => (
              <Badge key={lead.id} variant="secondary" className="text-xs gap-1 pr-1">
                {lead.ownerName}
                <button
                  onClick={() => removeSelected(lead.id)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {selectedIds.length > 10 && (
              <Badge variant="outline" className="text-xs">
                +{selectedIds.length - 10} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search leads by name, company, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="converted">Converted</option>
        </select>
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All Tags</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
          <option value="follow_up">Follow Up</option>
        </select>
      </div>

      {/* Select/Deselect all */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filteredLeads.length} leads shown</span>
        <div className="flex gap-2">
          <button onClick={selectAll} className="text-blue-600 hover:underline">
            Select all shown
          </button>
          <span>|</span>
          <button onClick={deselectAll} className="text-blue-600 hover:underline">
            Deselect all shown
          </button>
        </div>
      </div>

      {/* Lead list */}
      <ScrollArea className="h-48 rounded-md border">
        {isLoading ? (
          <div className="flex items-center justify-center h-full py-8">
            <span className="text-sm text-muted-foreground">Loading leads...</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8">
            <Users className="w-6 h-6 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">
              {leads.length === 0 ? "No leads yet. Generate or import leads first." : "No leads match your filters."}
            </span>
          </div>
        ) : (
          <div className="p-1">
            {filteredLeads.map((lead) => (
              <label
                key={lead.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selectedIds.includes(lead.id)}
                  onCheckedChange={() => toggleLead(lead.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{lead.ownerName}</span>
                    <span className="text-xs text-muted-foreground truncate">@ {lead.companyName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{lead.email}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {lead.tag && lead.tag !== "none" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {lead.tag}
                    </Badge>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
