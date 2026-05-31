import { MessageCircle } from "lucide-react";

import { StatusCard } from "@/components/app/status-card";

export default function SecretaryPage() {
  return (
    <StatusCard
      body="Secretary shell is available without touching the Gemini key in this step."
      icon={MessageCircle}
      title="Secretary"
    />
  );
}
