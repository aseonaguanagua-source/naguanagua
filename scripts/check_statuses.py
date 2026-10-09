import pandas as pd
df_users = pd.read_parquet('export-new/sigyr/public.users/1/part-00000-82534c7a-b254-40fa-b65e-79836769340b-c000.gz.parquet')
filtered = df_users[df_users['document'].str.contains('301927648', na=False)]
print(filtered[['id', 'name', 'status']])
