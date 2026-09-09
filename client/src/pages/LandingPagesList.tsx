import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function LandingPagesList() {
  const [, navigate] = useLocation();
  const listQuery = trpc.landingPages.list.useQuery();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.landingPages.delete.useMutation();

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This removes the landing page and its generated emails permanently.`)) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Deleted");
      utils.landingPages.list.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-primary" /> Landing Pages</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-generated landing pages with a matching 8-email sequence.</p>
        </div>
        <Button onClick={() => navigate("/landing-pages/new")} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Landing Page
        </Button>
      </div>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (listQuery.data || []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground mb-4">No landing pages yet.</p>
            <Button onClick={() => navigate("/landing-pages/new")} className="gap-1.5">
              <Plus className="w-4 h-4" /> Generate your first one
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(listQuery.data || []).map((page: any) => (
            <Card key={page.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/landing-pages/${page.id}`)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base truncate">{page.name}</CardTitle>
                  <Badge variant={page.status === "published" ? "default" : "outline"} className="shrink-0">{page.status}</Badge>
                </div>
                <CardDescription className="truncate">{page.industry || "No industry set"}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between pt-0">
                <span className="text-xs text-muted-foreground">{new Date(page.createdAt).toLocaleDateString()}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="gap-1 text-xs h-7" onClick={(e) => { e.stopPropagation(); navigate(`/landing-pages/${page.id}`); }}>
                    Open <ArrowRight className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleDelete(page.id, page.name); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
