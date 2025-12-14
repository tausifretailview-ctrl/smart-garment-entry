-- Add field sales access control columns to employees table
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS field_sales_access boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_field_sales_access ON public.employees(field_sales_access) WHERE field_sales_access = true;

-- Add comment for documentation
COMMENT ON COLUMN public.employees.field_sales_access IS 'Whether this employee can access the Field Sales mobile app';
COMMENT ON COLUMN public.employees.user_id IS 'Link to auth.users for employees who can login to the app';