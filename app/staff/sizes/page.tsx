import { SizeScan } from "@/components/app/size-scan";

export default function StaffSizesPage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-muted">For customers</p>
        <h1 className="mt-2 text-3xl font-semibold">Check sizes</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Scan the tag to tell the customer which sizes are in stock, without going to the godown or the counter.</p>
      </div>
      <SizeScan />
    </div>
  );
}
