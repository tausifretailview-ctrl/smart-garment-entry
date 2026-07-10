import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";

/**
 * Bundled ChatProvider + FloatingChatButton so POS can lazy-load the entire
 * chat subtree as a single code-split chunk (kept off the POS critical path).
 */
export default function POSFloatingChat() {
  return (
    <ChatProvider>
      <FloatingChatButton />
    </ChatProvider>
  );
}