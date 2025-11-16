-- Create bill_number_sequence table for monthly reset
CREATE TABLE bill_number_sequence (
  id SERIAL PRIMARY KEY,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- Enable RLS on bill_number_sequence
ALTER TABLE bill_number_sequence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bill sequence"
  ON bill_number_sequence FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Functions can manage bill sequence"
  ON bill_number_sequence FOR ALL
  USING (true)
  WITH CHECK (true);

-- Drop ALL existing triggers first
DROP TRIGGER IF EXISTS trigger_update_stock_on_purchase ON purchase_items;
DROP TRIGGER IF EXISTS on_purchase_item_insert ON purchase_items;
DROP TRIGGER IF EXISTS trigger_update_stock_on_sale ON sale_items;
DROP TRIGGER IF EXISTS on_sale_item_insert ON sale_items;

-- Now drop the functions
DROP FUNCTION IF EXISTS update_stock_on_purchase();
DROP FUNCTION IF EXISTS update_stock_on_sale();
DROP FUNCTION IF EXISTS generate_purchase_bill_number();

CREATE OR REPLACE FUNCTION generate_purchase_bill_number(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_month INTEGER;
  v_year INTEGER;
  v_sequence INTEGER;
  v_bill_no TEXT;
BEGIN
  -- Extract month and year (YY format)
  v_month := EXTRACT(MONTH FROM p_date);
  v_year := EXTRACT(YEAR FROM p_date) % 100;
  
  -- Get or create sequence for this month/year
  INSERT INTO bill_number_sequence (month, year, next_sequence)
  VALUES (v_month, v_year, 1)
  ON CONFLICT (month, year) 
  DO UPDATE SET 
    next_sequence = bill_number_sequence.next_sequence + 1,
    updated_at = NOW()
  RETURNING next_sequence INTO v_sequence;
  
  -- Format: BMMYYNNN (e.g., B0125001)
  v_bill_no := 'B' || 
               LPAD(v_month::TEXT, 2, '0') || 
               LPAD(v_year::TEXT, 2, '0') || 
               LPAD(v_sequence::TEXT, 3, '0');
  
  RETURN v_bill_no;
END;
$$;

-- Create batch_stock table
CREATE TABLE batch_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  purchase_bill_id UUID REFERENCES purchase_bills(id) ON DELETE CASCADE,
  purchase_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variant_id, bill_number)
);

CREATE INDEX idx_batch_stock_variant ON batch_stock(variant_id);
CREATE INDEX idx_batch_stock_bill_number ON batch_stock(bill_number);
CREATE INDEX idx_batch_stock_purchase_date ON batch_stock(purchase_date);

-- Enable RLS on batch_stock
ALTER TABLE batch_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view batch stock in their organizations"
  ON batch_stock FOR SELECT
  USING (
    variant_id IN (
      SELECT pv.id FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE p.organization_id IN (
        SELECT get_user_organization_ids(auth.uid())
      )
    )
  );

CREATE POLICY "System can manage batch stock"
  ON batch_stock FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add bill_number to purchase_items
ALTER TABLE purchase_items 
ADD COLUMN bill_number TEXT;

CREATE INDEX idx_purchase_items_bill_number ON purchase_items(bill_number);

-- Add bill_number to stock_movements
ALTER TABLE stock_movements 
ADD COLUMN bill_number TEXT;

CREATE INDEX idx_stock_movements_bill_number ON stock_movements(bill_number);

-- Create new function with batch tracking using bill_number
CREATE OR REPLACE FUNCTION update_stock_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
BEGIN
  -- Get purchase bill date and software_bill_no
  SELECT bill_date, software_bill_no 
  INTO v_purchase_date, v_bill_number
  FROM purchase_bills
  WHERE id = NEW.bill_id;
  
  -- Update total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.qty,
      updated_at = NOW()
  WHERE id = NEW.sku_id;
  
  -- Create or update batch_stock record
  INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date)
  VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET 
    quantity = batch_stock.quantity + EXCLUDED.quantity,
    updated_at = NOW();
  
  -- Insert stock movement record
  INSERT INTO stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes
  ) VALUES (
    NEW.sku_id,
    'purchase',
    NEW.qty,
    NEW.bill_id,
    v_bill_number,
    'Stock added from purchase bill ' || v_bill_number
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_purchase_item_insert
  AFTER INSERT ON purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_on_purchase();

-- Create update_stock_on_sale function with FIFO logic
CREATE OR REPLACE FUNCTION update_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_bills_used TEXT := '';
BEGIN
  -- FIFO: Get batches ordered by purchase date (oldest first)
  FOR v_batch IN 
    SELECT bill_number, quantity, id
    FROM batch_stock
    WHERE variant_id = NEW.variant_id 
      AND quantity > 0
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    -- Calculate how much to deduct from this batch
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    
    -- Update batch stock
    UPDATE batch_stock
    SET quantity = quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    -- Track which bills were used
    v_bills_used := v_bills_used || v_batch.bill_number || '(' || v_deduct_qty || '), ';
    
    -- Record stock movement for this batch
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes
    ) VALUES (
      NEW.variant_id,
      'sale',
      -v_deduct_qty,
      NEW.sale_id,
      v_batch.bill_number,
      'FIFO deduction: ' || v_deduct_qty || ' units from bill ' || v_batch.bill_number
    );
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  -- Update total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty - NEW.quantity,
      updated_at = NOW()
  WHERE id = NEW.variant_id;
  
  -- If remaining quantity > 0, insufficient stock
  IF v_remaining_qty > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: needed %, available in batches', NEW.quantity;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sale_item_insert
  AFTER INSERT ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_on_sale();

-- Data migration: Update existing bills to new format and populate batch_stock
DO $$
DECLARE
  v_bill RECORD;
  v_new_bill_no TEXT;
  v_item RECORD;
BEGIN
  -- Process each existing purchase bill (oldest to newest)
  FOR v_bill IN 
    SELECT id, bill_date, software_bill_no
    FROM purchase_bills 
    ORDER BY bill_date ASC
  LOOP
    -- If bill already has new format (starts with 'B'), skip
    IF v_bill.software_bill_no LIKE 'B%' THEN
      CONTINUE;
    END IF;
    
    -- Generate new bill number based on bill date
    v_new_bill_no := generate_purchase_bill_number(v_bill.bill_date);
    
    -- Update bill with new format
    UPDATE purchase_bills 
    SET software_bill_no = v_new_bill_no 
    WHERE id = v_bill.id;
    
    -- Update all items in this bill
    UPDATE purchase_items 
    SET bill_number = v_new_bill_no 
    WHERE bill_id = v_bill.id;
    
    -- Create batch_stock records for each item
    FOR v_item IN
      SELECT sku_id, SUM(qty) as total_qty
      FROM purchase_items
      WHERE bill_id = v_bill.id AND sku_id IS NOT NULL
      GROUP BY sku_id
    LOOP
      -- Insert or update batch_stock
      INSERT INTO batch_stock (
        variant_id, 
        bill_number, 
        quantity, 
        purchase_bill_id, 
        purchase_date
      )
      VALUES (
        v_item.sku_id,
        v_new_bill_no,
        v_item.total_qty,
        v_bill.id,
        v_bill.bill_date
      )
      ON CONFLICT (variant_id, bill_number) DO UPDATE
      SET quantity = batch_stock.quantity + EXCLUDED.quantity;
    END LOOP;
    
  END LOOP;
  
  RAISE NOTICE 'Migration completed successfully';
END $$;