import { CheckSquare } from "lucide-react";

import { StatusCard } from "@/components/app/status-card";

export default function TasksPage() {
  return (
    <StatusCard
      body="Task navigation is protected. Private owner tasks stay hidden by RLS and role checks."
      icon={CheckSquare}
      title="Tasks"
    />
  );
}
