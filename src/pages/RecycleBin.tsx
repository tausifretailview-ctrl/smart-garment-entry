import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { SoftDeleteEntity } from "@/hooks/useSoftDelete";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Search, Archive, Users, Truck, Package, ShoppingCart, FileText, Receipt, Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";

interface DeletedRecord {
  id: string;
  deleted_at: string;
  deleted_by: string;
  [key: string]: any;
}

const entityConfig: Record<SoftDeleteEntity, { label: string; icon: any; displayField: string; secondaryField?: string }> = {
  customers: { label: "Customers", icon: Users, displayField: "customer_name", secondaryField: "phone" },
  suppliers: { label: "Suppliers", icon: Truck, displayField: "supplier_name", secondaryField: "phone" },
  employees: { label: "Employees", icon: Users, displayField: "employee_name", secondaryField: "designation" },
  products: { label: "Products", icon: Package, displayField: "product_name", secondaryField: "category" },
  purchase_bills: { label: "Purchase Bills", icon: FileText, displayField: "software_bill_no", secondaryField: "supplier_name" },
  sales: { label: "Sales/POS", icon: ShoppingCart, displayField: "sale_number", secondaryField: "customer_name" },
  sale_returns: { label: "Sale Returns", icon: RotateCcw, displayField: "return_number", secondaryField: "customer_name" },
  purchase_returns: { label: "Purchase Returns", icon: RotateCcw, displayField: "return_number", secondaryField: "supplier_name" },
  sale_orders: { label: "Sale Orders", icon: FileText, displayField: "order_number", secondaryField: "customer_name" },
  quotations: { label: "Quotations", icon: FileText, displayField: "quotation_number", secondaryField: "customer_name" },
  voucher_entries: { label: "Vouchers", icon: Receipt, displayField: "voucher_number", secondaryField: "voucher_type" },
  credit_notes: { label: "Credit Notes", icon: Receipt, displayField: "credit_note_number", secondaryField: "customer_name" },
};

export default function RecycleBin() {
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState<SoftDeleteEntity>("customers");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch deleted records for the active tab
  const { data: deletedRecords = [], isLoading } = useQuery({
    queryKey: ["deleted-records", activeTab, currentOrganization?.id],
    queryFn: async (): Promise<DeletedRecord[]> => {
      if (!currentOrganization?.id) return [];

      let result: { data: any; error: any } = { data: null, error: null };
      
      switch (activeTab) {
        case 'customers':
          result = await supabase.from('customers').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'suppliers':
          result = await supabase.from('suppliers').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'employees':
          result = await supabase.from('employees').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'products':
          result = await supabase.from('products').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'purchase_bills':
          result = await supabase.from('purchase_bills').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'sales':
          result = await supabase.from('sales').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'sale_returns':
          result = await supabase.from('sale_returns').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'purchase_returns':
          result = await supabase.from('purchase_returns').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'sale_orders':
          result = await supabase.from('sale_orders').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'quotations':
          result = await supabase.from('quotations').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'voucher_entries':
          result = await supabase.from('voucher_entries').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        case 'credit_notes':
          result = await supabase.from('credit_notes').select('*').eq('organization_id', currentOrganization.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
          break;
        default:
          return [];
      }
      
      if (result.error) throw result.error;
      return (result.data || []) as unknown as DeletedRecord[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Count deleted records per entity
  const { data: counts = {} } = useQuery<Record<string, number>>({
    queryKey: ["deleted-counts", currentOrganization?.id],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!currentOrganization?.id) return {};

      const countPromises = Object.keys(entityConfig).map(async (entity) => {
        const { count, error } = await supabase
          .from(entity as any)
          .select("*", { count: "exact", head: true })
          .eq("organization_id", currentOrganization.id)
          .not("deleted_at", "is", null);

        return { entity, count: error ? 0 : (count || 0) };
      });

      const results = await Promise.all(countPromises);
      return results.reduce((acc, { entity, count }) => ({ ...acc, [entity]: count }), {});
    },
    enabled: !!currentOrganization?.id,
  });

  const totalDeletedCount = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const filteredRecords = deletedRecords.filter((record) => {
    const config = entityConfig[activeTab];
    const primaryValue = record[config.displayField]?.toString().toLowerCase() || "";
    const secondaryValue = record[config.secondaryField || ""]?.toString().toLowerCase() || "";
    const search = searchQuery.toLowerCase();
    return primaryValue.includes(search) || secondaryValue.includes(search);
  });

  const config = entityConfig[activeTab];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Archive className="h-8 w-8 text-primary" />
            Recycle Bin
          </h1>
          <p className="text-muted-foreground mt-1">
            View deleted records for audit purposes. Records shown here are permanently deleted.
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {totalDeletedCount} deleted items
        </Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SoftDeleteEntity)}>
            <TabsList className="flex flex-wrap h-auto gap-1 mb-6">
              {Object.entries(entityConfig).map(([key, { label, icon: Icon }]) => (
                <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                  {(counts[key] || 0) > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                      {counts[key]}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.keys(entityConfig).map((entity) => (
              <TabsContent key={entity} value={entity}>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={`Search deleted ${entityConfig[entity as SoftDeleteEntity].label.toLowerCase()}...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="text-center py-12">
                      <Trash2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Deleted Records</h3>
                      <p className="text-muted-foreground">
                        No deleted {entityConfig[entity as SoftDeleteEntity].label.toLowerCase()} found
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{config.displayField.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</TableHead>
                          {config.secondaryField && (
                            <TableHead>{config.secondaryField.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</TableHead>
                          )}
                          <TableHead>Deleted At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">
                              {record[config.displayField] || "-"}
                            </TableCell>
                            {config.secondaryField && (
                              <TableCell>{record[config.secondaryField] || "-"}</TableCell>
                            )}
                            <TableCell>
                              {record.deleted_at
                                ? format(new Date(record.deleted_at), "dd/MM/yyyy HH:mm")
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
