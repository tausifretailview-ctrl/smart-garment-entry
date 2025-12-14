import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";

export interface BackupLog {
  id: string;
  organization_id: string;
  backup_type: 'manual' | 'automatic';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  file_name: string | null;
  drive_file_id: string | null;
  drive_file_link: string | null;
  file_size: number | null;
  tables_included: string[] | null;
  records_count: Record<string, number> | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export const useBackup = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [isBackingUp, setIsBackingUp] = useState(false);

  const { data: backupLogs, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['backup-logs', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('backup_logs')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as BackupLog[];
    },
    enabled: !!currentOrganization?.id,
  });

  const startBackup = async () => {
    if (!currentOrganization?.id) {
      toast.error("No organization selected");
      return;
    }

    setIsBackingUp(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke('backup-to-drive', {
        body: {
          organizationId: currentOrganization.id,
          backupType: 'manual',
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Backup failed');
      }

      const result = response.data;
      
      if (result.success) {
        toast.success("Backup completed successfully!", {
          description: `File: ${result.file_name}`,
          action: result.drive_file_link ? {
            label: "View in Drive",
            onClick: () => window.open(result.drive_file_link, '_blank'),
          } : undefined,
        });
        queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
      } else {
        throw new Error(result.error || 'Backup failed');
      }
    } catch (error: any) {
      console.error('Backup error:', error);
      toast.error("Backup failed", {
        description: error.message || "Please check your Google Drive credentials",
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const downloadBackup = async () => {
    if (!currentOrganization?.id) {
      toast.error("No organization selected");
      return;
    }

    setIsDownloading(true);
    
    try {
      const orgId = currentOrganization.id;
      const backupData: Record<string, any[]> = {};
      const recordsCounts: Record<string, number> = {};

      // Organization-scoped tables
      const orgScopedTables = [
        'customers', 'suppliers', 'products', 'product_variants', 
        'sales', 'sale_returns', 'purchase_bills', 'purchase_returns',
        'quotations', 'sale_orders', 'credit_notes', 'voucher_entries',
        'account_ledgers', 'employees', 'settings', 'legacy_invoices',
        'whatsapp_templates', 'size_groups', 'barcode_label_settings'
      ];

      // Fetch organization-scoped tables
      for (const table of orgScopedTables) {
        try {
          const { data, error } = await supabase
            .from(table as any)
            .select('*')
            .eq('organization_id', orgId);
          
          if (!error) {
            backupData[table] = data || [];
            recordsCounts[table] = data?.length || 0;
          }
        } catch (e) {
          console.warn(`Failed to fetch ${table}:`, e);
        }
      }

      // Fetch line items via parent relationships
      // Sale items
      if (backupData.sales?.length) {
        const saleIds = backupData.sales.map((s: any) => s.id);
        const { data } = await supabase
          .from('sale_items')
          .select('*')
          .in('sale_id', saleIds);
        backupData.sale_items = data || [];
        recordsCounts.sale_items = data?.length || 0;
      }

      // Sale return items
      if (backupData.sale_returns?.length) {
        const returnIds = backupData.sale_returns.map((r: any) => r.id);
        const { data } = await supabase
          .from('sale_return_items')
          .select('*')
          .in('return_id', returnIds);
        backupData.sale_return_items = data || [];
        recordsCounts.sale_return_items = data?.length || 0;
      }

      // Purchase items
      if (backupData.purchase_bills?.length) {
        const billIds = backupData.purchase_bills.map((b: any) => b.id);
        const { data } = await supabase
          .from('purchase_items')
          .select('*')
          .in('bill_id', billIds);
        backupData.purchase_items = data || [];
        recordsCounts.purchase_items = data?.length || 0;
      }

      // Purchase return items
      if (backupData.purchase_returns?.length) {
        const returnIds = backupData.purchase_returns.map((r: any) => r.id);
        const { data } = await supabase
          .from('purchase_return_items')
          .select('*')
          .in('return_id', returnIds);
        backupData.purchase_return_items = data || [];
        recordsCounts.purchase_return_items = data?.length || 0;
      }

      // Quotation items
      if (backupData.quotations?.length) {
        const quotationIds = backupData.quotations.map((q: any) => q.id);
        const { data } = await supabase
          .from('quotation_items')
          .select('*')
          .in('quotation_id', quotationIds);
        backupData.quotation_items = data || [];
        recordsCounts.quotation_items = data?.length || 0;
      }

      // Sale order items
      if (backupData.sale_orders?.length) {
        const orderIds = backupData.sale_orders.map((o: any) => o.id);
        const { data } = await supabase
          .from('sale_order_items')
          .select('*')
          .in('order_id', orderIds);
        backupData.sale_order_items = data || [];
        recordsCounts.sale_order_items = data?.length || 0;
      }

      // Voucher items
      if (backupData.voucher_entries?.length) {
        const voucherIds = backupData.voucher_entries.map((v: any) => v.id);
        const { data } = await supabase
          .from('voucher_items')
          .select('*')
          .in('voucher_id', voucherIds);
        backupData.voucher_items = data || [];
        recordsCounts.voucher_items = data?.length || 0;
      }

      // Create backup content
      const backupContent = JSON.stringify({
        metadata: {
          organization_id: currentOrganization.id,
          organization_name: currentOrganization.name,
          backup_date: new Date().toISOString(),
          backup_type: 'local_download',
          tables_included: Object.keys(backupData),
          records_count: recordsCounts,
          total_records: Object.values(recordsCounts).reduce((sum, count) => sum + count, 0),
        },
        data: backupData,
      }, null, 2);

      // Trigger download
      const blob = new Blob([backupContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${currentOrganization.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalRecords = Object.values(recordsCounts).reduce((sum, count) => sum + count, 0);
      toast.success("Backup downloaded successfully!", {
        description: `${totalRecords} records exported`,
      });
    } catch (error: any) {
      console.error('Download backup error:', error);
      toast.error("Download failed", {
        description: error.message || "Please try again",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadBackupAsExcel = async () => {
    if (!currentOrganization?.id) {
      toast.error("No organization selected");
      return;
    }

    setIsDownloading(true);
    try {
      const { default: XLSX } = await import('xlsx');
      const orgId = currentOrganization.id;
      const backupData: Record<string, any[]> = {};

      // Organization-scoped tables
      const orgScopedTables = [
        'customers', 'suppliers', 'products', 'product_variants', 
        'sales', 'sale_returns', 'purchase_bills', 'purchase_returns',
        'quotations', 'sale_orders', 'credit_notes', 'voucher_entries',
        'account_ledgers', 'employees', 'settings', 'legacy_invoices',
        'whatsapp_templates', 'size_groups', 'barcode_label_settings'
      ];

      // Fetch organization-scoped tables
      for (const table of orgScopedTables) {
        try {
          const { data, error } = await supabase
            .from(table as any)
            .select('*')
            .eq('organization_id', orgId);
          
          if (!error) {
            backupData[table] = data || [];
          }
        } catch (e) {
          console.warn(`Failed to fetch ${table}:`, e);
        }
      }

      // Fetch line items via parent relationships
      if (backupData.sales?.length) {
        const saleIds = backupData.sales.map((s: any) => s.id);
        const { data } = await supabase.from('sale_items').select('*').in('sale_id', saleIds);
        backupData.sale_items = data || [];
      }

      if (backupData.sale_returns?.length) {
        const returnIds = backupData.sale_returns.map((r: any) => r.id);
        const { data } = await supabase.from('sale_return_items').select('*').in('return_id', returnIds);
        backupData.sale_return_items = data || [];
      }

      if (backupData.purchase_bills?.length) {
        const billIds = backupData.purchase_bills.map((b: any) => b.id);
        const { data } = await supabase.from('purchase_items').select('*').in('bill_id', billIds);
        backupData.purchase_items = data || [];
      }

      if (backupData.purchase_returns?.length) {
        const returnIds = backupData.purchase_returns.map((r: any) => r.id);
        const { data } = await supabase.from('purchase_return_items').select('*').in('return_id', returnIds);
        backupData.purchase_return_items = data || [];
      }

      if (backupData.quotations?.length) {
        const quotationIds = backupData.quotations.map((q: any) => q.id);
        const { data } = await supabase.from('quotation_items').select('*').in('quotation_id', quotationIds);
        backupData.quotation_items = data || [];
      }

      if (backupData.sale_orders?.length) {
        const orderIds = backupData.sale_orders.map((o: any) => o.id);
        const { data } = await supabase.from('sale_order_items').select('*').in('order_id', orderIds);
        backupData.sale_order_items = data || [];
      }

      if (backupData.voucher_entries?.length) {
        const voucherIds = backupData.voucher_entries.map((v: any) => v.id);
        const { data } = await supabase.from('voucher_items').select('*').in('voucher_id', voucherIds);
        backupData.voucher_items = data || [];
      }

      // Create Excel workbook
      const wb = XLSX.utils.book_new();

      for (const [table, data] of Object.entries(backupData)) {
        if (data.length > 0) {
          const ws = XLSX.utils.json_to_sheet(data);
          const sheetName = table.replace(/_/g, ' ').slice(0, 31);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
      }

      // Add metadata sheet
      const metadata = [{
        organization_name: currentOrganization.name,
        backup_date: new Date().toISOString(),
        backup_type: 'excel_download',
      }];
      const metaWs = XLSX.utils.json_to_sheet(metadata);
      XLSX.utils.book_append_sheet(wb, metaWs, 'Metadata');

      const fileName = `backup-${currentOrganization.name}-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`;
      XLSX.writeFile(wb, fileName);

      const totalRecords = Object.values(backupData).reduce((sum, arr) => sum + arr.length, 0);
      toast.success("Excel backup downloaded!", {
        description: `${totalRecords} records across ${Object.keys(backupData).filter(k => backupData[k]?.length > 0).length} sheets`,
      });
    } catch (error: any) {
      console.error('Excel backup error:', error);
      toast.error("Excel download failed", {
        description: error.message || "Please try again",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    backupLogs,
    isLoadingLogs,
    isBackingUp,
    isDownloading,
    startBackup,
    downloadBackup,
    downloadBackupAsExcel,
    formatFileSize,
  };
};
