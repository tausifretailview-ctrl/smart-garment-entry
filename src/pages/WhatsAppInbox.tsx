import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useVisibilityRefetch } from "@/hooks/useVisibilityRefetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  MessageSquare, 
  Send, 
  User, 
  Phone, 
  Clock, 
  CheckCheck, 
  Check,
  RefreshCw,
  Search,
  ArrowLeft,
  Users,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  unread_count: number;
  status: string;
}

interface Message {
  id: string;
  direction: string;
  message_type: string;
  message_text: string | null;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

const WhatsAppInbox = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Visibility-based polling - pauses when tab is hidden
  const conversationsRefetchInterval = useVisibilityRefetch(60000); // 1 minute
  const messagesRefetchInterval = useVisibilityRefetch(30000); // 30 seconds

  // Check if using shared WhatsApp number
  const { data: whatsappSettings } = useQuery({
    queryKey: ['whatsapp-api-settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      const { data, error } = await supabase
        .from('whatsapp_api_settings')
        .select('use_default_api, phone_number_id')
        .eq('organization_id', currentOrganization.id)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Check if phone_number_id is shared by multiple orgs (for non-default API users)
  const { data: sharedNumberInfo } = useQuery({
    queryKey: ['shared-number-check', whatsappSettings?.phone_number_id],
    queryFn: async () => {
      if (!whatsappSettings?.phone_number_id || whatsappSettings.use_default_api) return null;
      
      const { data, error } = await supabase
        .from('whatsapp_api_settings')
        .select('organization_id')
        .eq('phone_number_id', whatsappSettings.phone_number_id)
        .eq('use_default_api', false);
      
      if (error) return null;
      return { count: data?.length || 0, isShared: (data?.length || 0) > 1 };
    },
    enabled: !!whatsappSettings?.phone_number_id && !whatsappSettings.use_default_api,
  });

  const isUsingSharedNumber = whatsappSettings?.use_default_api || sharedNumberInfo?.isShared;

  // Fetch conversations
  const { data: conversations = [], isLoading: loadingConversations, refetch: refetchConversations } = useQuery({
    queryKey: ['whatsapp-conversations', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .order('last_message_at', { ascending: false });
      
      if (error) throw error;
      return data as Conversation[];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000, // 30 seconds stale time
    refetchInterval: conversationsRefetchInterval, // Pauses when tab hidden
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ['whatsapp-messages', selectedConversation?.id],
    queryFn: async () => {
      if (!selectedConversation?.id) return [];
      
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', selectedConversation.id)
        .order('sent_at', { ascending: true });
      
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!selectedConversation?.id,
    staleTime: 15000, // 15 seconds stale time
    refetchInterval: messagesRefetchInterval, // Pauses when tab hidden
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      if (!selectedConversation || !currentOrganization?.id) {
        throw new Error("No conversation selected");
      }

      // Get WhatsApp API settings
      const { data: settings } = await supabase
        .from('whatsapp_api_settings')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .single();

      if (!settings?.is_active) {
        throw new Error("WhatsApp API is not active");
      }

      // Send via edge function
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          phone: selectedConversation.customer_phone,
          message: messageText,
          messageType: 'text',
          organizationId: currentOrganization.id,
        },
      });

      if (error) throw error;
      
      // Add message to conversation
      const { error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          organization_id: currentOrganization.id,
          conversation_id: selectedConversation.id,
          direction: 'outbound',
          message_type: 'text',
          message_text: messageText,
          wamid: data?.messageId,
          status: 'sent',
        });

      if (insertError) throw insertError;

      // Update conversation last_message_at
      await supabase
        .from('whatsapp_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedConversation.id);

      return data;
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', selectedConversation?.id] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      toast.success("Message sent!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send message");
    },
  });

  // Mark messages as read when conversation is selected
  useEffect(() => {
    if (selectedConversation?.id && selectedConversation.unread_count > 0) {
      supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0 })
        .eq('id', selectedConversation.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
        });
    }
  }, [selectedConversation?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!currentOrganization?.id) return;

    const channel = supabase
      .channel('whatsapp-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
          queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_conversations',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrganization?.id, queryClient]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessageMutation.mutate(newMessage.trim());
    }
  };

  const filteredConversations = conversations.filter(conv => 
    conv.customer_phone.includes(searchQuery) ||
    conv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusIcon = (message: Message) => {
    if (message.direction === 'inbound') return null;
    if (message.read_at) return <CheckCheck className="h-3 w-3 text-blue-500" />;
    if (message.delivered_at) return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    return <Check className="h-3 w-3 text-muted-foreground" />;
  };

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Shared Number Alert */}
      {isUsingSharedNumber && (
        <Alert className="m-4 mb-0 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <Users className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Shared WhatsApp Number:</strong> You're using a shared WhatsApp number. 
            Customer replies are routed based on who last messaged them. 
            Send a message to a customer to see their future replies in your inbox.
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-6 w-6 text-green-600" />
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">WhatsApp Inbox</h1>
            {isUsingSharedNumber && (
              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                <Users className="h-3 w-3 mr-1" />
                Shared
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground hidden sm:block">
            {totalUnread > 0 ? `${totalUnread} unread message${totalUnread > 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchConversations()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Conversations List */}
        <div className={cn(
          "w-80 border-r flex flex-col",
          selectedConversation ? "hidden md:flex" : "flex w-full md:w-80"
        )}>
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Conversations */}
          <ScrollArea className="flex-1">
            {loadingConversations ? (
              <div className="p-4 text-center text-muted-foreground">Loading...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={cn(
                    "p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedConversation?.id === conv.id && "bg-muted"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          {conv.customer_name || conv.customer_phone}
                        </span>
                        {conv.unread_count > 0 && (
                          <Badge variant="default" className="bg-green-600 shrink-0">
                            {conv.unread_count}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span className="truncate">{conv.customer_phone}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(conv.last_message_at), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col",
          !selectedConversation ? "hidden md:flex" : "flex"
        )}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-3 border-b flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-medium">
                    {selectedConversation.customer_name || selectedConversation.customer_phone}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedConversation.customer_phone}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {loadingMessages ? (
                  <div className="text-center text-muted-foreground">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground">No messages yet</div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex",
                          message.direction === 'outbound' ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[70%] rounded-lg px-3 py-2",
                            message.direction === 'outbound'
                              ? "bg-green-600 text-white"
                              : "bg-muted"
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.message_text}</p>
                          <div className={cn(
                            "flex items-center justify-end gap-1 mt-1",
                            message.direction === 'outbound' ? "text-green-100" : "text-muted-foreground"
                          )}>
                            <span className="text-xs">
                              {format(new Date(message.sent_at), 'h:mm a')}
                            </span>
                            {getStatusIcon(message)}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-3 border-t flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={sendMessageMutation.isPending}
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppInbox;
