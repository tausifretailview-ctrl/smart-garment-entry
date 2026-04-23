import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgQuery } from "@/hooks/useOrgQuery";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/hooks/useSettings";
import { useMemo } from "react";

export interface PointsSettings {
  enable_points_system: boolean;
  points_ratio_amount: number;
  points_per_ratio: number;
  points_rounding: 'floor' | 'round' | 'ceil';
  min_purchase_for_points: number;
  points_expiry_days: number;
  // Redemption settings
  enable_points_redemption: boolean;
  points_redemption_value: number; // 1 point = X rupees
  max_redemption_percent: number; // max % of invoice that can be paid via points
  min_points_for_redemption: number;
  min_purchase_for_redemption: number;
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
  // Redemption defaults
  enable_points_redemption: false,
  points_redemption_value: 1, // 1 point = ₹1
  max_redemption_percent: 50, // max 50% of invoice via points
  min_points_for_redemption: 10,
  min_purchase_for_redemption: 0,
};

export function useCustomerPoints() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();

  // Derive points settings from centralized cached settings (no extra round-trip)
  const { data: settingsRow, isLoading: isSettingsLoading } = useSettings();
  const pointsSettings = useMemo<PointsSettings | undefined>(() => {
    if (!settingsRow) return undefined;
    const saleSettings = (settingsRow as any)?.sale_settings as Record<string, unknown> | null;
    return {
      enable_points_system: (saleSettings?.enable_points_system as boolean) ?? false,
      points_ratio_amount: (saleSettings?.points_ratio_amount as number) ?? 100,
      points_per_ratio: (saleSettings?.points_per_ratio as number) ?? 1,
      points_rounding: (saleSettings?.points_rounding as PointsSettings['points_rounding']) ?? 'floor',
      min_purchase_for_points: (saleSettings?.min_purchase_for_points as number) ?? 0,
      points_expiry_days: (saleSettings?.points_expiry_days as number) ?? 0,
      enable_points_redemption: (saleSettings?.enable_points_redemption as boolean) ?? false,
      points_redemption_value: (saleSettings?.points_redemption_value as number) ?? 1,
      max_redemption_percent: (saleSettings?.max_redemption_percent as number) ?? 50,
      min_points_for_redemption: (saleSettings?.min_points_for_redemption as number) ?? 10,
      min_purchase_for_redemption: (saleSettings?.min_purchase_for_redemption as number) ?? 0,
    } as PointsSettings;
  }, [settingsRow]);

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
        .from('customer_points_history')
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
        .from('customer_points_history')
        .select('*')
        .eq('customer_id', customerId)
        .eq('organization_id', currentOrganization.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as PointsHistory[];
    } catch {
      return [];
    }
  };

  // Calculate redemption value (points to rupees)
  const calculateRedemptionValue = (points: number): number => {
    const settings = pointsSettings || defaultPointsSettings;
    return points * settings.points_redemption_value;
  };

  // Calculate max redeemable points for a given invoice amount and balance
  const calculateMaxRedeemablePoints = (invoiceAmount: number, pointsBalance: number): number => {
    const settings = pointsSettings || defaultPointsSettings;
    
    if (!settings.enable_points_redemption) return 0;
    if (pointsBalance < settings.min_points_for_redemption) return 0;
    if (invoiceAmount < settings.min_purchase_for_redemption) return 0;
    
    // Max amount that can be redeemed based on percentage limit
    const maxRedeemableAmount = (invoiceAmount * settings.max_redemption_percent) / 100;
    
    // Convert to points
    const maxPointsFromPercentage = Math.floor(maxRedeemableAmount / settings.points_redemption_value);
    
    // Return the lesser of: max from percentage OR available balance
    return Math.min(maxPointsFromPercentage, pointsBalance);
  };

  // Redeem points during a sale
  const redeemPoints = async (
    customerId: string,
    saleId: string,
    pointsToRedeem: number,
    saleNumber: string
  ): Promise<{ success: boolean; amountRedeemed: number; error?: string }> => {
    const settings = pointsSettings || defaultPointsSettings;
    
    if (!settings.enable_points_redemption || !customerId || !currentOrganization?.id || pointsToRedeem <= 0) {
      return { success: true, amountRedeemed: 0 };
    }

    try {
      const amountRedeemed = calculateRedemptionValue(pointsToRedeem);
      
      // Insert points history record for redemption
      const { error: historyError } = await supabase
        .from('customer_points_history')
        .insert({
          organization_id: currentOrganization.id,
          customer_id: customerId,
          sale_id: saleId,
          transaction_type: 'redeemed',
          points: -pointsToRedeem, // Negative for redemption
          invoice_amount: amountRedeemed,
          description: `Points redeemed for invoice ${saleNumber} (₹${amountRedeemed} discount)`,
          created_by: user?.id,
        });

      if (historyError) throw historyError;

      // Update customer's points balance
      const { data: customer } = await supabase
        .from('customers')
        .select('points_balance, points_redeemed')
        .eq('id', customerId)
        .single();

      if (customer) {
        await supabase
          .from('customers')
          .update({
            points_balance: Math.max(0, (customer.points_balance || 0) - pointsToRedeem),
            points_redeemed: (customer.points_redeemed || 0) + pointsToRedeem,
          })
          .eq('id', customerId);
      }

      return { success: true, amountRedeemed };
    } catch (error: any) {
      console.error('Error redeeming points:', error);
      return { success: false, amountRedeemed: 0, error: error.message };
    }
  };

  // Fetch available gift rewards
  const getGiftRewards = async (): Promise<any[]> => {
    if (!currentOrganization?.id) return [];
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('gift_rewards')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('is_active', true)
        .lte('valid_from', today)
        .or(`valid_until.is.null,valid_until.gte.${today}`)
        .gt('stock_qty', 0)
        .order('points_required', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch {
      return [];
    }
  };

  // Redeem a gift reward
  const redeemGiftReward = async (
    customerId: string,
    giftRewardId: string,
    pointsRequired: number
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentOrganization?.id || !customerId) {
      return { success: false, error: 'Invalid parameters' };
    }

    try {
      // Insert gift redemption record
      const { error: redemptionError } = await supabase
        .from('gift_redemptions')
        .insert({
          organization_id: currentOrganization.id,
          customer_id: customerId,
          gift_reward_id: giftRewardId,
          points_used: pointsRequired,
          redeemed_by: user?.id,
        });

      if (redemptionError) throw redemptionError;

      // Decrement gift stock - fetch current and update
      const { data: gift } = await supabase
        .from('gift_rewards')
        .select('stock_qty')
        .eq('id', giftRewardId)
        .single();
      
      if (gift) {
        await supabase
          .from('gift_rewards')
          .update({ stock_qty: Math.max(0, (gift.stock_qty || 0) - 1) })
          .eq('id', giftRewardId);
      }

      // Update customer points
      const { data: customer } = await supabase
        .from('customers')
        .select('points_balance, points_redeemed')
        .eq('id', customerId)
        .single();

      if (customer) {
        await supabase
          .from('customers')
          .update({
            points_balance: Math.max(0, (customer.points_balance || 0) - pointsRequired),
            points_redeemed: (customer.points_redeemed || 0) + pointsRequired,
          })
          .eq('id', customerId);

        // Insert points history for gift redemption
        await supabase
          .from('customer_points_history')
          .insert({
            organization_id: currentOrganization.id,
            customer_id: customerId,
            transaction_type: 'redeemed',
            points: -pointsRequired,
            description: 'Gift reward redeemed',
            created_by: user?.id,
          });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error redeeming gift:', error);
      return { success: false, error: error.message };
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
    // Redemption exports
    isRedemptionEnabled: pointsSettings?.enable_points_redemption ?? false,
    calculateRedemptionValue,
    calculateMaxRedeemablePoints,
    redeemPoints,
    getGiftRewards,
    redeemGiftReward,
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
