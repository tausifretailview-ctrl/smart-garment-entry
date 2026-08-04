update public.barcode_label_settings b
set setting_data = jsonb_build_object('width',39,'height',35,'cols',5,'rows',8,'gap',0,'scale',100)
from public.organizations o
where o.id = b.organization_id and o.name ilike '%nisa%'
  and b.setting_type = 'sheet_preset' and b.setting_name in ('NEW 40','40 label sheet');

update public.barcode_label_settings b
set setting_data = jsonb_build_object('topOffset',0,'leftOffset',0,'bottomOffset',0,'rightOffset',0)
from public.organizations o
where o.id = b.organization_id and o.name ilike '%nisa%'
  and b.setting_type = 'margin_preset' and b.setting_name = '40';

update public.barcode_label_settings b
set setting_data = (b.setting_data
      || jsonb_build_object('topOffset',0,'leftOffset',0,'bottomOffset',0,'rightOffset',0)
      || jsonb_build_object('customDimensions', jsonb_build_object('width',39,'height',35,'cols',5,'rows',8,'gap',0,'scale',100)))
from public.organizations o
where o.id = b.organization_id and o.name ilike '%nisa%'
  and b.setting_type = 'default_format'
  and b.setting_data->>'customPresetName' = 'NEW 40';