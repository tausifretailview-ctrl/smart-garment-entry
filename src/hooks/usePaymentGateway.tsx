import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export type GatewayType = 'upi_link' | 'razorpay' | 'phonepe';

export interface PaymentGatewaySettings {
  id?: string;
  organization_id?: string;
  active_gateway: GatewayType;
  upi_id?: string;
  upi_business_name?: string;
  razorpay_key_id?: string;
  razorpay_enabled: boolean;
  phonepe_merchant_id?: string;
  phonepe_enabled: boolean;
}

export interface PaymentLink {
  id: string;
  organization_id: string;
  sale_id?: string;
  legacy_invoice_id?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  invoice_number?: string;
  amount: number;
  gateway: GatewayType;
  gateway_link_id?: string;
  payment_url?: string;
  status: 'created' | 'sent' | 'paid' | 'expired' | 'cancelled';
  paid_at?: string;
  gateway_payment_id?: string;
  created_at?: string;
}

interface CreatePaymentLinkParams {
  amount: number;
  customerName: string;
  customerPhone?: string;
  invoiceNumber?: string;
  saleId?: string;
  legacyInvoiceId?: string;
  customerId?: string;
}

export function usePaymentGateway() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  // Fetch gateway settings
  const { data: gatewaySettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['payment-gateway-settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      const { data, error } = await supabase
        .from('payment_gateway_settings')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as PaymentGatewaySettings | null;
    },
    enabled: !!currentOrganization?.id,
  });

  // Save gateway settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<PaymentGatewaySettings>) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      const { data: existing } = await supabase
        .from('payment_gateway_settings')
        .select('id')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('payment_gateway_settings')
          .update({
            ...settings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payment_gateway_settings')
          .insert({
            organization_id: currentOrganization.id,
            ...settings,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-gateway-settings'] });
      toast.success("Payment gateway settings saved");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save settings");
    },
  });

  // Get active gateway info
  const activeGateway = gatewaySettings?.active_gateway || 'upi_link';
  
  const isGatewayConfigured = (): boolean => {
    if (!gatewaySettings) return false;
    
    switch (gatewaySettings.active_gateway) {
      case 'upi_link':
        return !!gatewaySettings.upi_id;
      case 'razorpay':
        return !!gatewaySettings.razorpay_key_id && gatewaySettings.razorpay_enabled;
      case 'phonepe':
        return !!gatewaySettings.phonepe_merchant_id && gatewaySettings.phonepe_enabled;
      default:
        return false;
    }
  };

  // Generate UPI link locally (for upi_link gateway)
  const generateLocalUPILink = (params: CreatePaymentLinkParams): string | null => {
    if (!gatewaySettings?.upi_id) return null;
    
    const amount = isNaN(params.amount) || params.amount === null ? 0 : params.amount;
    const businessName = gatewaySettings.upi_business_name || "Merchant";
    const txnNote = params.invoiceNumber 
      ? `Payment for ${params.invoiceNumber}` 
      : `Payment from ${params.customerName}`;

    const upiParams = new URLSearchParams({
      pa: gatewaySettings.upi_id,
      pn: businessName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50),
      am: amount.toFixed(2),
      cu: "INR",
      tn: txnNote.substring(0, 50),
    });

    return `upi://pay?${upiParams.toString()}`;
  };

  // Generate web payment link (for upi_link gateway)
  const generateWebPaymentLink = (params: CreatePaymentLinkParams): string | null => {
    if (!gatewaySettings?.upi_id) return null;
    
    const amount = isNaN(params.amount) || params.amount === null ? 0 : params.amount;
    const businessName = gatewaySettings.upi_business_name || "Merchant";
    const txnNote = params.invoiceNumber 
      ? `Payment for ${params.invoiceNumber}` 
      : `Payment from ${params.customerName}`;

    const webParams = new URLSearchParams({
      pa: gatewaySettings.upi_id,
      pn: businessName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50),
      am: amount.toFixed(2),
      tn: txnNote.substring(0, 50),
    });

    const baseUrl = window.location.origin;
    return `${baseUrl}/pay?${webParams.toString()}`;
  };

  // Create payment link mutation (for all gateways)
  const createPaymentLinkMutation = useMutation({
    mutationFn: async (params: CreatePaymentLinkParams): Promise<PaymentLink> => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      if (!gatewaySettings) throw new Error("Gateway not configured");

      const gateway = gatewaySettings.active_gateway;
      let paymentUrl: string | null = null;
      let gatewayLinkId: string | null = null;

      if (gateway === 'upi_link') {
        // Generate local web payment link
        paymentUrl = generateWebPaymentLink(params);
      } else if (gateway === 'razorpay') {
        // Call edge function to create Razorpay payment link
        const { data, error } = await supabase.functions.invoke('create-payment-link', {
          body: {
            gateway: 'razorpay',
            amount: params.amount,
            customerName: params.customerName,
            customerPhone: params.customerPhone,
            invoiceNumber: params.invoiceNumber,
            organizationId: currentOrganization.id,
          },
        });

        if (error) throw error;
        paymentUrl = data.paymentUrl;
        gatewayLinkId = data.gatewayLinkId;
      } else if (gateway === 'phonepe') {
        // Call edge function to create PhonePe payment link
        const { data, error } = await supabase.functions.invoke('create-payment-link', {
          body: {
            gateway: 'phonepe',
            amount: params.amount,
            customerName: params.customerName,
            customerPhone: params.customerPhone,
            invoiceNumber: params.invoiceNumber,
            organizationId: currentOrganization.id,
          },
        });

        if (error) throw error;
        paymentUrl = data.paymentUrl;
        gatewayLinkId = data.gatewayLinkId;
      }

      // Store payment link in database
      const { data: paymentLink, error: insertError } = await supabase
        .from('payment_links')
        .insert({
          organization_id: currentOrganization.id,
          sale_id: params.saleId || null,
          legacy_invoice_id: params.legacyInvoiceId || null,
          customer_id: params.customerId || null,
          customer_name: params.customerName,
          customer_phone: params.customerPhone || null,
          invoice_number: params.invoiceNumber || null,
          amount: params.amount,
          gateway,
          gateway_link_id: gatewayLinkId,
          payment_url: paymentUrl,
          status: 'created',
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return paymentLink as PaymentLink;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create payment link");
    },
  });

  // Mark payment as paid (manual confirmation for UPI link)
  const markAsPaidMutation = useMutation({
    mutationFn: async (paymentLinkId: string) => {
      const { error } = await supabase
        .from('payment_links')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', paymentLinkId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
      toast.success("Payment marked as paid");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update payment status");
    },
  });

  return {
    gatewaySettings,
    isLoadingSettings,
    activeGateway,
    isGatewayConfigured: isGatewayConfigured(),
    saveSettings: saveSettingsMutation.mutate,
    isSaving: saveSettingsMutation.isPending,
    generateLocalUPILink,
    generateWebPaymentLink,
    createPaymentLink: createPaymentLinkMutation.mutateAsync,
    isCreatingLink: createPaymentLinkMutation.isPending,
    markAsPaid: markAsPaidMutation.mutate,
    isMarkingPaid: markAsPaidMutation.isPending,
  };
}
