import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

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

  return {
    backupLogs,
    isLoadingLogs,
    isBackingUp,
    startBackup,
    formatFileSize,
  };
};
