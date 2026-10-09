import pandas as pd
import json

df_users = pd.read_parquet('export-new/sigyr/public.users/1/part-00000-82534c7a-b254-40fa-b65e-79836769340b-c000.gz.parquet')
df_props = pd.read_parquet('export-new/sigyr/public.properties/1/part-00000-c14bad2d-2e49-4ec0-ab0a-7b3e728bcd25-c000.gz.parquet')

# Get inactive user ids
inactive_user_ids = df_users[df_users['status'] == 0]['id'].tolist()

# Get properties for these inactive users
inactive_props = df_props[df_props['user_id'].isin(inactive_user_ids)]
# Filter out those where urbaser_code is null
inactive_codes = inactive_props['urbaser_code'].dropna().tolist()

with open('inactive_codes.json', 'w') as f:
    json.dump(inactive_codes, f)

print(f"Extracted {len(inactive_codes)} inactive property codes.")
