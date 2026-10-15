import duckdb

con = duckdb.connect()

print("=== 1. COLUMNAS DE ECONOMIC_ACTIVITIES ===")
cols_ea = con.execute("""
  DESCRIBE SELECT * FROM read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.economic_activities/*/*.parquet') LIMIT 1
""").df()
print(cols_ea[['column_name', 'column_type']].to_string())

print("\n=== 2. PROPIEDADES HIJAS O CON EL MISMO USER_ID O PROPERTY_ID ===")
props = con.execute("""
  SELECT p.id, p.user_id, p.property_id, p.urbaser_code, p.economic_activity_id, p.deleted_at, p.registration_status,
         p.quantity_houses, p.reference, p.pending_months, p.cached_total_debt_bs,
         ea.code as act_code, ea.name as act_name
  FROM read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.properties/*/*.parquet') p
  LEFT JOIN read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.economic_activities/*/*.parquet') ea
    ON p.economic_activity_id = ea.id
  WHERE p.user_id = 35708 OR p.property_id = 35707 OR p.urbaser_code = 'URB030765'
  ORDER BY p.urbaser_code
""").df()
print(props.to_string())

print("\n=== 3. BUSCAR EN public.activity_histories O public.discount_economic_activity ===")
try:
    ah = con.execute("""
      SELECT * FROM read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.activity_histories/*/*.parquet')
      WHERE property_id = 35707 OR user_id = 35708
    """).df()
    print("activity_histories:", ah.to_string())
except Exception as e:
    print("activity_histories error:", e)

print("\n=== 4. BUSCAR SI HAY OTRAS PROPIEDADES EN LA MISMA DIRECCIÓN / CATASTRO 14578 ===")
mismas = con.execute("""
  SELECT p.id, p.urbaser_code, p.catastral_id, p.economic_activity_id, p.deleted_at, ea.code, ea.name
  FROM read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.properties/*/*.parquet') p
  LEFT JOIN read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.economic_activities/*/*.parquet') ea
    ON p.economic_activity_id = ea.id
  WHERE p.catastral_id = '14578'
""").df()
print(mismas.to_string())
