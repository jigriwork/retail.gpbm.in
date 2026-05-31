import { BarChart3 } from "lucide-react";

import { StatusCard } from "@/components/app/status-card";

export default function ReportsPage() {
  return (
    <StatusCard
      body="Reports navigation is protected and ready. Upload and analysis workflows come next."
      icon={BarChart3}
      title="Reports"
    />
  );
}
