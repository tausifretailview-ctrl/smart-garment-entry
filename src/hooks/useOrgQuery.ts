import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useOrganization } from '@/contexts/OrganizationContext';

/**
 * Organization-scoped useQuery wrapper.
 * Automatically appends orgId to queryKey, gates on org being loaded,
 * and provides a default 30s staleTime.
 *
 * Usage:
 *   const { data } = useOrgQuery({
 *     queryKey: ['customers'],
 *     queryFn: async (orgId) => {
 *       const { data } = await supabase.from('customers')
 *         .select('id, customer_name').eq('organization_id', orgId);
 *       return data || [];
 *     },
 *   });
 */

interface OrgQueryOptions<T> {
  queryKey: string[];
  queryFn: (orgId: string) => Promise<T>;
  enabled?: boolean;
  options?: Omit<UseQueryOptions<T, Error, T, string[]>, 'queryKey' | 'queryFn' | 'enabled'>;
}

export function useOrgQuery<T>({ queryKey, queryFn, enabled = true, options }: OrgQueryOptions<T>) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery<T, Error, T, string[]>({
    queryKey: [...queryKey, orgId!],
    queryFn: () => queryFn(orgId!),
    enabled: !!orgId && enabled,
    staleTime: 30_000,
    ...options,
  });
}
