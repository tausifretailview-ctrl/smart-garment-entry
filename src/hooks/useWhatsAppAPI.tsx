import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export interface WhatsAppSettings {
  id: string;
  organization_id: string;
  provider: string;
  phone_number_id: string | null;
  waba_id: string | null;
  access_token: string | null;
  business_name: string | null;
  is_active: boolean;
  auto_send_invoice: boolean;
  auto_send_quotation: boolean;
  auto_send_sale_order: boolean;
  auto_send_payment_reminder: boolean;
  webhook_verify_token: string | null;
  invoice_template_name: string | null;
  quotation_template_name: string | null;
  sale_order_template_name: string | null;
  payment_reminder_template_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppLog {
  id: string;
  organization_id: string;
  phone_number: string;
  message: string | null;
  template_name: string | null;
  template_type: string;
  status: string;
  wamid: string | null;
  reference_id: string | null;
  reference_type: string | null;
  provider_response: Record<string, unknown> | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface SendMessageParams {
  phone: string;
  message: string;
  templateType: string;
  templateName?: string;
  referenceId?: string;
  referenceType?: string;
}

export const useWhatsAppAPI = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  // Fetch WhatsApp API settings
  const { data: settings, isLoading: settingsLoading, refetch: refetchSettings } = useQuery({
    queryKey: ['whatsapp-api-settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      const { data, error } = await supabase
        .from('whatsapp_api_settings')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as WhatsAppSettings | null;
    },
    enabled: !!currentOrganization?.id,
  });

  // Update or create WhatsApp settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<WhatsAppSettings>) => {
      if (!currentOrganization?.id) throw new Error('No organization selected');

      const settingsData = {
        ...newSettings,
        organization_id: currentOrganization.id,
        updated_at: new Date().toISOString(),
      };

      if (settings?.id) {
        // Update existing
        const { data, error } = await supabase
          .from('whatsapp_api_settings')
          .update(settingsData)
          .eq('id', settings.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('whatsapp_api_settings')
          .insert(settingsData)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-api-settings'] });
      toast.success('WhatsApp API settings saved successfully');
    },
    onError: (error) => {
      console.error('Error saving WhatsApp settings:', error);
      toast.error('Failed to save WhatsApp API settings');
    },
  });

  // Send WhatsApp message via edge function
  const sendMessageMutation = useMutation({
    mutationFn: async (params: SendMessageParams) => {
      if (!currentOrganization?.id) throw new Error('No organization selected');

      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          organizationId: currentOrganization.id,
          phone: params.phone,
          message: params.message,
          templateType: params.templateType,
          templateName: params.templateName,
          referenceId: params.referenceId,
          referenceType: params.referenceType,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to send message');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-logs'] });
    },
  });

  // Test connection
  const testConnectionMutation = useMutation({
    mutationFn: async (testPhone: string) => {
      if (!currentOrganization?.id) throw new Error('No organization selected');
      if (!settings?.phone_number_id || !settings?.access_token) {
        throw new Error('Please configure API credentials first');
      }

      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          organizationId: currentOrganization.id,
          phone: testPhone,
          message: `🔔 Test message from ${settings.business_name || 'WhatsApp API Integration'}\n\nYour WhatsApp Business API is configured correctly!`,
          templateType: 'test',
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Connection test failed');
      
      return data;
    },
    onSuccess: () => {
      toast.success('Test message sent successfully! Check your WhatsApp.');
    },
    onError: (error) => {
      console.error('Connection test failed:', error);
      toast.error(`Connection test failed: ${error.message}`);
    },
  });

  // Fetch message logs
  const fetchMessageLogs = async (filters?: {
    status?: string;
    templateType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    if (!currentOrganization?.id) return [];

    let query = supabase
      .from('whatsapp_logs')
      .select('*')
      .eq('organization_id', currentOrganization.id)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.templateType && filters.templateType !== 'all') {
      query = query.eq('template_type', filters.templateType);
    }
    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as WhatsAppLog[];
  };

  // Retry failed message
  const retryMessageMutation = useMutation({
    mutationFn: async (logId: string) => {
      if (!currentOrganization?.id) throw new Error('No organization selected');

      // Fetch the original log entry
      const { data: logEntry, error: fetchError } = await supabase
        .from('whatsapp_logs')
        .select('*')
        .eq('id', logId)
        .single();

      if (fetchError || !logEntry) throw new Error('Message log not found');
      if (logEntry.status !== 'failed') throw new Error('Only failed messages can be retried');

      // Build template params (Meta templates require exact param count)
      let templateParams: string[] | undefined;
      let templateNameToUse: string | null = logEntry.template_name;

      // For sales invoices we can deterministically rebuild the params from the sale record
      if (logEntry.template_type === 'sales_invoice' && logEntry.reference_id) {
        const { data: sale } = await (supabase as any)
          .from('sales')
          .select('sale_number, sale_date, net_amount, payment_status, customer_name')
          .eq('id', logEntry.reference_id)
          .maybeSingle();

        if (sale && templateNameToUse) {
          const orgSettings = (currentOrganization.settings as Record<string, unknown>) || {};
          const companyName = (orgSettings.company_name as string) || currentOrganization.name || 'Our Company';
          const contactNumber =
            (orgSettings.contact_number as string) ||
            (orgSettings.phone as string) ||
            '';

          const formattedDate = new Date(sale.sale_date || Date.now()).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });

          const amount = `${Number(sale.net_amount || 0).toLocaleString('en-IN')}`;
          const paymentStatus = sale.payment_status === 'completed' ? 'Paid' : 'Pending';

          // {{customer_name}}, {{invoice_number}}, {{invoice_date}}, {{amount}}, {{payment_status}}, {{company_name}}, {{contact_number}}
          templateParams = [
            sale.customer_name || '',
            sale.sale_number || '',
            formattedDate,
            amount,
            paymentStatus,
            companyName,
            contactNumber,
          ];
        }
      }

      // If we couldn't build params, do NOT use template (otherwise Meta returns #132000)
      if (templateNameToUse && (!templateParams || templateParams.length === 0)) {
        templateNameToUse = null;
      }

      // send-whatsapp currently validates that `message` is present; ensure we always send a non-empty fallback
      const messageToSend = (logEntry.message && logEntry.message.trim()) ? logEntry.message : 'WhatsApp notification';

      // Resend the message
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          organizationId: currentOrganization.id,
          phone: logEntry.phone_number,
          message: messageToSend,
          templateType: logEntry.template_type,
          templateName: templateNameToUse,
          templateParams,
          referenceId: logEntry.reference_id,
          referenceType: logEntry.reference_type,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Retry failed');

      // Mark original log as retried
      await supabase
        .from('whatsapp_logs')
        .update({ status: 'retried' })
        .eq('id', logId);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-logs'] });
      toast.success('Message retry initiated');
    },
    onError: (error) => {
      toast.error(`Retry failed: ${error.message}`);
    },
  });

  // Get message stats
  const getMessageStats = async () => {
    if (!currentOrganization?.id) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISOString = today.toISOString();

    const { data: todayLogs, error } = await supabase
      .from('whatsapp_logs')
      .select('status')
      .eq('organization_id', currentOrganization.id)
      .gte('created_at', todayISOString);

    if (error) {
      console.error('Error fetching stats:', error);
      return null;
    }

    const stats = {
      todaySent: todayLogs?.filter(l => l.status === 'sent').length || 0,
      todayDelivered: todayLogs?.filter(l => l.status === 'delivered').length || 0,
      todayFailed: todayLogs?.filter(l => l.status === 'failed').length || 0,
      todayPending: todayLogs?.filter(l => l.status === 'pending').length || 0,
      todayTotal: todayLogs?.length || 0,
    };

    return stats;
  };

  return {
    settings,
    settingsLoading,
    refetchSettings,
    updateSettings: updateSettingsMutation.mutate,
    updateSettingsAsync: updateSettingsMutation.mutateAsync,
    isUpdating: updateSettingsMutation.isPending,
    sendMessage: sendMessageMutation.mutate,
    sendMessageAsync: sendMessageMutation.mutateAsync,
    isSending: sendMessageMutation.isPending,
    testConnection: testConnectionMutation.mutate,
    testConnectionAsync: testConnectionMutation.mutateAsync,
    isTesting: testConnectionMutation.isPending,
    fetchMessageLogs,
    retryMessage: retryMessageMutation.mutate,
    isRetrying: retryMessageMutation.isPending,
    getMessageStats,
  };
};
