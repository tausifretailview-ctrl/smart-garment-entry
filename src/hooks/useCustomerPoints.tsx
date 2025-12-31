import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";

export interface PointsSettings {
  enable_points_system: boolean;
  points_ratio_amount: number;
  points_per_ratio: number;
  points_rounding: 'floor' | 'round' | 'ceil';
  min_purchase_for_points: number;
  points_expiry_days: number;
}

export interface PointsHistory {
  id: string;
  customer_id: string;
  sale_id: string | null;
  transaction_type: 'earned' | 'redeemed' | 'adjusted' | 'expired';
  points: number;
  invoice_amount: number | null;
  description: string | null;
  created_at: string;
}

const defaultPointsSettings: PointsSettings = {
  enable_points_system: false,
  points_ratio_amount: 100,
  points_per_ratio: 1,
  points_rounding: 'floor',
  min_purchase_for_points: 0,
  points_expiry_days: 0,
};

export function useCustomerPoints() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();

  // Fetch points settings
  const { data: pointsSettings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['points-settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return defaultPointsSettings;
      
      const { data, error } = await supabase
        .from('settings')
        .select('sale_settings')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      
      if (error) throw error;
      
      const saleSettings = data?.sale_settings as any;
      return {
        enable_points_system: saleSettings?.enable_points_system ?? false,
        points_ratio_amount: saleSettings?.points_ratio_amount ?? 100,
        points_per_ratio: saleSettings?.points_per_ratio ?? 1,
        points_rounding: saleSettings?.points_rounding ?? 'floor',
        min_purchase_for_points: saleSettings?.min_purchase_for_points ?? 0,
        points_expiry_days: saleSettings?.points_expiry_days ?? 0,
      } as PointsSettings;
    },
    enabled: !!currentOrganization?.id,
  });

  // Calculate points for a given amount
  const calculatePoints = (netAmount: number): number => {
    const settings = pointsSettings || defaultPointsSettings;
    
    if (!settings.enable_points_system) return 0;
    if (netAmount < settings.min_purchase_for_points) return 0;
    
    const rawPoints = (netAmount / settings.points_ratio_amount) * settings.points_per_ratio;
    
    switch (settings.points_rounding) {
      case 'floor':
        return Math.floor(rawPoints);
      case 'ceil':
        return Math.ceil(rawPoints);
      case 'round':
      default:
        return Math.round(rawPoints);
    }
  };

  // Award points to a customer after a sale
  const awardPoints = async (
    customerId: string,
    saleId: string,
    netAmount: number,
    saleNumber: string
  ): Promise<{ success: boolean; pointsAwarded: number; error?: string }> => {
    const settings = pointsSettings || defaultPointsSettings;
    
    if (!settings.enable_points_system || !customerId || !currentOrganization?.id) {
      return { success: true, pointsAwarded: 0 };
    }
    
    const pointsToAward = calculatePoints(netAmount);
    
    if (pointsToAward <= 0) {
      return { success: true, pointsAwarded: 0 };
    }

    try {
      // Insert points history record
      const { error: historyError } = await supabase
        .from('customer_points_history' as any)
        .insert({
          organization_id: currentOrganization.id,
          customer_id: customerId,
          sale_id: saleId,
          transaction_type: 'earned',
          points: pointsToAward,
          invoice_amount: netAmount,
          description: `Points earned from invoice ${saleNumber}`,
          created_by: user?.id,
        });

      if (historyError) throw historyError;

      // Fetch current values and update
      const { data: customer } = await supabase
        .from('customers')
        .select('total_points_earned, points_balance')
        .eq('id', customerId)
        .single();

      if (customer) {
        await supabase
          .from('customers')
          .update({
            total_points_earned: (customer.total_points_earned || 0) + pointsToAward,
            points_balance: (customer.points_balance || 0) + pointsToAward,
          })
          .eq('id', customerId);
      }

      return { success: true, pointsAwarded: pointsToAward };
    } catch (error: any) {
      console.error('Error awarding points:', error);
      return { success: false, pointsAwarded: 0, error: error.message };
    }
  };

  // Get customer's points balance
  const getCustomerPoints = async (customerId: string): Promise<{ balance: number; total: number }> => {
    if (!customerId) return { balance: 0, total: 0 };
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('points_balance, total_points_earned')
        .eq('id', customerId)
        .single();

      if (error) throw error;
      
      return {
        balance: data?.points_balance || 0,
        total: data?.total_points_earned || 0,
      };
    } catch {
      return { balance: 0, total: 0 };
    }
  };

  // Get customer's points history
  const getPointsHistory = async (customerId: string): Promise<PointsHistory[]> => {
    if (!customerId || !currentOrganization?.id) return [];
    
    try {
      const { data, error } = await supabase
        .from('customer_points_history' as any)
        .select('*')
        .eq('customer_id', customerId)
        .eq('organization_id', currentOrganization.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as PointsHistory[];
    } catch {
      return [];
    }
  };

  return {
    pointsSettings: pointsSettings || defaultPointsSettings,
    isSettingsLoading,
    calculatePoints,
    awardPoints,
    getCustomerPoints,
    getPointsHistory,
    isPointsEnabled: pointsSettings?.enable_points_system ?? false,
  };
}

// Hook to get a single customer's points
export function useCustomerPointsBalance(customerId: string | null) {
  const { currentOrganization } = useOrganization();

  return useQuery({
    queryKey: ['customer-points', customerId],
    queryFn: async () => {
      if (!customerId) return { balance: 0, total: 0 };
      
      const { data, error } = await supabase
        .from('customers')
        .select('points_balance, total_points_earned')
        .eq('id', customerId)
        .single();

      if (error) throw error;
      
      return {
        balance: data?.points_balance || 0,
        total: data?.total_points_earned || 0,
      };
    },
    enabled: !!customerId && !!currentOrganization?.id,
  });
}
