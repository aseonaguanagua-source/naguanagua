import pandas as pd
import json

df_props = pd.read_parquet('export-new/sigyr/public.properties/1/part-00000-c14bad2d-2e49-4ec0-ab0a-7b3e728bcd25-c000.gz.parquet')
deleted_props = df_props[df_props['deleted_at'].notna() | (df_props['registration_status'] != 'approved')]
deleted_codes = deleted_props['urbaser_code'].dropna().tolist()

with open('deleted_codes.json', 'w') as f:
    json.dump(deleted_codes, f)

print(f"Extracted {len(deleted_codes)} deleted/rejected property codes.")
