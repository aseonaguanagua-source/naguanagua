'use client';

import { useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/audit';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function ManualBCVRateEditor({ currentRate }: { currentRate: number }) {
  const [manualRate, setManualRate] = useState<string>(currentRate.toString());
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    if (!manualRate || isNaN(parseFloat(manualRate.replace(',', '.')))) {
      alert('Por favor ingrese un número válido.');
      return;
    }

    const numericRate = parseFloat(manualRate.replace(',', '.'));
    setIsSaving(true);

    try {
      // Upsert the manual rate to sistema_config
      const { error } = await supabase
        .from('sistema_config')
        .upsert({ id: 'tasa_bcv_manual', valor: numericRate.toString() });

      if (error) throw error;

      alert(`Tasa manual guardada exitosamente: Bs. ${numericRate}. Esta tasa ahora se utilizará en todo el sistema de forma automática.`);
      
      // Force API cache revalidation
      await fetch('/api/bcv?sync=true');
      
      router.refresh(); // Refresh page to show new rate
    } catch (e: any) {
      alert('Error guardando la tasa manual: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('sistema_config')
        .delete()
        .eq('id', 'tasa_bcv_manual');

      if (error) throw error;
      
      alert('Tasa manual eliminada. El sistema volverá a utilizar el valor oficial automático.');
      await fetch('/api/bcv?sync=true');
      router.refresh();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-semibold text-slate-600">Tasa Manual (Bs):</label>
        <input 
          type="text" 
          value={manualRate}
          onChange={(e) => setManualRate(e.target.value)}
          placeholder="Ej: 36.65"
          className="border border-slate-300 rounded px-2 py-1.5 text-sm w-24 outline-none focus:border-blue-500"
        />
      </div>
      
      <button
        onClick={handleSave}
        disabled={isSaving}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-white transition-colors ${
          isSaving ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'
        }`}
      >
        <Save className="w-4 h-4" />
        Fijar Tasa
      </button>

      <button
        onClick={handleClear}
        disabled={isSaving}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-slate-700 bg-slate-200 transition-colors hover:bg-slate-300`}
        title="Restaurar a Tasa BCV Oficial Automática"
      >
        <RefreshCw className="w-4 h-4" />
        Automático
      </button>
    </div>
  );
}
