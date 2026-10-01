// Gemini answers in light markdown; render bold, bullets and numbered lines
// instead of raw "**", "*" and "1.".
export function FormattedAnswer({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-[0.95rem] leading-7">
      {text.split("\n").map((line, index) => {
        if (!line.trim()) return <div className="h-1" key={index} />;
        const bullet = line.match(/^(\s*)[*-]\s+(.*)$/);
        const numbered = bullet ? null : line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
        const body = bullet ? bullet[2] : numbered ? numbered[3] : line.trim();
        const parts = body.split(/\*\*(.+?)\*\*/g).map((part, partIndex) =>
          partIndex % 2 ? <strong key={partIndex}>{part}</strong> : part,
        );
        if (bullet) {
          return (
            <p className={bullet[1].length >= 2 ? "flex gap-2 pl-5" : "flex gap-2 pl-1"} key={index}>
              <span aria-hidden className="text-primary">•</span>
              <span className="min-w-0">{parts}</span>
            </p>
          );
        }
        if (numbered) {
          return (
            <p className="flex gap-2 pl-1" key={index}>
              <span className="shrink-0 font-semibold text-primary tabular-nums">{numbered[2]}.</span>
              <span className="min-w-0">{parts}</span>
            </p>
          );
        }
        return <p key={index}>{parts}</p>;
      })}
    </div>
  );
}
