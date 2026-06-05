-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- Ensures vendors can update the extra_images column on their own products.

-- 1. Add the column if it was never created
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS extra_images text[] DEFAULT '{}';

-- 2. Recreate the vendor update policy to cover ALL columns (including extra_images)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Vendors can update own products" ON public.products;

  CREATE POLICY "Vendors can update own products" ON public.products
    FOR UPDATE
    USING  (auth.uid() = vendor_id)
    WITH CHECK (auth.uid() = vendor_id);

  -- Belt-and-suspenders: grant column-level UPDATE to authenticated role
  EXECUTE 'GRANT UPDATE (extra_images) ON public.products TO authenticated';
END $$;

-- 3. Verify
SELECT policyname, cmd, qual
FROM   pg_policies
WHERE  tablename = 'products'
ORDER  BY policyname;
