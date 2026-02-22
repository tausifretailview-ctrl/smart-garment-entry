
-- Function to auto-create/update a customer record when a student is created or updated
CREATE OR REPLACE FUNCTION public.sync_student_to_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- If student already has a linked customer, update it
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE customers
    SET 
      customer_name = NEW.student_name,
      phone = NEW.parent_phone,
      email = NEW.parent_email,
      address = NEW.address,
      updated_at = NOW()
    WHERE id = NEW.customer_id
      AND organization_id = NEW.organization_id;
    RETURN NEW;
  END IF;

  -- Check if a customer with same name and org already exists (avoid duplicates)
  SELECT id INTO v_customer_id
  FROM customers
  WHERE organization_id = NEW.organization_id
    AND customer_name = NEW.student_name
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    -- Link existing customer
    NEW.customer_id := v_customer_id;
    -- Update customer details
    UPDATE customers
    SET 
      phone = COALESCE(NEW.parent_phone, phone),
      email = COALESCE(NEW.parent_email, email),
      address = COALESCE(NEW.address, address),
      updated_at = NOW()
    WHERE id = v_customer_id;
  ELSE
    -- Create new customer
    INSERT INTO customers (organization_id, customer_name, phone, email, address)
    VALUES (NEW.organization_id, NEW.student_name, NEW.parent_phone, NEW.parent_email, NEW.address)
    RETURNING id INTO v_customer_id;
    
    NEW.customer_id := v_customer_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on students table
DROP TRIGGER IF EXISTS trg_sync_student_to_customer ON students;
CREATE TRIGGER trg_sync_student_to_customer
  BEFORE INSERT OR UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION sync_student_to_customer();

-- One-time sync: Create customer records for all existing students without customer_id
DO $$
DECLARE
  rec RECORD;
  v_customer_id UUID;
BEGIN
  FOR rec IN 
    SELECT id, organization_id, student_name, parent_phone, parent_email, address
    FROM students
    WHERE customer_id IS NULL AND deleted_at IS NULL
  LOOP
    -- Check for existing customer with same name
    SELECT c.id INTO v_customer_id
    FROM customers c
    WHERE c.organization_id = rec.organization_id
      AND c.customer_name = rec.student_name
      AND c.deleted_at IS NULL
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      INSERT INTO customers (organization_id, customer_name, phone, email, address)
      VALUES (rec.organization_id, rec.student_name, rec.parent_phone, rec.parent_email, rec.address)
      RETURNING id INTO v_customer_id;
    END IF;

    UPDATE students SET customer_id = v_customer_id WHERE id = rec.id;
  END LOOP;
END;
$$;
