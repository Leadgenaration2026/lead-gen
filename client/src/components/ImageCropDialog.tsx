import { useState, useCallback } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface AspectOption {
  label: string;
  value: number | null; // null = freeform
}

const DEFAULT_ASPECT_OPTIONS: AspectOption[] = [
  { label: "Free", value: null },
  { label: "Square", value: 1 },
  { label: "Landscape (16:9)", value: 16 / 9 },
  { label: "Wide (3:1)", value: 3 },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draws the selected crop region to a canvas and exports it as a data URL --
// react-easy-crop only reports the crop rectangle in source-image pixels, it
// doesn't produce the cropped image itself.
async function cropToDataUrl(imageSrc: string, cropPixels: Area): Promise<string> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropPixels.width);
  canvas.height = Math.round(cropPixels.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    img,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, cropPixels.width, cropPixels.height
  );
  return canvas.toDataURL("image/png");
}

export function ImageCropDialog({
  imageSrc,
  defaultAspect,
  recommendedSize,
  onCancel,
  onConfirm,
}: {
  imageSrc: string;
  defaultAspect?: number | null;
  recommendedSize?: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | null>(defaultAspect ?? 16 / 9);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleUseCropped = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const dataUrl = await cropToDataUrl(imageSrc, croppedAreaPixels);
      onConfirm(dataUrl);
    } catch {
      onConfirm(imageSrc);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crop image</DialogTitle>
        </DialogHeader>
        {recommendedSize && <p className="text-xs text-muted-foreground -mt-2">{recommendedSize}</p>}
        <div className="relative w-full h-72 bg-muted rounded-md overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect ?? undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_ASPECT_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              type="button"
              size="sm"
              variant={aspect === opt.value ? "default" : "outline"}
              onClick={() => setAspect(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-10">Zoom</span>
          <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={([z]) => setZoom(z)} />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onConfirm(imageSrc)}>
            Skip crop, use as-is
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="button" onClick={handleUseCropped} disabled={saving || !croppedAreaPixels}>
              {saving ? "Cropping..." : "Use cropped image"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
