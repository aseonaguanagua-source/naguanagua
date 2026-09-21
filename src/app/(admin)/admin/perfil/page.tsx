'use client';
import React, { useState } from 'react';
import { User, Lock, Save, CheckCircle, AlertCircle } from 'lucide-react';

export default function PerfilPage() {
  const [profileSuccess, setProfileSuccess] = useState(false);
  
  // Passwords
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError('Debe ingresar su clave actual.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('La nueva clave debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las nuevas claves no coinciden.');
      return;
    }

    // Success
    setPasswordSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto p-6">
      <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
        <User className="w-5 h-5 text-slate-700" />
        <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
          Mi Perfil
        </h1>
      </div>

      <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
          <User className="w-4 h-4 text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Datos del Contribuyente</h2>
        </div>
        
        <form onSubmit={handleProfileSave} className="p-4 space-y-4">
          {profileSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative flex items-center gap-2 text-sm" role="alert">
              <CheckCircle className="w-4 h-4" />
              <span>Perfil actualizado correctamente en la sesión actual.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Código Usuario</label>
              <input type="text" defaultValue="E-000006" disabled className="w-full border border-slate-300 bg-slate-100 rounded px-3 py-2 text-sm text-slate-500 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nombre o Razón Social</label>
              <input type="text" defaultValue="Merly Medina" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo Identidad</label>
              <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500">
                <option>Empleados</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nro. Identidad</label>
              <input type="text" defaultValue="20131386" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono Móvil</label>
              <input type="text" defaultValue="04120374884" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" defaultValue="merlymedina91@gmail.com" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" required />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
            <input type="text" placeholder="Dirección" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="bg-emerald-500 text-white hover:bg-emerald-600 px-6 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
              <Save className="w-4 h-4" /> Actualizar datos
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden mt-6">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Cambiar Clave</h2>
        </div>
        
        <form onSubmit={handlePasswordChange} className="p-4 space-y-4">
          {passwordSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative flex items-center gap-2 text-sm" role="alert">
              <CheckCircle className="w-4 h-4" />
              <span>La clave de seguridad ha sido cambiada de forma exitosa.</span>
            </div>
          )}

          {passwordError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative flex items-center gap-2 text-sm" role="alert">
              <AlertCircle className="w-4 h-4" />
              <span>{passwordError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Clave Actual *</label>
              <input 
                type="password" 
                placeholder="Clave Actual" 
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nueva Clave *</label>
              <input 
                type="password" 
                placeholder="Nueva Clave" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Confirmar *</label>
              <input 
                type="password" 
                placeholder="Confirmar" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="bg-slate-800 text-white hover:bg-slate-700 px-6 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
              <Lock className="w-4 h-4" /> Cambiar Clave
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
