import { ChatList } from "@/components/chat/chat-list";
import { requireProfile } from "@/lib/auth/session";

export default async function ChatsPage() {
  const { profile } = await requireProfile();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">💬 Chat</h1>
      <ChatList base="/app/chat" profile={profile} />
    </div>
  );
}
