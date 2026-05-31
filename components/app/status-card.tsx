import type { LucideIcon } from "lucide-react";

export function StatusCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <Icon className="mb-5 size-5 text-muted" />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}
