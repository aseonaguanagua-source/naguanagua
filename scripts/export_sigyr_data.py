import duckdb
import json
import os

print("Connecting to DuckDB and loading SIGYR parquet data...")
con = duckdb.connect()

# Format prefix based on document_type_id: 1->V, 2->E, 3->J, 4->G
con.execute("""
CREATE OR REPLACE TABLE sigyr_users AS
SELECT 
    id,
    document_type_id,
    document,
    CASE 
        WHEN document_type_id = 1 THEN 'V-' || TRIM(CAST(document AS VARCHAR))
        WHEN document_type_id = 2 THEN 'E-' || TRIM(CAST(document AS VARCHAR))
        WHEN document_type_id = 3 THEN 'J-' || TRIM(CAST(document AS VARCHAR))
        WHEN document_type_id = 4 THEN 'G-' || TRIM(CAST(document AS VARCHAR))
        ELSE 'V-' || TRIM(CAST(document AS VARCHAR))
    END as rif,
    COALESCE(NULLIF(TRIM(business_name), ''), NULLIF(TRIM(name), ''), 'Sin Nombre') as name,
    retention,
    deleted_at
FROM '/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.users/*/*.parquet'
WHERE deleted_at IS NULL;
""")

con.execute("""
CREATE OR REPLACE TABLE sigyr_props AS
SELECT 
    id,
    user_id,
    UPPER(TRIM(urbaser_code)) as code,
    TRY_CAST(cached_total_debt_bs AS DOUBLE) as debt_bs,
    COALESCE(pending_months, 0) as pending_months,
    deleted_at
FROM '/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr/public.properties/*/*.parquet'
WHERE deleted_at IS NULL AND urbaser_code IS NOT NULL AND TRIM(urbaser_code) != '';
""")

print("Querying retention agents in SIGYR...")
retention_users = con.execute("""
SELECT 
    rif,
    name,
    document,
    document_type_id,
    retention
FROM sigyr_users
WHERE retention = 1
ORDER BY rif;
""").fetchall()

print(f"Total retention users in SIGYR: {len(retention_users)}")

print("Querying property debts in SIGYR...")
prop_debts = con.execute("""
SELECT 
    p.code,
    u.rif,
    u.name,
    COALESCE(p.debt_bs, 0) as debt_bs,
    p.pending_months,
    u.retention
FROM sigyr_props p
LEFT JOIN sigyr_users u ON p.user_id = u.id;
""").fetchall()

print(f"Total properties mapped in SIGYR: {len(prop_debts)}")

# Aggregate per user in SIGYR
user_aggregates = con.execute("""
SELECT 
    u.rif,
    u.name,
    u.retention,
    COUNT(p.id) as total_props,
    SUM(COALESCE(p.debt_bs, 0)) as total_debt_bs,
    MAX(p.pending_months) as max_pending_months
FROM sigyr_users u
LEFT JOIN sigyr_props p ON u.id = p.user_id
GROUP BY u.rif, u.name, u.retention
HAVING total_props > 0;
""").fetchall()

print(f"Total users with properties in SIGYR: {len(user_aggregates)}")

data_out = {
    "sigyr_retention_users": [
        {"rif": r[0], "name": r[1], "document": r[2], "document_type_id": r[3], "retention": r[4]}
        for r in retention_users
    ],
    "sigyr_user_debts": [
        {"rif": u[0], "name": u[1], "retention": u[2], "props_count": u[3], "debt_bs": u[4], "pending_months": u[5]}
        for u in user_aggregates
    ],
    "sigyr_prop_debts": [
        {"code": p[0], "rif": p[1], "name": p[2], "debt_bs": p[3], "pending_months": p[4], "retention": p[5]}
        for p in prop_debts
    ]
}

out_file = "/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/scripts/sigyr_summary.json"
print(f"Saving summary to {out_file}...")
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(data_out, f, ensure_ascii=False)

print("Export completed successfully!")
