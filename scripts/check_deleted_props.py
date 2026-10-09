import pandas as pd
df_props = pd.read_parquet('export-new/sigyr/public.properties/1/part-00000-c14bad2d-2e49-4ec0-ab0a-7b3e728bcd25-c000.gz.parquet')
deleted_props = df_props[df_props['deleted_at'].notna()]
print(f"Number of deleted properties in old system: {len(deleted_props)}")

# also check if any have registration_status != 'approved'
rejected_props = df_props[df_props['registration_status'] == 'rejected']
print(f"Number of rejected properties in old system: {len(rejected_props)}")
