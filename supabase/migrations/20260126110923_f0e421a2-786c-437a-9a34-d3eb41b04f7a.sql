-- Function to get complete product relation chart
CREATE OR REPLACE FUNCTION get_product_relations(p_product_id UUID)
RETURNS TABLE (
  relation_type TEXT,
  record_count INTEGER,
  sample_references TEXT[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  
  -- Sales
  SELECT 
    'Sales'::TEXT as relation_type,
    COUNT(DISTINCT si.sale_id)::INTEGER as record_count,
    (SELECT ARRAY_AGG(sub.sale_number) FROM (
      SELECT DISTINCT s2.sale_number
      FROM sale_items si2
      JOIN sales s2 ON s2.id = si2.sale_id
      WHERE si2.product_id = p_product_id AND s2.deleted_at IS NULL
      ORDER BY s2.sale_number DESC
      LIMIT 5
    ) sub) as sample_references
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.product_id = p_product_id AND s.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Purchases
  SELECT 
    'Purchases'::TEXT,
    COUNT(DISTINCT pi.bill_id)::INTEGER,
    (SELECT ARRAY_AGG(sub.software_bill_no) FROM (
      SELECT DISTINCT pb2.software_bill_no
      FROM purchase_items pi2
      JOIN purchase_bills pb2 ON pb2.id = pi2.bill_id
      WHERE pi2.product_id = p_product_id AND pb2.deleted_at IS NULL
      ORDER BY pb2.software_bill_no DESC
      LIMIT 5
    ) sub)
  FROM purchase_items pi
  JOIN purchase_bills pb ON pb.id = pi.bill_id
  WHERE pi.product_id = p_product_id AND pb.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Sale Returns
  SELECT 
    'Sale Returns'::TEXT,
    COUNT(DISTINCT sri.return_id)::INTEGER,
    (SELECT ARRAY_AGG(sub.return_number) FROM (
      SELECT DISTINCT sr2.return_number
      FROM sale_return_items sri2
      JOIN sale_returns sr2 ON sr2.id = sri2.return_id
      WHERE sri2.product_id = p_product_id AND sr2.deleted_at IS NULL
      ORDER BY sr2.return_number DESC
      LIMIT 5
    ) sub)
  FROM sale_return_items sri
  JOIN sale_returns sr ON sr.id = sri.return_id
  WHERE sri.product_id = p_product_id AND sr.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Purchase Returns
  SELECT 
    'Purchase Returns'::TEXT,
    COUNT(DISTINCT pri.return_id)::INTEGER,
    (SELECT ARRAY_AGG(sub.return_number) FROM (
      SELECT DISTINCT pr2.return_number
      FROM purchase_return_items pri2
      JOIN purchase_returns pr2 ON pr2.id = pri2.return_id
      WHERE pri2.product_id = p_product_id AND pr2.deleted_at IS NULL
      ORDER BY pr2.return_number DESC
      LIMIT 5
    ) sub)
  FROM purchase_return_items pri
  JOIN purchase_returns pr ON pr.id = pri.return_id
  WHERE pri.product_id = p_product_id AND pr.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Quotations
  SELECT 
    'Quotations'::TEXT,
    COUNT(DISTINCT qi.quotation_id)::INTEGER,
    (SELECT ARRAY_AGG(sub.quotation_number) FROM (
      SELECT DISTINCT q2.quotation_number
      FROM quotation_items qi2
      JOIN quotations q2 ON q2.id = qi2.quotation_id
      WHERE qi2.product_id = p_product_id AND q2.deleted_at IS NULL
      ORDER BY q2.quotation_number DESC
      LIMIT 5
    ) sub)
  FROM quotation_items qi
  JOIN quotations q ON q.id = qi.quotation_id
  WHERE qi.product_id = p_product_id AND q.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Sale Orders
  SELECT 
    'Sale Orders'::TEXT,
    COUNT(DISTINCT soi.order_id)::INTEGER,
    (SELECT ARRAY_AGG(sub.order_number) FROM (
      SELECT DISTINCT so2.order_number
      FROM sale_order_items soi2
      JOIN sale_orders so2 ON so2.id = soi2.order_id
      WHERE soi2.product_id = p_product_id AND so2.deleted_at IS NULL
      ORDER BY so2.order_number DESC
      LIMIT 5
    ) sub)
  FROM sale_order_items soi
  JOIN sale_orders so ON so.id = soi.order_id
  WHERE soi.product_id = p_product_id AND so.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Delivery Challans
  SELECT 
    'Delivery Challans'::TEXT,
    COUNT(DISTINCT dci.challan_id)::INTEGER,
    (SELECT ARRAY_AGG(sub.challan_number) FROM (
      SELECT DISTINCT dc2.challan_number
      FROM delivery_challan_items dci2
      JOIN delivery_challans dc2 ON dc2.id = dci2.challan_id
      WHERE dci2.product_id = p_product_id AND dc2.deleted_at IS NULL
      ORDER BY dc2.challan_number DESC
      LIMIT 5
    ) sub)
  FROM delivery_challan_items dci
  JOIN delivery_challans dc ON dc.id = dci.challan_id
  WHERE dci.product_id = p_product_id AND dc.deleted_at IS NULL
  HAVING COUNT(*) > 0;
END;
$$;