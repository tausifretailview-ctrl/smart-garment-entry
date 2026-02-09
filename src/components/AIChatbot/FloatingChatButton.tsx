import { useChat } from "@/contexts/ChatContext";
import { ChatDialog } from "./ChatDialog";
import { useUserPermissions } from "@/hooks/useUserPermissions";

export const FloatingChatButton = () => {
  const { hasSpecialPermission, loading } = useUserPermissions();

  // Don't show chatbot dialog if user doesn't have permission (admins always have access)
  if (loading || !hasSpecialPermission("ai_chatbot")) {
    return null;
  }

  // Only render the ChatDialog - the button is now in the sidebar
  return <ChatDialog />;
};
