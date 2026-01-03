import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/contexts/ChatContext";
import { ChatDialog } from "./ChatDialog";
import { cn } from "@/lib/utils";

export const FloatingChatButton = () => {
  const { isOpen, setIsOpen } = useChat();

  return (
    <>
      <ChatDialog />
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-all duration-300 hover:scale-110",
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
