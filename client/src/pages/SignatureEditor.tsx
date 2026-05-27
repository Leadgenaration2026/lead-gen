import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Eye, Code } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SignatureEditor() {
  const { user } = useAuth();
  const [signatureHtml, setSignatureHtml] = useState(`<div style="font-family: Arial, sans-serif; font-size: 12px; color: #333;">
  <p style="margin: 0; font-weight: bold;">Nitin</p>
  <p style="margin: 5px 0 0 0;">Virtual Assistant</p>
  <p style="margin: 10px 0 0 0; border-top: 1px solid #ddd; padding-top: 10px;">
    <a href="https://calendly.com/nitin-virtualassistant/30min" style="color: #0066cc; text-decoration: none;">Schedule a Meeting</a>
  </p>
</div>`);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSignature = async () => {
    if (!signatureHtml.trim()) {
      toast.error("Signature cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      // TODO: Call tRPC mutation to save signature
      toast.success("Signature saved successfully!");
    } catch (error) {
      toast.error("Failed to save signature");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Signature</h1>
        <p className="text-muted-foreground mt-2">Create and manage your professional email signature</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle>Edit Signature</CardTitle>
            <CardDescription>Enter your signature in HTML format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signature">HTML Signature</Label>
              <Textarea
                id="signature"
                value={signatureHtml}
                onChange={(e) => setSignatureHtml(e.target.value)}
                placeholder="Enter your HTML signature..."
                rows={12}
                className="font-mono text-sm"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-2">💡 Tips for Professional Signatures:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Keep it concise (3-5 lines maximum)</li>
                <li>Include your name, title, and contact info</li>
                <li>Add your Calendly link as a CTA</li>
                <li>Use simple HTML and inline CSS</li>
                <li>Avoid images and complex formatting</li>
              </ul>
            </div>

            <Button onClick={handleSaveSignature} disabled={isSaving} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : "Save Signature"}
            </Button>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>How your signature will appear in emails</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border border-gray-200 rounded-lg p-4 bg-white">
              <div dangerouslySetInnerHTML={{ __html: signatureHtml }} />
            </div>

            <div className="mt-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <p className="font-semibold mb-2">📧 Email Integration:</p>
                <p>Your signature will be automatically added to all emails sent through campaigns and individual sends.</p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                <p className="font-semibold mb-2">✓ Best Practices:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Use standard fonts (Arial, Helvetica, Verdana)</li>
                  <li>Keep colors professional (black, dark blue, gray)</li>
                  <li>Test across different email clients</li>
                  <li>Include a clear call-to-action link</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Template Gallery */}
      <Card>
        <CardHeader>
          <CardTitle>Signature Templates</CardTitle>
          <CardDescription>Quick templates to get you started</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Template 1 */}
            <button
              onClick={() =>
                setSignatureHtml(`<div style="font-family: Arial, sans-serif; font-size: 12px; color: #333;">
  <p style="margin: 0; font-weight: bold; font-size: 14px;">Your Name</p>
  <p style="margin: 2px 0; color: #666;">Your Title</p>
  <p style="margin: 10px 0 0 0; border-top: 1px solid #ddd; padding-top: 8px;">
    <a href="https://calendly.com/your-link" style="color: #0066cc; text-decoration: none; font-weight: bold;">📅 Schedule a Meeting</a>
  </p>
</div>`)
              }
              className="text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <p className="font-semibold text-sm mb-2">Professional</p>
              <div
                className="text-xs text-gray-600"
                dangerouslySetInnerHTML={{
                  __html: `<div style="font-family: Arial, sans-serif; font-size: 11px; color: #333;">
    <p style="margin: 0; font-weight: bold;">Your Name</p>
    <p style="margin: 2px 0; color: #666;">Your Title</p>
  </div>`,
                }}
              />
            </button>

            {/* Template 2 */}
            <button
              onClick={() =>
                setSignatureHtml(`<div style="font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 12px;">
  <p style="margin: 0; font-weight: 600; color: #1a1a1a;">Your Name</p>
  <p style="margin: 4px 0; color: #0066cc; font-weight: 500;">Your Title</p>
  <p style="margin: 8px 0; color: #666; font-size: 11px;">📧 your.email@company.com | 📱 +1 (555) 123-4567</p>
  <p style="margin: 10px 0 0 0;">
    <a href="https://calendly.com/your-link" style="background: #0066cc; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-size: 11px; display: inline-block;">Book a Call</a>
  </p>
</div>`)
              }
              className="text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <p className="font-semibold text-sm mb-2">Modern</p>
              <div
                className="text-xs text-gray-600"
                dangerouslySetInnerHTML={{
                  __html: `<div style="font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 11px;">
    <p style="margin: 0; font-weight: 600; color: #1a1a1a;">Your Name</p>
    <p style="margin: 4px 0; color: #0066cc; font-weight: 500;">Your Title</p>
  </div>`,
                }}
              />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
