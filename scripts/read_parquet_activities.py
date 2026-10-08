import pandas as pd
import json
import sys

file_path = "/Users/davidzara/Documents/naguanagua_zero/export-new/sigyr/public.activity_histories/1/part-00000-4586e21a-7de0-49fa-82d3-98c8e92c0fca-c000.gz.parquet"
df = pd.read_parquet(file_path)

# Filter columns if needed, or just dump to json records
data = df.to_dict(orient='records')

output_path = "/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/scratch/activity_histories.json"
with open(output_path, "w") as f:
    json.dump(data, f, default=str)

print(f"Dumped {len(data)} records to {output_path}")
