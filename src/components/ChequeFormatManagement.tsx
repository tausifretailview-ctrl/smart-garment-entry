import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useChequeFormats, ChequeFormat, ChequeFormatInput, bankPresets } from "@/hooks/useChequeFormats";
import { ChequePrintPreview } from "@/components/ChequePrintPreview";
import { Plus, Pencil, Trash2, Star, Printer, Eye } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";

const defaultFormValues: ChequeFormatInput = {
  bank_name: "",
  account_number: "",
  date_top_mm: 7,
  date_left_mm: 160,
  date_spacing_mm: 5,
  date_format: "DD/MM/YYYY",
  name_top_mm: 20,
  name_left_mm: 25,
  name_width_mm: 130,
  words_top_mm: 28,
  words_left_mm: 35,
  words_line2_offset_mm: 6,
  amount_top_mm: 34,
  amount_left_mm: 165,
  font_size_pt: 12,
  cheque_width_mm: 203,
  cheque_height_mm: 89,
  show_ac_payee: true,
  is_default: false,
};

export function ChequeFormatManagement() {
  const { formats, createFormat, updateFormat, deleteFormat, setDefault, isLoading } = useChequeFormats();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFormat, setEditingFormat] = useState<ChequeFormat | null>(null);
  const [formValues, setFormValues] = useState<ChequeFormatInput>(defaultFormValues);
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [showTestPrint, setShowTestPrint] = useState(false);
  const testPrintRef = useRef<HTMLDivElement>(null);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (bankPresets[preset]) {
      setFormValues({ ...bankPresets[preset] });
    }
  };

  const handleOpenDialog = (format?: ChequeFormat) => {
    if (format) {
      setEditingFormat(format);
      setFormValues({
        bank_name: format.bank_name,
        account_number: format.account_number,
        date_top_mm: format.date_top_mm,
        date_left_mm: format.date_left_mm,
        date_spacing_mm: format.date_spacing_mm,
        date_format: format.date_format,
        name_top_mm: format.name_top_mm,
        name_left_mm: format.name_left_mm,
        name_width_mm: format.name_width_mm,
        words_top_mm: format.words_top_mm,
        words_left_mm: format.words_left_mm,
        words_line2_offset_mm: format.words_line2_offset_mm,
        amount_top_mm: format.amount_top_mm,
        amount_left_mm: format.amount_left_mm,
        font_size_pt: format.font_size_pt,
        cheque_width_mm: format.cheque_width_mm,
        cheque_height_mm: format.cheque_height_mm,
        show_ac_payee: format.show_ac_payee,
        is_default: format.is_default,
      });
      setSelectedPreset("");
    } else {
      setEditingFormat(null);
      setFormValues(defaultFormValues);
      setSelectedPreset("");
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formValues.bank_name) {
      toast.error("Please enter a bank name");
      return;
    }

    if (editingFormat) {
      await updateFormat.mutateAsync({ id: editingFormat.id, ...formValues });
    } else {
      await createFormat.mutateAsync(formValues);
    }
    setDialogOpen(false);
  };

  const handleTestPrint = useReactToPrint({
    contentRef: testPrintRef,
    documentTitle: "Cheque_Test_Print",
  });

  const updateField = (field: keyof ChequeFormatInput, value: any) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  // Create a temporary format for preview
  const previewFormat: ChequeFormat = {
    id: "preview",
    organization_id: "",
    ...formValues,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Cheque Printing Formats</CardTitle>
            <CardDescription>Configure bank-specific cheque layouts for printing</CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Bank Format
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {formats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No cheque formats configured yet.</p>
            <p className="text-sm mt-1">Add a bank format to start printing cheques.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Name</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Font Size</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formats.map((format) => (
                <TableRow key={format.id}>
                  <TableCell className="font-medium">{format.bank_name}</TableCell>
                  <TableCell>{format.account_number || "-"}</TableCell>
                  <TableCell>{format.font_size_pt}pt</TableCell>
                  <TableCell>
                    {format.is_default ? (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefault.mutate(format.id)}
                      >
                        Set Default
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog(format)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteFormat.mutate(format.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Format Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingFormat ? "Edit" : "Add"} Cheque Format</DialogTitle>
              <DialogDescription>
                Configure the layout positions for bank cheque printing
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-6">
              {/* Left: Form Fields */}
              <div className="space-y-4">
                {/* Bank Preset */}
                {!editingFormat && (
                  <div className="space-y-2">
                    <Label>Bank Preset</Label>
                    <Select value={selectedPreset} onValueChange={handlePresetChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a preset or enter custom" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(bankPresets).map((bank) => (
                          <SelectItem key={bank} value={bank}>
                            {bank}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Bank Name & Account */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Bank Name *</Label>
                    <Input
                      value={formValues.bank_name}
                      onChange={(e) => updateField("bank_name", e.target.value)}
                      placeholder="e.g., HDFC Bank"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input
                      value={formValues.account_number || ""}
                      onChange={(e) => updateField("account_number", e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                {/* Date Position */}
                <div className="p-3 border rounded-lg space-y-3">
                  <Label className="font-semibold">Date Position (mm)</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Top</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.date_top_mm}
                        onChange={(e) => updateField("date_top_mm", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Left</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.date_left_mm}
                        onChange={(e) => updateField("date_left_mm", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Spacing</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.date_spacing_mm}
                        onChange={(e) => updateField("date_spacing_mm", parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                {/* Name Position */}
                <div className="p-3 border rounded-lg space-y-3">
                  <Label className="font-semibold">Payee Name Position (mm)</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Top</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.name_top_mm}
                        onChange={(e) => updateField("name_top_mm", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Left</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.name_left_mm}
                        onChange={(e) => updateField("name_left_mm", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Width</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.name_width_mm}
                        onChange={(e) => updateField("name_width_mm", parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                {/* Amount in Words Position */}
                <div className="p-3 border rounded-lg space-y-3">
                  <Label className="font-semibold">Amount in Words Position (mm)</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Top</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.words_top_mm}
                        onChange={(e) => updateField("words_top_mm", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Left</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.words_left_mm}
                        onChange={(e) => updateField("words_left_mm", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Line 2 Offset</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.words_line2_offset_mm}
                        onChange={(e) => updateField("words_line2_offset_mm", parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                {/* Amount Figures Position */}
                <div className="p-3 border rounded-lg space-y-3">
                  <Label className="font-semibold">Amount Figures Position (mm)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Top</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.amount_top_mm}
                        onChange={(e) => updateField("amount_top_mm", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Left</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={formValues.amount_left_mm}
                        onChange={(e) => updateField("amount_left_mm", parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                {/* Other Settings */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Font Size (pt)</Label>
                    <Input
                      type="number"
                      value={formValues.font_size_pt}
                      onChange={(e) => updateField("font_size_pt", parseInt(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Checkbox
                      id="show_ac_payee"
                      checked={formValues.show_ac_payee}
                      onCheckedChange={(checked) => updateField("show_ac_payee", checked)}
                    />
                    <Label htmlFor="show_ac_payee">A/C Payee Only</Label>
                  </div>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="space-y-4">
                <Label className="font-semibold">Live Preview</Label>
                <div className="border rounded-lg p-4 bg-muted/30 overflow-auto">
                  <div className="transform scale-75 origin-top-left">
                    <ChequePrintPreview
                      payeeName="SAMPLE SUPPLIER NAME"
                      amount={125000.50}
                      chequeDate={new Date()}
                      chequeFormat={previewFormat}
                      showPreview={true}
                    />
                  </div>
                </div>

                {/* Test Print */}
                <div className="hidden">
                  <ChequePrintPreview
                    ref={testPrintRef}
                    payeeName="TEST PRINT - SAMPLE NAME"
                    amount={99999.99}
                    chequeDate={new Date()}
                    chequeFormat={previewFormat}
                    showPreview={false}
                  />
                </div>

                <Button variant="outline" onClick={() => handleTestPrint()} className="w-full">
                  <Printer className="h-4 w-4 mr-2" />
                  Test Print
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={createFormat.isPending || updateFormat.isPending}>
                {editingFormat ? "Update" : "Save"} Format
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
