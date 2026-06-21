export default function TodayLoading() {
  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="h-4 w-24 rounded-full bg-muted/20" />
        <div className="mt-3 h-8 w-64 max-w-full rounded-full bg-muted/20" />
        <div className="mt-3 h-4 w-80 max-w-full rounded-full bg-muted/20" />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={index}>
            <div className="h-5 w-5 rounded-full bg-muted/20" />
            <div className="mt-5 h-3 w-24 rounded-full bg-muted/20" />
            <div className="mt-3 h-6 w-20 rounded-full bg-muted/20" />
          </div>
        ))}
      </section>
    </div>
  );
}
