import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Wand2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function LeadsPage() {
  const leadsQuery = trpc.leads.list.useQuery();
  const generateLeadsMutation = trpc.leads.generate.useMutation();
  const deleteLeadMutation = trpc.leads.delete.useMutation();

  const [instruction, setInstruction] = useState("");
  const [count, setCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateLeads = async () => {
    if (!instruction.trim()) {
      toast.error("Please enter an instruction");
      return;
    }

    setIsGenerating(true);
    try {
      await generateLeadsMutation.mutateAsync({
        instruction,
        count,
      });
      toast.success(`Generated ${count} leads successfully`);
      setInstruction("");
      leadsQuery.refetch();
    } catch (error) {
      toast.error("Failed to generate leads");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    try {
      await deleteLeadMutation.mutateAsync(leadId);
      toast.success("Lead deleted");
      leadsQuery.refetch();
    } catch (error) {
      toast.error("Failed to delete lead");
    }
  };

  return (
    <div className="space-y-6">
      {/* Generate Leads Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            AI-Powered Lead Generation
          </CardTitle>
          <CardDescription>
            Describe what leads you want, and our AI will generate them for you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Your Instructions</label>
            <Textarea
              placeholder="E.g., Generate leads for SaaS companies in the US with 50-500 employees in the tech industry..."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="mt-2 min-h-24"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Number of Leads</label>
              <Input
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 10)}
                className="mt-2"
              />
            </div>
          </div>
          <Button
            onClick={handleGenerateLeads}
            disabled={isGenerating || generateLeadsMutation.isPending}
            className="w-full gap-2"
          >
            {isGenerating || generateLeadsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate Leads
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Leads List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Leads ({leadsQuery.data?.length || 0})</CardTitle>
          <CardDescription>Manage and organize your generated leads</CardDescription>
        </CardHeader>
        <CardContent>
          {leadsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : leadsQuery.data && leadsQuery.data.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadsQuery.data.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.companyName}</TableCell>
                      <TableCell>{lead.ownerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.email}</TableCell>
                      <TableCell className="text-sm">{lead.phoneNumber}</TableCell>
                      <TableCell>
                        <Badge variant={
                          lead.status === "new" ? "secondary" :
                          lead.status === "contacted" ? "outline" :
                          lead.status === "qualified" ? "default" :
                          lead.status === "converted" ? "default" :
                          "destructive"
                        }>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLead(lead.id)}
                          disabled={deleteLeadMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Plus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No leads yet. Generate some to get started!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
