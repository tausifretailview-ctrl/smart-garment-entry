import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Scan, X, Plus } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";

export default function POSSales() {
  const [customerName, setCustomerName] = useState("Walk in Customer");
  const [barcode, setBarcode] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [totals, setTotals] = useState({
    quantity: 0,
    mrp: 0,
    additionalCharges: 0,
    discount: 0,
    flatDiscount: 0,
    roundOff: 0,
    amount: 0
  });

  return (
    <div className="min-h-screen bg-background p-4">
      <BackToDashboard />
      
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Header Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Input
              placeholder="Scan Barcode/Enter Product Name"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="pr-10"
            />
            <Scan className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
          
          <div className="relative">
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="pr-10"
            />
            {customerName !== "Walk in Customer" && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setCustomerName("Walk in Customer")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-9 top-1/2 -translate-y-1/2 h-7 w-7"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <Input placeholder="Scan Sales Invoice" />
        </div>

        {/* Items Table */}
        <Card className="overflow-hidden">
          <div className="bg-black text-white">
            <div className="grid grid-cols-12 gap-4 p-3 text-sm font-medium">
              <div className="col-span-1">Itemcode</div>
              <div className="col-span-2">Product</div>
              <div className="col-span-1">Quantity</div>
              <div className="col-span-1">MRP</div>
              <div className="col-span-1">Tax%</div>
              <div className="col-span-1">Tax Value</div>
              <div className="col-span-1">Discount</div>
              <div className="col-span-1">Add Disc</div>
              <div className="col-span-1">Unit Cost</div>
              <div className="col-span-2">Net Amount</div>
            </div>
          </div>
          
          <div className="min-h-[400px] p-4">
            {items.length === 0 && (
              <div className="text-center text-muted-foreground py-20">
                Scan or enter product to add items
              </div>
            )}
          </div>
        </Card>

        {/* Totals Section */}
        <div className="bg-cyan-500 text-white p-4 rounded-lg">
          <div className="grid grid-cols-7 gap-4 items-center">
            <div className="text-center">
              <div className="text-2xl font-bold">{totals.quantity.toFixed(3)}</div>
              <div className="text-sm">Quantity</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{totals.mrp.toFixed(2)}</div>
              <div className="text-sm">MRP</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{totals.additionalCharges.toFixed(2)}</div>
              <div className="text-sm">Add. Charges +</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{totals.discount.toFixed(2)}</div>
              <div className="text-sm">Discount</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="bg-black text-white px-2 py-1 text-sm">%</span>
                <Input className="w-20 h-8 bg-white text-black" value={totals.flatDiscount.toFixed(2)} />
              </div>
              <div className="text-sm mt-1">Flat Discount</div>
            </div>
            <div className="text-center">
              <Input className="w-24 h-8 bg-white text-black text-center" value={totals.roundOff.toFixed(2)} />
              <div className="text-sm mt-1">Round OFF</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{totals.amount}</div>
              <div className="text-sm">Amount</div>
            </div>
          </div>
        </div>

        {/* Payment Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ⊞ Multiple Pay(F12)
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ⊞ Redeem Credit
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ⊟ Hold (F6)
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ▶ UPI (F5)
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ⊞ Card (F3)
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ₹ Cash (F4)
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            📅 Pay Later (F11)
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ⊟ Hold & Print(F7)
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ▶ UPI & Print (F10)
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base">
            ⊞ Card & Print (F9)
          </Button>
          <Button className="bg-black hover:bg-black/90 text-white h-14 text-base col-span-2 md:col-span-1">
            ₹ Cash & Print (F8)
          </Button>
        </div>
      </div>
    </div>
  );
}
