import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, Heading } from "lucide-react";

// A small, safe markdown-lite subset -- **bold**, *italic*, "- " bullet
// lines, "## " heading lines -- interpreted server-side by renderRichText
// (server/_core/publicPages.ts). Deliberately not a WYSIWYG/contentEditable
// editor and never stores raw HTML: the only thing that can ever be
// rendered from this text is escaped content plus our own hardcoded
// <strong>/<em>/<ul>/<h3> tags, which matters because the result is served
// publicly at /p/:slug.
export function RichTextField({
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = (prefix: string, suffix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || "text";
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  const prefixLines = (linePrefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd) || "text";
    const prefixed = block
      .split("\n")
      .map((line) => (line.startsWith(linePrefix) ? line : linePrefix + line))
      .join("\n");
    const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
    onChange(next);
    requestAnimationFrame(() => el.focus());
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Bold" onClick={() => wrapSelection("**", "**")}>
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Italic" onClick={() => wrapSelection("*", "*")}>
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Bullet list" onClick={() => prefixLines("- ")}>
          <List className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Heading" onClick={() => prefixLines("## ")}>
          <Heading className="w-3.5 h-3.5" />
        </Button>
        <span className="text-[10px] text-muted-foreground ml-1">Select text, then click a button -- or type ** bold **, * italic *, "- " for a bullet, "## " for a heading</span>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
      />
    </div>
  );
}
