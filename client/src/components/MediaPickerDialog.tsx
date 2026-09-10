import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { ImageCropDialog } from "@/components/ImageCropDialog";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// One reusable "choose an image" control, dropped in everywhere a landing
// page needs media (logo, hero/section image, section background): upload +
// crop a new file, or reuse anything ever uploaded before via the Gallery
// tab (backed by media.list) -- previously every upload was a one-shot with
// no way to find or reuse it again later, from a different page or session.
export function MediaPickerDialog({
  value,
  onSelect,
  recommendedSize,
  aspect,
  triggerLabel,
}: {
  value?: string;
  onSelect: (url: string) => void;
  recommendedSize?: string;
  aspect?: number | null;
  triggerLabel?: string;
}) {
  const [mode, setMode] = useState<"closed" | "picker" | "cropping">("closed");
  const [pendingSrc, setPendingSrc] = useState("");
  const [pendingFilename, setPendingFilename] = useState("upload.png");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const mediaListQuery = trpc.media.list.useQuery(undefined, { enabled: mode === "picker" });
  const uploadMutation = trpc.media.uploadImage.useMutation();
  const deleteMutation = trpc.media.delete.useMutation();

  const handleFile = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setPendingSrc(dataUrl);
    setPendingFilename(file.name);
    setMode("cropping");
  };

  const handleCropConfirm = async (croppedDataUrl: string) => {
    setMode("closed");
    try {
      const { url } = await uploadMutation.mutateAsync({ dataUrl: croppedDataUrl, filename: pendingFilename });
      utils.media.list.invalidate();
      onSelect(url);
    } catch (error: any) {
      toast.error(error?.message || "Upload failed");
    }
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
    utils.media.list.invalidate();
  };

  return (
    <>
      <div className="space-y-1">
        {value ? (
          <div className="flex items-center gap-2">
            <img src={value} alt="" className="h-14 w-14 object-cover rounded border" />
            <div className="flex flex-col gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => setMode("picker")}>
                {triggerLabel || "Change image"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onSelect("")}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setMode("picker")}>
            <ImageIcon className="w-3.5 h-3.5" /> {triggerLabel || "Choose image"}
          </Button>
        )}
        {recommendedSize && <p className="text-xs text-muted-foreground">{recommendedSize}</p>}
      </div>

      {mode === "picker" && (
        <Dialog open onOpenChange={(v) => !v && setMode("closed")}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Choose an image</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="upload">
              <TabsList>
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="gallery">Gallery</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="space-y-2 pt-3">
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" /> Upload file
                </Button>
                {recommendedSize && <p className="text-xs text-muted-foreground">{recommendedSize}</p>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </TabsContent>
              <TabsContent value="gallery" className="pt-3">
                {mediaListQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : !mediaListQuery.data?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No uploads yet -- anything you upload anywhere in the app will show up here so you can reuse it.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                    {mediaListQuery.data.map((asset: any) => (
                      <div
                        key={asset.id}
                        className="relative group aspect-square rounded border overflow-hidden hover:ring-2 hover:ring-primary cursor-pointer"
                        onClick={() => { setMode("closed"); onSelect(asset.url); }}
                        title={asset.filename}
                      >
                        <img src={asset.url} alt={asset.filename} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                          title="Remove from gallery"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}

      {mode === "cropping" && (
        <ImageCropDialog
          imageSrc={pendingSrc}
          defaultAspect={aspect}
          recommendedSize={recommendedSize}
          onCancel={() => setMode("closed")}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  );
}
