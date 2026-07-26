-- STEP 1d — Rollback: remove show_mrp key (restore absent/null).
-- Only valid if 1b returned 0 rows before the update (we only added the key where it was null).

update settings
set purchase_settings = purchase_settings - 'show_mrp'
where organization_id in (
  '697c451a-f863-4fe4-82f3-31859a9e5251',
  '3fdca631-1e0c-4417-9704-421f5129ff67',
  'ceb7f3dd-3619-4718-a8c1-43a02252e5b9',
  '93606968-c342-4b72-a1ce-2d75d678567f',
  'c2bd3701-8f43-467e-a9c5-e21a608c5f3b',
  '2f0b5508-a46d-47a0-be7d-acfc29f33052',
  'b6946ccd-b2d2-45b0-9487-c24483e0dbed',
  '0b3a8035-1bf6-40a0-b038-8f0406c93c18',
  '184c86d6-bd6f-4441-815f-07984697d884',
  '526cefea-0907-48d5-9f6b-fa0856116e7c',
  '8b6fad0e-0aef-414a-8c5d-6acd66152033',
  'eff5628d-621d-49cf-bdae-537a3e99150b',
  'c76415dd-8484-4f05-815b-ef1b08ce7f2f',
  '70e4d691-2604-4ae9-9127-27f8e9535585'
);
