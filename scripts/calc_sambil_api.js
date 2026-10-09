const fetch = globalThis.fetch;

async function run() {
  const res = await fetch(`http://localhost:3000/api/admin/condominios?codigo=URB016119`).then(r => r.json()).catch(console.error);
  if (!res) {
     console.log("Next server is down, cannot query calculateEstado");
     return;
  }
  
  console.log("Aseo Base Condominio Bs:", res.mensual?.condominioBs);
  console.log("Unidades cobradas:", res.mensual?.unidadesCobradas);
  console.log("Unidades desocupadas:", res.mensual?.unidadesDesocupadas);
}
run().catch(console.error);
