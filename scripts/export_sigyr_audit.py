import duckdb
import json
import os

con = duckdb.connect()

print("Cargando SIGYR con DuckDB...")
con.execute("""
CREATE OR REPLACE TABLE sigyr_properties AS 
SELECT id, user_id, property_id, urbaser_code, economic_activity_id, deleted_at, registration_status, reference
FROM read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.properties/*/*.parquet');
""")

con.execute("""
CREATE OR REPLACE TABLE sigyr_users AS 
SELECT id, document_type_id, document, name, lastname, deleted_at
FROM read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.users/*/*.parquet');
""")

con.execute("""
CREATE OR REPLACE TABLE sigyr_activities AS 
SELECT id, code, name
FROM read_parquet('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.economic_activities/*/*.parquet');
""")

print("Generando vista unificada SIGYR...")
df = con.execute("""
SELECT 
    p.id as prop_id,
    p.property_id as parent_prop_id,
    p.urbaser_code,
    p.deleted_at as prop_deleted_at,
    p.registration_status,
    p.reference,
    u.id as user_id,
    u.document_type_id,
    u.document,
    u.name as user_name,
    u.lastname as user_lastname,
    u.deleted_at as user_deleted_at,
    ea.id as act_id,
    ea.code as act_code,
    ea.name as act_name,
    parent_p.urbaser_code as parent_urbaser_code
FROM sigyr_properties p
LEFT JOIN sigyr_users u ON p.user_id = u.id
LEFT JOIN sigyr_activities ea ON p.economic_activity_id = ea.id
LEFT JOIN sigyr_properties parent_p ON p.property_id = parent_p.id;
""").df()

out_path = '/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr_audit_dump.json'
print(f"Exportando {len(df)} registros a {out_path}...")
df.to_json(out_path, orient='records', force_ascii=False)
print("Exportación lista.")
