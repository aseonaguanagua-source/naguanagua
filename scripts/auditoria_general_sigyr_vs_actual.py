import duckdb
import json
import os
import re
from datetime import datetime
from dotenv import dotenv_values
from supabase import createClient

ENV_PATH = os.path.join(os.path.dirname(__file__), '../.env.local')
env = dotenv_values(ENV_PATH)
supabase_url = env.get('NEXT_PUBLIC_SUPABASE_URL')
supabase_key = env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

sb = createClient(supabase_url, supabase_key)
con = duckdb.connect()

print("=" * 70)
print("🔍 INICIANDO AUDITORÍA INTEGRAL: BD VIEJA (SIGYR) vs BD ACTUAL (SUPABASE)")
print("=" * 70)

# 1. Cargar datos actuales de Supabase paginados
print("\n[1/4] Descargando registros de Supabase (inmuebles, pagos, facturas)...")
def fetch_all(table, columns):
    rows = []
    start = 0
    step = 1000
    while True:
        res = sb.table(table).select(columns).range(start, start + step - 1).execute()
        data = res.data
        if not data:
            break
        rows.extend(data)
        if len(data) < step:
            break
        start += step
    return rows

inmuebles_actuales = fetch_all('inmuebles', 'id,inmueble,identidad,contribuyente,actividad_principal,estado,padre_id,condominio_padre_id,es_condominio,mmv_mes,meses_deuda')
print(f"  -> Total inmuebles actuales en Supabase: {len(inmuebles_actuales):,}")

# Cargar referencias de pagos en sistema actual para protección
pagos_actuales = fetch_all('pagos_reportados', 'identidad,detalles,referencia,estado')
pagos_set = set()
for p in pagos_actuales:
    if p.get('identidad'):
        pagos_set.add(re.sub(r'\D', '', str(p['identidad'])))
    det = str(p.get('detalles') or '')
    for code in re.findall(r'(?:URB|AURI)\d{6}', det, re.I):
        pagos_set.add(code.upper())
print(f"  -> Identidades/Códigos con pagos en nuevo sistema protegidos: {len(pagos_set):,}")

# 2. Cargar datos de SIGYR via DuckDB
print("\n[2/4] Cargando tablas maestras de SIGYR (Parquet)...")
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

# Unir vista completa SIGYR
con.execute("""
CREATE OR REPLACE TABLE sigyr_full AS
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
    u.deleted_at as user_deleted_at,
    ea.id as act_id,
    ea.code as act_code,
    ea.name as act_name,
    parent_p.urbaser_code as parent_urbaser_code
FROM sigyr_properties p
LEFT JOIN sigyr_users u ON p.user_id = u.id
LEFT JOIN sigyr_activities ea ON p.economic_activity_id = ea.id
LEFT JOIN sigyr_properties parent_p ON p.property_id = parent_p.id;
""")

sigyr_map = {}
for row in con.execute("SELECT * FROM sigyr_full").df().to_dict(orient='records'):
    code = str(row['urbaser_code'] or '').strip().upper()
    if code:
        sigyr_map[code] = row
print(f"  -> Total propiedades mapeadas en SIGYR: {len(sigyr_map):,}")

# 3. AUDITORÍA DE LOS 3 PROBLEMAS
print("\n[3/4] Ejecutando análisis comparativo de los 3 problemas...")

# PROBLEMA 1: Usuarios / Inmuebles Desactivados en SIGYR pero Activos en Supabase
problema_1 = []
# PROBLEMA 2: Mezcla de Cédulas y Códigos
problema_2 = []
# PROBLEMA 3: Registros N/A que perdieron actividad o padre
problema_3 = []

def clean_doc(doc, doc_type_id):
    s = str(doc or '').strip()
    digits = re.sub(r'\D', '', s)
    t = str(doc_type_id or '1')
    prefix = 'V' if t == '1' else ('J' if t == '2' else ('E' if t == '3' else ('G' if t == '4' else 'V')))
    return f"{prefix}-{digits}" if digits else ""

for inm in inmuebles_actuales:
    code = str(inm.get('inmueble') or '').strip().upper()
    current_estado = inm.get('estado')
    current_ident = str(inm.get('identidad') or '').strip().upper()
    current_act = str(inm.get('actividad_principal') or '').strip().upper()
    current_padre = inm.get('padre_id') or inm.get('condominio_padre_id')
    inm_id = inm.get('id')

    sigyr = sigyr_map.get(code)

    # 1. Chequeo de Desactivados
    if sigyr:
        is_deleted_sigyr = (
            sigyr['prop_deleted_at'] is not None or 
            sigyr['user_deleted_at'] is not None or 
            str(sigyr['registration_status']).lower() in ['deleted', 'inactive', 'rejected']
        )
        if is_deleted_sigyr and current_estado == 'Activo':
            clean_id_digits = re.sub(r'\D', '', current_ident)
            has_payments = code in pagos_set or clean_id_digits in pagos_set
            problema_1.append({
                'id': inm_id,
                'inmueble': code,
                'contribuyente': inm.get('contribuyente'),
                'identidad': current_ident,
                'estado_actual': current_estado,
                'estado_sigyr': 'Eliminado / Inactivo en SIGYR',
                'tiene_pagos': has_payments,
                'accion': 'Revisión manual (Tiene pagos recientes)' if has_payments else 'Archivar / Desactivar (estado = "Eliminado")'
            })

    # 2. Chequeo de Mezcla de Cédulas y Códigos
    # Caso A: Identidad en Supabase tiene formato de código de inmueble (URB o AURI)
    if re.match(r'^(URB|AURI)\d{4,8}', current_ident):
        correct_ident = clean_doc(sigyr['document'], sigyr['document_type_id']) if sigyr else 'Desconocido'
        problema_2.append({
            'id': inm_id,
            'inmueble': code,
            'tipo_error': 'Código de Inmueble en campo Cédula/RIF',
            'valor_actual': current_ident,
            'valor_correcto_sigyr': correct_ident,
            'contribuyente': inm.get('contribuyente'),
            'accion': f"Restaurar identidad a '{correct_ident}'"
        })
    # Caso B: Inmueble en Supabase tiene formato de Cédula/RIF
    elif re.match(r'^[VEJG]-?\d{5,10}', code):
        problema_2.append({
            'id': inm_id,
            'inmueble': code,
            'tipo_error': 'Cédula/RIF en campo Código de Inmueble',
            'valor_actual': code,
            'valor_correcto_sigyr': 'Código faltante en importación inicial',
            'contribuyente': inm.get('contribuyente'),
            'accion': 'Asignar código de inmueble real o unificar con ficha'
        })
    # Caso C: Identidad difiere drásticamente de SIGYR (salvo si en SIGYR estaba vacía)
    elif sigyr and sigyr['document']:
        sigyr_doc = clean_doc(sigyr['document'], sigyr['document_type_id'])
        clean_cur = re.sub(r'\D', '', current_ident)
        clean_sig = re.sub(r'\D', '', sigyr_doc)
        if clean_cur != clean_sig and len(clean_sig) >= 6 and len(clean_cur) >= 6:
            # Solo si uno parece código o hubo cruce evidente
            if 'URB' in current_ident or 'AURI' in current_ident:
                problema_2.append({
                    'id': inm_id,
                    'inmueble': code,
                    'tipo_error': 'Cruce erróneo de Cédula/RIF con SIGYR',
                    'valor_actual': current_ident,
                    'valor_correcto_sigyr': sigyr_doc,
                    'contribuyente': inm.get('contribuyente'),
                    'accion': f"Restaurar identidad a '{sigyr_doc}'"
                })

    # 3. Chequeo de Registros N/A y Pérdida de Actividad o Padre
    if current_act in ['N/A', '', 'NONE', 'NULL']:
        sigyr_act = sigyr.get('act_name') if sigyr else None
        sigyr_parent = sigyr.get('parent_urbaser_code') if sigyr else None
        
        # Si tenía actividad real en SIGYR distinta de N/A
        if sigyr_act and str(sigyr_act).strip().upper() not in ['N/A', '']:
            problema_3.append({
                'id': inm_id,
                'inmueble': code,
                'tipo_error': 'Actividad N/A con Actividad Real en SIGYR',
                'valor_actual': current_act,
                'valor_correcto_sigyr': sigyr_act,
                'act_code': sigyr.get('act_code'),
                'padre_actual': current_padre,
                'padre_sigyr': sigyr_parent,
                'accion': f"Restaurar actividad a '{sigyr_act}'" + (f" y vincular a padre '{sigyr_parent}'" if sigyr_parent and not current_padre else "")
            })
        elif sigyr_parent and not current_padre:
            problema_3.append({
                'id': inm_id,
                'inmueble': code,
                'tipo_error': 'Unidad Hija separada de su Matriz/Padre',
                'valor_actual': f"Padre: {current_padre or 'Ninguno'}",
                'valor_correcto_sigyr': f"Padre: {sigyr_parent}",
                'act_code': sigyr.get('act_code') if sigyr else None,
                'padre_actual': current_padre,
                'padre_sigyr': sigyr_parent,
                'accion': f"Vincular a padre_id = '{sigyr_parent}'"
            })

print("\n" + "=" * 70)
print("📊 RESUMEN EJECUTIVO DE DISCREPANCIAS ENCONTRADAS")
print("=" * 70)
print(f"1. Registros Desactivados/Eliminados en SIGYR pero Activos en Supabase: {len(problema_1)}")
p1_archivar = [p for p in problema_1 if 'Archivar' in p['accion']]
p1_revisar = [p for p in problema_1 if 'Revisión' in p['accion']]
print(f"   - Candidatos a Desactivar (sin pagos): {len(p1_archivar)}")
print(f"   - Requieren Revisión Manual (tienen pagos registrados): {len(p1_revisar)}")

print(f"\n2. Mezcla / Cruce de Cédulas y Códigos: {len(problema_2)}")
for p in problema_2[:5]:
    print(f"   - {p['inmueble']}: {p['tipo_error']} | Actual: '{p['valor_actual']}' -> Correcto: '{p['valor_correcto_sigyr']}'")

print(f"\n3. Registros N/A con Actividad o Padre Perdido en SIGYR: {len(problema_3)}")
for p in problema_3[:5]:
    print(f"   - {p['inmueble']}: Actual: '{p['valor_actual']}' -> Correcto: '{p['valor_correcto_sigyr']}' (Padre: {p['padre_sigyr']})")

# Guardar resultados en JSON
resultados = {
    'fecha_auditoria': datetime.now().isoformat(),
    'resumen': {
        'total_inmuebles_supabase': len(inmuebles_actuales),
        'total_propiedades_sigyr': len(sigyr_map),
        'desactivados_activos': len(problema_1),
        'desactivados_a_archivar': len(p1_archivar),
        'desactivados_con_pagos': len(p1_revisar),
        'mezcla_cedulas_codigos': len(problema_2),
        'na_actividad_o_padre_perdido': len(problema_3)
    },
    'problema_1_desactivados': problema_1,
    'problema_2_cedulas_codigos': problema_2,
    'problema_3_na_actividades_padres': problema_3
}

json_path = os.path.join(os.path.dirname(__file__), 'auditoria_resultados.json')
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(resultados, f, indent=2, ensure_ascii=False)
print(f"\nResultados exportados a: {json_path}")
