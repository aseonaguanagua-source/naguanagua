async function check() {
  const codes = ['URB033046', 'URB006800'];
  for (const code of codes) {
    try {
      const formData = new URLSearchParams();
      formData.append('inmueble', code);
      const res = await fetch('https://app.alcaldianaguanagua.gob.ve/api/buscar_contribuyente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      const data = await res.json();
      console.log(`\n=== API OLd para ${code} ===`);
      if (data && data.length > 0) {
        console.log(`Estado: ${data[0].estado}`);
        console.log(`Actividad: ${data[0].actividad_principal}`);
      } else {
        console.log("No encontrado");
      }
    } catch(e) { console.error(e.message); }
  }
}
check();
