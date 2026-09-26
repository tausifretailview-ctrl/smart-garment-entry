-- Performance round 1: RLS hot paths + invoice/POS dashboard list index.
-- Access semantics unchanged; predicates are cheaper (org id on sale_items,
-- write-only admin rules on product_variants, initplan-safe platform checks).
-- Safe to re-run: skips policies that do not exist; index uses IF NOT EXISTS.

-- ── 0) Preconditions (fail closed — changes nothing on failure) ─────────────
DO $$
DECLARE
  v_null_sale_items bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sale_items'
      AND column_name = 'organization_id'
  ) THEN
    RAISE EXCEPTION
      'Pre-check failed: sale_items.organization_id missing. Apply 20261130120000_sale_items_org_search_rpc.sql first.';
  END IF;

  SELECT COUNT(*) INTO v_null_sale_items
  FROM public.sale_items
  WHERE organization_id IS NULL;

  IF v_null_sale_items > 0 THEN
    RAISE EXCEPTION
      'Pre-check failed: % sale_items rows have NULL organization_id. Fix backfill before this migration.',
      v_null_sale_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_variants'
      AND column_name = 'organization_id'
  ) THEN
    RAISE EXCEPTION 'Pre-check failed: product_variants.organization_id missing.';
  END IF;
END $$;

-- ── 1) sale_items — scope by organization_id (not sale_id IN all sales) ───
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_items'
      AND policyname = 'Org members can view sale items'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "Org members can view sale items" ON public.sale_items
      USING (
        organization_id IN (
          SELECT public.get_user_organization_ids((SELECT auth.uid()))
        )
      )
    $sql$;
  ELSE
    RAISE NOTICE 'policy "Org members can view sale items" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_items'
      AND policyname = 'Org members can insert sale items'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "Org members can insert sale items" ON public.sale_items
      WITH CHECK (
        organization_id IN (
          SELECT public.get_user_organization_ids((SELECT auth.uid()))
        )
      )
    $sql$;
  ELSE
    RAISE NOTICE 'policy "Org members can insert sale items" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_items'
      AND policyname = 'Org members can update sale items'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "Org members can update sale items" ON public.sale_items
      USING (
        organization_id IN (
          SELECT public.get_user_organization_ids((SELECT auth.uid()))
        )
      )
    $sql$;
  ELSE
    RAISE NOTICE 'policy "Org members can update sale items" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_items'
      AND policyname = 'Organization members can delete sale items'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "Organization members can delete sale items" ON public.sale_items
      USING (
        organization_id IN (
          SELECT public.get_user_organization_ids((SELECT auth.uid()))
        )
      )
    $sql$;
  ELSE
    RAISE NOTICE 'policy "Organization members can delete sale items" does not exist, skipping';
  END IF;
END $$;

-- Duplicate read rule (same predicate as org-scoped select above)
DROP POLICY IF EXISTS "org_sale_items_select" ON public.sale_items;

-- ── 2) product_variants — admin/manager rules on writes only ───────────────
DROP POLICY IF EXISTS "Admins and managers can manage variants" ON public.product_variants;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'product_variants'
      AND policyname = 'Admins and managers can insert variants'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Admins and managers can insert variants"
      ON public.product_variants
      FOR INSERT
      TO authenticated
      WITH CHECK (
        public.user_belongs_to_org((SELECT auth.uid()), organization_id)
        AND (
          public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
          OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
        )
      )
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'product_variants'
      AND policyname = 'Admins and managers can update variants'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Admins and managers can update variants"
      ON public.product_variants
      FOR UPDATE
      TO authenticated
      USING (
        public.user_belongs_to_org((SELECT auth.uid()), organization_id)
        AND (
          public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
          OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
        )
      )
      WITH CHECK (
        public.user_belongs_to_org((SELECT auth.uid()), organization_id)
        AND (
          public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
          OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
        )
      )
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'product_variants'
      AND policyname = 'Admins and managers can delete variants'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Admins and managers can delete variants"
      ON public.product_variants
      FOR DELETE
      TO authenticated
      USING (
        public.user_belongs_to_org((SELECT auth.uid()), organization_id)
        AND (
          public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
          OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
        )
      )
    $sql$;
  END IF;
END $$;

DROP POLICY IF EXISTS "org_variants_select" ON public.product_variants;

-- ── 3) organization_members + user_roles — initplan-safe platform checks ───
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members'
      AND policyname = 'platform_admins_can_delete_members'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "platform_admins_can_delete_members" ON public.organization_members
      USING ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
    $sql$;
  ELSE
    RAISE NOTICE 'policy "platform_admins_can_delete_members" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members'
      AND policyname = 'platform_admins_can_manage_all_members'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "platform_admins_can_manage_all_members" ON public.organization_members
      USING ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
      WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
    $sql$;
  ELSE
    RAISE NOTICE 'policy "platform_admins_can_manage_all_members" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members'
      AND policyname = 'platform_admins_can_update_member_roles'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "platform_admins_can_update_member_roles" ON public.organization_members
      USING ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
      WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
    $sql$;
  ELSE
    RAISE NOTICE 'policy "platform_admins_can_update_member_roles" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'Platform admins can delete roles'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "Platform admins can delete roles" ON public.user_roles
      USING ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
    $sql$;
  ELSE
    RAISE NOTICE 'policy "Platform admins can delete roles" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'Platform admins can insert roles'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "Platform admins can insert roles" ON public.user_roles
      WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
    $sql$;
  ELSE
    RAISE NOTICE 'policy "Platform admins can insert roles" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'Platform admins can update roles'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "Platform admins can update roles" ON public.user_roles
      USING ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
    $sql$;
  ELSE
    RAISE NOTICE 'policy "Platform admins can update roles" does not exist, skipping';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'platform_admins_can_view_all_roles'
  ) THEN
    EXECUTE $sql$
      ALTER POLICY "platform_admins_can_view_all_roles" ON public.user_roles
      USING ((SELECT public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)))
    $sql$;
  ELSE
    RAISE NOTICE 'policy "platform_admins_can_view_all_roles" does not exist, skipping';
  END IF;
END $$;

-- ── 4) Dashboard list: newest bills per org (created_at DESC) ──────────────
CREATE INDEX IF NOT EXISTS idx_sales_org_created_at_dashboard
  ON public.sales (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── 5) Post-check — policies on the four touched tables ────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles::text AS roles,
  left(coalesce(qual, ''), 120) AS qual_preview,
  left(coalesce(with_check, ''), 120) AS with_check_preview
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'sale_items',
    'product_variants',
    'organization_members',
    'user_roles'
  )
ORDER BY tablename, policyname;
