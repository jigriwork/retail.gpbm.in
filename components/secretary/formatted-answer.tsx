import type { ReactNode } from "react";

// Gemini answers in light markdown; render headings, bold, bullets and
// numbered lines instead of raw "#", "**", "*" and "1.". While an answer is
// still arriving, a half-written "**" is hidden instead of shown raw.

function inline(text: string): ReactNode[] {
  const pairs = text.split("**").length - 1;
  const safe = pairs % 2 ? text.slice(0, text.lastIndexOf("**")) + text.slice(text.lastIndexOf("**") + 2) : text;
  return safe.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : part));
}

export function FormattedAnswer({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-[0.95rem] leading-7">
      {text.split("\n").map((line, index) => {
        if (!line.trim()) return <div className="h-1" key={index} />;
        const heading = line.match(/^\s*#{1,4}\s+(.*)$/);
        if (heading) {
          return (
            <p className="pt-1 font-display text-base font-bold" key={index}>
              {inline(heading[1])}
            </p>
          );
        }
        const bullet = line.match(/^(\s*)[*-]\s+(.*)$/);
        if (bullet) {
          return (
            <p className={bullet[1].length >= 2 ? "flex gap-2 pl-5" : "flex gap-2 pl-1"} key={index}>
              <span aria-hidden className="text-primary">•</span>
              <span className="min-w-0">{inline(bullet[2])}</span>
            </p>
          );
        }
        const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <p className="flex gap-2 pl-1" key={index}>
              <span className="shrink-0 font-semibold tabular-nums text-primary">{numbered[2]}.</span>
              <span className="min-w-0">{inline(numbered[3])}</span>
            </p>
          );
        }
        return <p key={index}>{inline(line.trim())}</p>;
      })}
    </div>
  );
}
