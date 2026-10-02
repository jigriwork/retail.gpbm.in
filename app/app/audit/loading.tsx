import { PageLoading } from "@/components/app/page-loading";

export default function Loading() {
  return (
    <PageLoading
      note="Large report: it reads every sale and stock line, so it can take up to about 30 seconds. Please keep this page open."
      title="Loading the weekly audit…"
    />
  );
}
