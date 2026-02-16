import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  storage_path: string | null;
  file_size: number | null;
  tables_included: string[] | null;
  records_count: Record<string, number> | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

// Helper: gather all org data client-side (reused for local downloads)
const gatherOrgData = async (orgId: string) => {
  const backupData: Record<string, any[]> = {};
  const recordsCounts: Record<string, number> = {};

  const orgScopedTables = [
    'customers', 'suppliers', 'products', 'product_variants', 
    'sales', 'sale_returns', 'purchase_bills', 'purchase_returns',
    'quotations', 'sale_orders', 'credit_notes', 'voucher_entries',
    'account_ledgers', 'employees', 'settings', 'legacy_invoices',
    'whatsapp_templates', 'size_groups', 'barcode_label_settings'
  ];

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

  const lineItemFetches: { table: string; parentKey: string; foreignKey: string }[] = [
    { table: 'sale_items', parentKey: 'sales', foreignKey: 'sale_id' },
    { table: 'sale_return_items', parentKey: 'sale_returns', foreignKey: 'return_id' },
    { table: 'purchase_items', parentKey: 'purchase_bills', foreignKey: 'bill_id' },
    { table: 'purchase_return_items', parentKey: 'purchase_returns', foreignKey: 'return_id' },
    { table: 'quotation_items', parentKey: 'quotations', foreignKey: 'quotation_id' },
    { table: 'sale_order_items', parentKey: 'sale_orders', foreignKey: 'order_id' },
    { table: 'voucher_items', parentKey: 'voucher_entries', foreignKey: 'voucher_id' },
  ];

  for (const { table, parentKey, foreignKey } of lineItemFetches) {
    if (backupData[parentKey]?.length) {
      const parentIds = backupData[parentKey].map((r: any) => r.id);
      const { data } = await supabase.from(table as any).select('*').in(foreignKey, parentIds);
      backupData[table] = data || [];
      recordsCounts[table] = data?.length || 0;
    }
  }

  return { backupData, recordsCounts };
};

export const useBackup = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isCloudBackingUp, setIsCloudBackingUp] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const autoBackupTriggered = useRef(false);

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

  // Auto-backup is now handled by a scheduled cron job at 11:00 PM IST
  // No on-login trigger needed

  // Google Drive backup (existing)
  const startBackup = async () => {
    if (!currentOrganization?.id) { toast.error("No organization selected"); return; }
    setIsBackingUp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await supabase.functions.invoke('backup-to-drive', {
        body: { organizationId: currentOrganization.id, backupType: 'manual' },
      });
      if (response.error) throw new Error(response.error.message || 'Backup failed');
      const result = response.data;
      if (result.success) {
        toast.success("Backup completed!", {
          description: `File: ${result.file_name}`,
          action: result.drive_file_link ? { label: "View in Drive", onClick: () => window.open(result.drive_file_link, '_blank') } : undefined,
        });
        queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
      } else {
        throw new Error(result.error || 'Backup failed');
      }
    } catch (error: any) {
      toast.error("Backup failed", { description: error.message || "Check Google Drive credentials" });
    } finally {
      setIsBackingUp(false);
    }
  };

  // Cloud backup (new)
  const startCloudBackup = async () => {
    if (!currentOrganization?.id) { toast.error("No organization selected"); return; }
    setIsCloudBackingUp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await supabase.functions.invoke('auto-backup', {
        body: { organizationId: currentOrganization.id, backupType: 'manual' },
      });
      if (response.error) throw new Error(response.error.message || 'Cloud backup failed');
      const result = response.data;
      if (result.success) {
        toast.success("Cloud backup completed!", { description: `File: ${result.file_name}` });
        queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
      } else {
        throw new Error(result.error || 'Cloud backup failed');
      }
    } catch (error: any) {
      toast.error("Cloud backup failed", { description: error.message });
    } finally {
      setIsCloudBackingUp(false);
    }
  };

  // Download cloud backup from storage
  const downloadCloudBackup = async (storagePath: string, fileName: string | null) => {
    try {
      const { data, error } = await supabase.storage
        .from('organization-backups')
        .download(storagePath);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `backup-${storagePath.split('/').pop()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded!");
    } catch (error: any) {
      toast.error("Download failed", { description: error.message });
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const downloadBackup = async () => {
    if (!currentOrganization?.id) { toast.error("No organization selected"); return; }
    setIsDownloading(true);
    try {
      const { backupData, recordsCounts } = await gatherOrgData(currentOrganization.id);
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
      toast.success("Backup downloaded!", { description: `${totalRecords} records exported` });
    } catch (error: any) {
      toast.error("Download failed", { description: error.message });
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadBackupAsExcel = async () => {
    if (!currentOrganization?.id) { toast.error("No organization selected"); return; }
    setIsDownloading(true);
    try {
      const { backupData } = await gatherOrgData(currentOrganization.id);
      const addStatusColumn = (records: any[]) =>
        records.map(record => ({ ...record, status: record.deleted_at ? 'DELETED' : 'Active' }));

      const wb = XLSX.utils.book_new();

      // Merged Sales Analysis
      if (backupData.sales?.length && backupData.sale_items?.length) {
        const salesMap = new Map(backupData.sales.map((s: any) => [s.id, s]));
        const mergedSales = backupData.sale_items.map((item: any) => {
          const sale = salesMap.get(item.sale_id) || {} as any;
          return {
            invoice_number: sale.sale_number || '', sale_type: sale.sale_type || '', sale_date: sale.sale_date || '',
            customer_name: sale.customer_name || '', customer_phone: sale.customer_phone || '',
            product_name: item.product_name || '', barcode: item.barcode || '', size: item.size || '',
            color: item.color || '', hsn_code: item.hsn_code || '', quantity: item.quantity || 0,
            mrp: item.mrp || 0, unit_price: item.unit_price || 0, discount_percent: item.discount_percent || 0,
            gst_percent: item.gst_percent || 0, line_total: item.line_total || 0,
            payment_method: sale.payment_method || '', payment_status: sale.payment_status || '',
            net_amount: sale.net_amount || 0, paid_amount: sale.paid_amount || 0,
            status: sale.deleted_at ? 'DELETED' : 'Active'
          };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mergedSales), 'Sales Analysis');
      }

      // Merged Purchases Analysis
      if (backupData.purchase_bills?.length && backupData.purchase_items?.length) {
        const purchaseMap = new Map(backupData.purchase_bills.map((p: any) => [p.id, p]));
        const mergedPurchases = backupData.purchase_items.map((item: any) => {
          const bill = purchaseMap.get(item.bill_id) || {} as any;
          return {
            bill_number: bill.software_bill_no || '', supplier_invoice: bill.supplier_invoice_no || '',
            bill_date: bill.bill_date || '', supplier_name: bill.supplier_name || '',
            product_name: item.product_name || '', barcode: item.barcode || '', brand: item.brand || '',
            category: item.category || '', style: item.style || '', color: item.color || '',
            size: item.size || '', hsn_code: item.hsn_code || '', quantity: item.qty || 0,
            purchase_price: item.pur_price || 0, sale_price: item.sale_price || 0,
            gst_percent: item.gst_per || 0, line_total: item.line_total || 0,
            net_amount: bill.net_amount || 0, payment_status: bill.payment_status || '',
            status: bill.deleted_at ? 'DELETED' : 'Active'
          };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mergedPurchases), 'Purchases Analysis');
      }

      const tablesWithStatus = [
        'customers', 'suppliers', 'products', 'product_variants', 'sales', 'sale_returns',
        'purchase_bills', 'purchase_returns', 'quotations', 'sale_orders', 'credit_notes',
        'voucher_entries', 'employees'
      ];

      for (const [table, data] of Object.entries(backupData)) {
        if (data.length > 0) {
          const processedData = tablesWithStatus.includes(table) ? addStatusColumn(data) : data;
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(processedData), table.replace(/_/g, ' ').slice(0, 31));
        }
      }

      const metadata = [{
        organization_name: currentOrganization.name,
        backup_date: new Date().toISOString(),
        backup_type: 'excel_download',
        total_records: Object.values(backupData).reduce((sum, arr) => sum + arr.length, 0),
        sheets_included: Object.keys(backupData).filter(k => backupData[k]?.length > 0).join(', ')
      }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metadata), 'Metadata');

      XLSX.writeFile(wb, `backup-${currentOrganization.name}-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`);
      const totalRecords = Object.values(backupData).reduce((sum, arr) => sum + arr.length, 0);
      toast.success("Excel backup downloaded!", { description: `${totalRecords} records` });
    } catch (error: any) {
      toast.error("Excel download failed", { description: error.message });
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    backupLogs, isLoadingLogs, isBackingUp, isDownloading,
    isCloudBackingUp,
    startBackup, startCloudBackup,
    downloadBackup, downloadBackupAsExcel,
    downloadCloudBackup,
    formatFileSize,
  };
};
