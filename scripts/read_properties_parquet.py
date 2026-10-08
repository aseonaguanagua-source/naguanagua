import pandas as pd
import json
import sys

file_path = "/Users/davidzara/Documents/naguanagua_zero/export-new/sigyr/public.properties/1/part-00000-c14bad2d-2e49-4ec0-ab0a-7b3e728bcd25-c000.gz.parquet"
df = pd.read_parquet(file_path)

urb016120 = df[df['urbaser_code'] == 'URB016120']
if not urb016120.empty:
    parent_id = urb016120.iloc[0]['id']
    print(f"Found URB016120 with ID {parent_id}")
    
    children = df[df['property_id'] == parent_id]
    print(f"Found {len(children)} children for URB016120")
    for _, child in children.iterrows():
        print(f"Child {child['urbaser_code']} with economic_activity_id {child['economic_activity_id']}")
else:
    print("URB016120 not found in Parquet!")
