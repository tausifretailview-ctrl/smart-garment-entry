import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Barcode } from "lucide-react";
import { toast } from "sonner";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Layout } from "@/components/Layout";
import { format } from "date-fns";

interface MovementRecord {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  bill_number: string;
  notes: string;
  variant_id: string;
  product_name: string;
  size: string;
  barcode: string;
  running_balance: number;
  category: string;
  brand: string;
}

const ProductTrackingReport = () => {
  const { currentOrganization } = useOrganization();
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [filteredMovements, setFilteredMovements] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchBarcode, setSearchBarcode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  useEffect(() => {
    if (currentOrganization) {
      fetchMovements();
    }
  }, [currentOrganization]);

  useEffect(() => {
    applyFilters();
  }, [movements, searchBarcode, startDate, endDate, movementTypeFilter, categoryFilter, brandFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchBarcode, startDate, endDate, movementTypeFilter, categoryFilter, brandFilter, itemsPerPage]);

  const fetchMovements = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("stock_movements")
        .select(`
          id,
          created_at,
          movement_type,
          quantity,
          bill_number,
          notes,
          variant_id,
          product_variants!inner (
            barcode,
            size,
            product_id,
            products!inner (
              product_name,
              organization_id,
              category,
              brand
            )
          )
        `)
        .eq("product_variants.products.organization_id", currentOrganization.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Calculate running balance for each product variant
      const movementsByVariant: { [key: string]: MovementRecord[] } = {};
      
      data?.forEach((movement: any) => {
        const variantId = movement.variant_id;
        if (!movementsByVariant[variantId]) {
          movementsByVariant[variantId] = [];
        }

        let runningBalance = 0;
        if (movementsByVariant[variantId].length > 0) {
          runningBalance = movementsByVariant[variantId][movementsByVariant[variantId].length - 1].running_balance;
        }

        if (movement.movement_type === 'purchase') {
          runningBalance += movement.quantity;
        } else if (movement.movement_type === 'sale') {
          runningBalance += movement.quantity; // quantity is already negative from database
        }

        movementsByVariant[variantId].push({
          id: movement.id,
          created_at: movement.created_at,
          movement_type: movement.movement_type,
          quantity: movement.quantity,
          bill_number: movement.bill_number,
          notes: movement.notes,
          variant_id: movement.variant_id,
          product_name: movement.product_variants.products.product_name,
          size: movement.product_variants.size,
          barcode: movement.product_variants.barcode || "",
          running_balance: runningBalance,
          category: movement.product_variants.products.category || "",
          brand: movement.product_variants.products.brand || "",
        });
      });

      // Flatten all movements
      const allMovements: MovementRecord[] = [];
      Object.values(movementsByVariant).forEach(variantMovements => {
        allMovements.push(...variantMovements);
      });

      // Sort by date descending (latest first)
      allMovements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setMovements(allMovements);
    } catch (error: any) {
      console.error("Error fetching movements:", error);
      toast.error("Failed to load product tracking data");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...movements];

    if (searchBarcode) {
      filtered = filtered.filter(
        (m) =>
          m.barcode?.toLowerCase().includes(searchBarcode.toLowerCase()) ||
          m.product_name.toLowerCase().includes(searchBarcode.toLowerCase()) ||
          m.size.toLowerCase().includes(searchBarcode.toLowerCase())
      );
    }

    if (movementTypeFilter !== "all") {
      filtered = filtered.filter((m) => m.movement_type === movementTypeFilter);
    }

    if (categoryFilter !== "all") {
      filtered = filtered.filter((m) => m.category === categoryFilter);
    }

    if (brandFilter !== "all") {
      filtered = filtered.filter((m) => m.brand === brandFilter);
    }

    if (startDate) {
      filtered = filtered.filter(
        (m) => new Date(m.created_at) >= new Date(startDate)
      );
    }

    if (endDate) {
      filtered = filtered.filter(
        (m) => new Date(m.created_at) <= new Date(endDate + "T23:59:59")
      );
    }

    setFilteredMovements(filtered);
  };

  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMovements = filteredMovements.slice(startIndex, endIndex);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
  };

  // Get unique categories and brands for filters
  const uniqueCategories = Array.from(new Set(movements.map(m => m.category).filter(Boolean)));
  const uniqueBrands = Array.from(new Set(movements.map(m => m.brand).filter(Boolean)));

  if (loading) {
    return (
      <Layout>
        <div className="p-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent flex items-center gap-2">
              <Barcode className="h-8 w-8 text-primary" />
              Product Tracking Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Track product movements with credit, debit, and balance details
            </p>
          </div>
          <BackToDashboard />
        </div>

        {/* Filters */}
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search by Barcode/Product</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter barcode or product name..."
                  value={searchBarcode}
                  onChange={(e) => setSearchBarcode(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Movement Type</label>
              <Select value={movementTypeFilter} onValueChange={setMovementTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="sale">Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Brand</label>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {uniqueBrands.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <p className="text-sm text-muted-foreground">
              Showing {filteredMovements.length} records
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchBarcode("");
                setStartDate("");
                setEndDate("");
                setMovementTypeFilter("all");
                setCategoryFilter("all");
                setBrandFilter("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
        </Card>

        {/* Movements Table */}
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Bill Number</TableHead>
                  <TableHead className="text-right">Credit (In)</TableHead>
                  <TableHead className="text-right">Debit (Out)</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No movement records found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(movement.created_at), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {movement.barcode || "N/A"}
                      </TableCell>
                      <TableCell className="font-medium">{movement.product_name}</TableCell>
                      <TableCell>{movement.size}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            movement.movement_type === "purchase"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {movement.movement_type === "purchase" ? "Purchase" : "Sale"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono">{movement.bill_number}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {movement.movement_type === "purchase" ? movement.quantity : "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        {movement.movement_type === "sale" ? Math.abs(movement.quantity) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {movement.running_balance}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {movement.notes}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filteredMovements.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredMovements.length)} of{" "}
                  {filteredMovements.length} records
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm px-4">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
};

export default ProductTrackingReport;
