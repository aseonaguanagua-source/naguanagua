import pandas as pd
df = pd.read_parquet('export-new/sigyr/public.properties/1/part-00000-c14bad2d-2e49-4ec0-ab0a-7b3e728bcd25-c000.gz.parquet')
filtered = df[df['urbaser_code'].isin(['URB033046', 'URB006800'])]
print(filtered[['urbaser_code', 'deleted_at', 'registration_status', 'is_syncing']])
