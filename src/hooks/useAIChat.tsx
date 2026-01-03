import { useChat } from "@/contexts/ChatContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useAIChat = () => {
  const { addMessage, setIsLoading, messages } = useChat();
  const { currentOrganization } = useOrganization();

  const sendMessage = async (message: string) => {
    if (!currentOrganization) {
      toast.error("No organization selected");
      return;
    }

    // Add user message
    addMessage({ role: "user", content: message });
    setIsLoading(true);

    try {
      // Build conversation history (last 10 messages)
      const conversationHistory = messages
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message,
          organizationId: currentOrganization.id,
          conversationHistory,
        },
      });

      if (error) {
        console.error("AI Assistant error:", error);
        
        // Check for specific error codes
        if (error.message?.includes("429")) {
          addMessage({
            role: "assistant",
            content: "I'm receiving too many requests right now. Please try again in a moment.",
          });
        } else if (error.message?.includes("402")) {
          addMessage({
            role: "assistant",
            content: "AI credits have been exhausted. Please contact your administrator.",
          });
        } else {
          addMessage({
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          });
        }
        return;
      }

      if (data?.error) {
        addMessage({
          role: "assistant",
          content: data.error,
        });
        return;
      }

      addMessage({
        role: "assistant",
        content: data?.reply || "I couldn't generate a response.",
      });
    } catch (error) {
      console.error("Chat error:", error);
      addMessage({
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { sendMessage };
};
