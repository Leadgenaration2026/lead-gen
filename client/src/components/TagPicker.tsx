import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Plus, Tag as TagIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TagPickerProps {
  leadIds: number[];
  recommendedName?: string;
  onConfirm: (leadSetId: number, tagName: string) => void;
}

// Mandatory approval gate: "which tag should these verified leads go to?"
// Combines the searchable Command/Popover mechanics already used for the
// industry filter (client/src/pages/Leads.tsx) with an inline "+ Create new
// tag" row (replacing that page's separate two-step dialog-then-panel
// pattern with one inline flow), backed by the existing, unmodified
// leadSets.create/assignLeads mutations. A recommended tag is pre-highlighted
// but NEVER auto-assigned -- the user must click Confirm & Continue.
export function TagPicker({ leadIds, recommendedName, onConfirm }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(
    recommendedName ? { id: -1, name: recommendedName } : null
  );
  const [confirming, setConfirming] = useState(false);

  const tagsQuery = trpc.leadSets.listTags.useQuery();
  const createTagMutation = trpc.leadSets.create.useMutation();
  const assignLeadsMutation = trpc.leadSets.assignLeads.useMutation();

  const tags = tagsQuery.data || [];
  const isNewTag = selected?.id === -1;
  const searchMatchesExisting = tags.some((t: any) => t.name.toLowerCase() === search.trim().toLowerCase());

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      let leadSetId = selected.id;
      if (isNewTag) {
        const result = await createTagMutation.mutateAsync({ name: selected.name });
        if (!result.id) throw new Error("Failed to create tag");
        leadSetId = result.id;
      }
      await assignLeadsMutation.mutateAsync({ leadIds, leadSetId });
      toast.success(`${leadIds.length} lead(s) assigned to "${selected.name}"`);
      onConfirm(leadSetId, selected.name);
    } catch (error: any) {
      toast.error(error?.message || "Failed to assign leads");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <strong>{leadIds.length}</strong> valid lead{leadIds.length === 1 ? "" : "s"} ready. Which tag should they go to?
      </p>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between">
            <span className="flex items-center gap-1.5 truncate">
              <TagIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              {selected ? selected.name : "Select or create a tag..."}
              {isNewTag && <span className="text-xs text-muted-foreground">(new)</span>}
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No tags yet.</CommandEmpty>
              <CommandGroup>
                {tags.map((t: any) => (
                  <CommandItem
                    key={t.id}
                    value={t.name}
                    onSelect={() => { setSelected({ id: t.id, name: t.name }); setOpen(false); }}
                  >
                    <Check className={`w-3.5 h-3.5 mr-2 ${selected?.id === t.id ? "opacity-100" : "opacity-0"}`} />
                    {t.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              {search.trim() && !searchMatchesExisting && (
                <CommandGroup>
                  <CommandItem value={`create-${search}`} onSelect={() => { setSelected({ id: -1, name: search.trim() }); setOpen(false); }}>
                    <Plus className="w-3.5 h-3.5 mr-2" /> Create new tag "{search.trim()}"
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {recommendedName && selected?.name === recommendedName && (
        <p className="text-xs text-muted-foreground">Recommended based on your search criteria -- change it above if you'd like.</p>
      )}
      <Button onClick={handleConfirm} disabled={!selected || confirming} className="w-full gap-1.5">
        {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Confirm & Continue
      </Button>
    </div>
  );
}
