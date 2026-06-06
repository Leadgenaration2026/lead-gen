import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Inbox, Paperclip, Star, Reply, MoreHorizontal, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface EmailPreviewDialogProps {
  subject: string;
  body: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientCompany?: string;
  senderName?: string;
  senderEmail?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EmailPreviewDialog({
  subject,
  body,
  recipientName,
  recipientEmail,
  recipientCompany,
  senderName,
  senderEmail,
  trigger,
  open,
  onOpenChange,
}: EmailPreviewDialogProps) {
  const settingsQuery = trpc.settings.get.useQuery();
  const signatureQuery = trpc.signature.get.useQuery();

  const displaySenderName = senderName || settingsQuery.data?.senderName || "Nitin Sharma";
  const displaySenderEmail = senderEmail || settingsQuery.data?.senderEmail || "nitin@virtualassistant-group.com";
  const displayRecipientName = recipientName || "Recipient";
  const displayRecipientEmail = recipientEmail || "recipient@company.com";

  // Format the signature for preview
  const signaturePlainText = signatureQuery.data?.signaturePlainText || "";

  // Parse the email body - handle both HTML and plain text
  const isHtml = body.includes("<") && body.includes(">");

  // Get current date formatted like email clients show it
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Get initials for avatar
  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden p-0">
        <div className="flex flex-col h-full max-h-[85vh]">
          {/* Gmail-style header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Preview as Recipient</span>
            </div>
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              How {displayRecipientName} sees this email
            </Badge>
          </div>

          {/* Email content area */}
          <div className="flex-1 overflow-y-auto">
            {/* Subject line */}
            <div className="px-6 pt-5 pb-3">
              <h2 className="text-xl font-normal text-gray-900 leading-tight">{subject || "(No subject)"}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs font-normal">Inbox</Badge>
              </div>
            </div>

            {/* Sender info */}
            <div className="px-6 py-3 flex items-start gap-3 border-b">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium text-sm shrink-0">
                {getInitials(displaySenderName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900">{displaySenderName}</span>
                  <span className="text-xs text-gray-500">&lt;{displaySenderEmail}&gt;</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs text-gray-500">to me</span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">{dateStr} at {timeStr}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                  <Star className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                  <Reply className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Email body */}
            <div className="px-6 py-5">
              <div
                className="text-sm leading-relaxed text-gray-800"
                style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", lineHeight: "1.6" }}
              >
                {isHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: body }} />
                ) : (
                  <div className="whitespace-pre-wrap">{body}</div>
                )}

                {/* Signature - rendered in same font */}
                {signaturePlainText && !body.includes(signaturePlainText.split("\n")[0]) && (
                  <div
                    className="mt-6 pt-4 text-gray-700"
                    style={{ fontFamily: "inherit", fontSize: "inherit" }}
                  >
                    {signaturePlainText.split("\n").map((line, i) => {
                      const trimmed = line.trim();
                      if (!trimmed) return <br key={i} />;
                      // Make URLs clickable
                      const urlRegex = /(https?:\/\/[^\s]+)/g;
                      const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
                      let processed = trimmed;
                      if (urlRegex.test(processed)) {
                        return (
                          <p key={i} style={{ margin: 0, padding: 0, lineHeight: "1.5" }}>
                            {processed.split(urlRegex).map((part, j) =>
                              urlRegex.test(part) ? (
                                <a key={j} href={part} className="text-blue-600 no-underline">{part}</a>
                              ) : part
                            )}
                          </p>
                        );
                      }
                      if (emailRegex.test(processed)) {
                        return (
                          <p key={i} style={{ margin: 0, padding: 0, lineHeight: "1.5" }}>
                            {processed.split(emailRegex).map((part, j) =>
                              emailRegex.test(part) ? (
                                <a key={j} href={`mailto:${part}`} className="text-blue-600 no-underline">{part}</a>
                              ) : part
                            )}
                          </p>
                        );
                      }
                      return <p key={i} style={{ margin: 0, padding: 0, lineHeight: "1.5" }}>{processed}</p>;
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer actions - like Gmail */}
            <div className="px-6 py-3 border-t bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1.5 rounded-full" disabled>
                  <Reply className="w-3.5 h-3.5" /> Reply
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1.5 rounded-full" disabled>
                  Forward
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
