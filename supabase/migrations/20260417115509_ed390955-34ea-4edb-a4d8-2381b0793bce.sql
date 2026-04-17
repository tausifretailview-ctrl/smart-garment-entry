-- Step 1: Hard-delete duplicate purchase_items (keeps earliest per barcode+size)
-- The on-delete trigger will automatically reverse stock_qty and batch_stock for each removed row.
DELETE FROM purchase_items
WHERE bill_id = '33b10ed8-cdfc-4f1e-b485-02e7488d2cfe'
  AND id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY barcode, size ORDER BY created_at
      ) AS rn
      FROM purchase_items
      WHERE bill_id = '33b10ed8-cdfc-4f1e-b485-02e7488d2cfe'
        AND deleted_at IS NULL
        AND barcode IS NOT NULL AND barcode <> ''
    ) t WHERE rn > 1
  );

-- Step 2: Recalculate bill header totals from cleaned items (scoped to this bill + org)
UPDATE purchase_bills pb
SET total_qty = sub.total_qty,
    gross_amount = sub.gross_amount,
    net_amount = sub.gross_amount - COALESCE(pb.discount_amount, 0) + COALESCE(pb.other_charges, 0) + COALESCE(pb.round_off, 0),
    updated_at = NOW()
FROM (
  SELECT bill_id, SUM(qty) AS total_qty, SUM(line_total) AS gross_amount
  FROM purchase_items
  WHERE bill_id = '33b10ed8-cdfc-4f1e-b485-02e7488d2cfe'
    AND deleted_at IS NULL
  GROUP BY bill_id
) sub
WHERE pb.id = sub.bill_id
  AND pb.id = '33b10ed8-cdfc-4f1e-b485-02e7488d2cfe'
  AND pb.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5';