import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Home, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";

export default function SalesInvoice() {
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(new Date());

  return (
    <div className="min-h-screen bg-background p-4">
      <BackToDashboard />
      
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Home className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground">- Invoice</span>
          <h1 className="text-2xl font-semibold">New Invoice</h1>
        </div>

        {/* Main Form */}
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {/* Select Customer */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Select Customer<span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Search Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer1">Customer 1</SelectItem>
                    <SelectItem value="customer2">Customer 2</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 mt-2">
                <div>Billing Address is Not Provided</div>
                <div>Shipping Address is Not Provided</div>
              </div>
            </div>

            {/* Invoice Date */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Invoice Date<span className="text-destructive">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(invoiceDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={invoiceDate} onSelect={(date) => date && setInvoiceDate(date)} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Invoice No */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Invoice No.<span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input value="INV/24-25/" className="flex-1" readOnly />
                <Input defaultValue="9185" className="w-20" />
              </div>
            </div>

            {/* Payment Term */}
            <div className="space-y-2">
              <Label className="text-foreground">Payment Term</Label>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Payment Term" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="net30">Net 30</SelectItem>
                    <SelectItem value="net60">Net 60</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Due Date<span className="text-destructive">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dueDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dueDate} onSelect={(date) => date && setDueDate(date)} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Tax Type */}
            <div className="space-y-2">
              <Label className="text-foreground">Tax Type</Label>
              <Select defaultValue="default">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="gst">GST</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Create Invoice From */}
            <div className="space-y-2">
              <Label className="text-foreground">Create Invoice From</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quotation">Quotation</SelectItem>
                  <SelectItem value="order">Sales Order</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sales Man */}
            <div className="space-y-2">
              <Label className="text-foreground">Sales Man</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select Employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emp1">Employee 1</SelectItem>
                  <SelectItem value="emp2">Employee 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-6 mb-6">
            <div className="flex items-center space-x-2">
              <Checkbox id="reminder" />
              <Label htmlFor="reminder" className="text-sm cursor-pointer">Payment Reminder</Label>
            </div>
          </div>

          {/* Tabs Section */}
          <Tabs defaultValue="products" className="w-full">
            <TabsList>
              <TabsTrigger value="products">Product Details</TabsTrigger>
              <TabsTrigger value="terms">Terms & Condition/Note</TabsTrigger>
              <TabsTrigger value="shipping">Shipping Details</TabsTrigger>
            </TabsList>
            
            <TabsContent value="products" className="mt-4">
              <div className="flex justify-end mb-4">
                <Button className="bg-blue-500 hover:bg-blue-600 text-white">
                  ⬆ Upload Products
                </Button>
              </div>
              
              <Card className="p-4 min-h-[300px]">
                <div className="text-center text-muted-foreground py-20">
                  No products added yet
                </div>
              </Card>
            </TabsContent>
            
            <TabsContent value="terms" className="mt-4">
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <Label>Terms & Conditions</Label>
                    <textarea className="w-full min-h-[100px] p-2 border rounded-md mt-2" placeholder="Enter terms and conditions..." />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <textarea className="w-full min-h-[100px] p-2 border rounded-md mt-2" placeholder="Enter additional notes..." />
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            <TabsContent value="shipping" className="mt-4">
              <Card className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Shipping Address</Label>
                    <textarea className="w-full min-h-[100px] p-2 border rounded-md mt-2" placeholder="Enter shipping address..." />
                  </div>
                  <div>
                    <Label>Delivery Instructions</Label>
                    <textarea className="w-full min-h-[100px] p-2 border rounded-md mt-2" placeholder="Enter delivery instructions..." />
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline">Cancel</Button>
            <Button variant="outline">Save as Draft</Button>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white">Save Invoice</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
