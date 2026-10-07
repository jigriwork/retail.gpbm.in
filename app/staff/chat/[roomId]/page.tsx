import { AccessDenied } from "@/components/app/access-denied";
import { ChatRoom } from "@/components/chat/chat-room";
import { loadChat } from "@/lib/chat/actions";

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(roomId)) return <AccessDenied message="Chat not found." />;
  const result = await loadChat(roomId);
  if (!result.data) return <AccessDenied message={result.error ?? "Chat not found."} />;
  return <ChatRoom basePath={{ app: "/app/chat", staff: "/staff/chat" }} initial={result.data} roomId={roomId} />;
}
