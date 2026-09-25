#!/bin/bash
# FASE M4/M5: Extracción OPTIMIZADA — pipe tr + awk
DUMP="/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/sigyr_prod_20260826.sql"
OUT="/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/extracted"

mkdir -p "$OUT"
rm -f "$OUT"/*.tsv

echo "📦 Extracción optimizada (tr + awk, 40GB)..."
echo "   Inicio: $(date)"

# Strip \r with tr, then awk for routing — much faster than gsub per line
tr -d '\r' < "$DUMP" | awk -v out="$OUT" '
/^COPY public\.economic_activities /  { f=out"/economic_activities.tsv"; c=1; next }
/^COPY public\.credit_notes /         { f=out"/credit_notes.tsv"; c=1; next }
/^COPY public\.agreements /           { f=out"/agreements.tsv"; c=1; next }
/^COPY public\.convention_quotas /    { f=out"/convention_quotas.tsv"; c=1; next }
/^COPY public\.exonerations /         { f=out"/exonerations.tsv"; c=1; next }
/^COPY public\.fines /                { f=out"/fines.tsv"; c=1; next }
/^COPY public\.fine_types /           { f=out"/fine_types.tsv"; c=1; next }
/^COPY public\.prices /               { f=out"/prices.tsv"; c=1; next }
/^COPY public\.bills /                { f=out"/bills.tsv"; c=1; next }
/^COPY public\.bill_details /         { f=out"/bill_details.tsv"; c=1; next }
/^COPY public\.bill_payments /        { f=out"/bill_payments.tsv"; c=1; next }
/^COPY public\.bill_credit_notes /    { f=out"/bill_credit_notes.tsv"; c=1; next }
/^COPY public\.digital_invoices /     { f=out"/digital_invoices.tsv"; c=1; next }
/^COPY public\.routes /               { f=out"/routes.tsv"; c=1; next }
c && /^\\.$/ { c=0; close(f); next }
c { print >> f }
'

echo "   Fin: $(date)"
echo ""
echo "✅ Archivos extraídos:"
for f in "$OUT"/*.tsv; do
  [ -f "$f" ] && echo "  $(basename "$f"): $(wc -l < "$f") filas ($(ls -lh "$f" | awk '{print $5}'))"
done
