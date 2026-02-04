import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/ChatContext";
import { ChatDialog } from "./ChatDialog";
import { cn } from "@/lib/utils";
import { useUserPermissions } from "@/hooks/useUserPermissions";

export const FloatingChatButton = () => {
  const { isOpen, setIsOpen } = useChat();
  const { hasSpecialPermission, loading } = useUserPermissions();

  // Don't show chatbot if user doesn't have permission (admins always have access)
  if (loading || !hasSpecialPermission("ai_chatbot")) {
    return null;
  }

  return (
    <>
      <ChatDialog />
      {/* Hidden on mobile to avoid overlap with MobileFAB */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-all duration-300 hover:scale-110",
          "hidden lg:flex", // Hide on mobile
          isOpen
            ? "bg-destructive hover:bg-destructive/90"
            : "bg-primary hover:bg-primary/90"
        )}
        size="icon"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </Button>
    </>
  );
};
