'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Upload, Camera, FileText, X, RefreshCw, CheckCircle2, Trash2, Image as ImageIcon } from 'lucide-react';

interface ComprobantePickerWithCameraProps {
  file: File | null;
  onSelectFile: (file: File | null) => void;
  compressImage?: (file: File) => Promise<File>;
  label?: string;
  required?: boolean;
}

export default function ComprobantePickerWithCamera({
  file,
  onSelectFile,
  compressImage,
  label = 'Comprobante de Transferencia',
  required = true,
}: ComprobantePickerWithCameraProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const handleFilePicked = async (picked: File | undefined | null) => {
    if (!picked) return;
    if (compressImage && picked.type.startsWith('image/')) {
      try {
        const compressed = await compressImage(picked);
        onSelectFile(compressed);
        return;
      } catch {}
    }
    onSelectFile(picked);
  };

  const startLiveCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setIsStartingCamera(true);
    stopCameraStream();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsStartingCamera(false);
      // Fallback directo a la cámara nativa del teléfono si el navegador/WebView no expone getUserMedia
      nativeCameraInputRef.current?.click();
      return;
    }

    try {
      setShowCameraModal(true);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1600 },
            height: { ideal: 1200 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('No se pudo abrir cámara en vivo, usando selector de cámara nativo:', err);
      setCameraError(
        'No se pudo acceder al visor en vivo. Pulsa "Abrir Cámara del Dispositivo" abajo para tomar la foto.'
      );
    } finally {
      setIsStartingCamera(false);
    }
  };

  const closeCameraModal = () => {
    stopCameraStream();
    setShowCameraModal(false);
    setCameraError(null);
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startLiveCamera(nextMode);
  };

  const capturePhotoFromVideo = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    const MAX_DIM = 1600;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const capturedFile = new File([blob], `comprobante_camara_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        await handleFilePicked(capturedFile);
        closeCameraModal();
      },
      'image/jpeg',
      0.85
    );
  };

  return (
    <div>
      {label && (
        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Inputs ocultos para Subir Archivo y Cámara Nativa */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        className="hidden"
        onChange={async (e) => {
          const picked = e.target.files?.[0];
          if (picked) await handleFilePicked(picked);
          e.target.value = '';
        }}
      />

      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const picked = e.target.files?.[0];
          if (picked) {
            await handleFilePicked(picked);
            closeCameraModal();
          }
          e.target.value = '';
        }}
      />

      {/* Dos Botones de Opciones: Subir Comprobante O Usar Cámara */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-3.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
            file
              ? 'border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50'
              : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-emerald-400'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1.5">
            <Upload className="w-4 h-4" />
          </div>
          <span className="text-xs font-extrabold text-slate-800">Subir Comprobante</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Galería, Imagen o PDF</span>
        </button>

        <button
          type="button"
          onClick={() => startLiveCamera('environment')}
          className={`border-2 border-dashed rounded-xl p-3.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
            file
              ? 'border-sky-300 bg-sky-50/40 hover:bg-sky-50'
              : 'border-slate-300 bg-slate-50 hover:bg-sky-50 hover:border-sky-400'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center mb-1.5">
            <Camera className="w-4 h-4" />
          </div>
          <span className="text-xs font-extrabold text-slate-800">Usar Cámara</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Tomar foto al instante</span>
        </button>
      </div>

      {/* Vista previa del comprobante cargado o fotografiado */}
      {file && (
        <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Vista previa comprobante"
                className="w-11 h-11 rounded-lg object-cover border border-emerald-300 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs font-extrabold text-emerald-900 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span className="truncate">{file.name}</span>
              </div>
              <p className="text-[10px] text-emerald-700 font-medium">
                {(file.size / 1024).toFixed(0)} KB · Listo para enviar
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectFile(null)}
            title="Quitar comprobante"
            className="p-1.5 rounded-lg text-red-600 hover:bg-red-100 transition-colors flex-shrink-0 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal de Cámara en Vivo */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-extrabold text-sm">
                <Camera className="w-4 h-4 text-lime-400" />
                <span>Fotografiar Comprobante de Pago</span>
              </div>
              <button
                type="button"
                onClick={closeCameraModal}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative bg-black aspect-[3/4] max-h-[60vh] w-full flex items-center justify-center overflow-hidden">
              {!cameraError ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  {/* Marco guía para encuadrar el comprobante */}
                  <div className="absolute inset-5 border-2 border-dashed border-lime-400/70 rounded-xl pointer-events-none flex items-end justify-center pb-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-950/75 text-[10px] font-bold text-lime-300">
                      Encuadre el comprobante de forma legible
                    </span>
                  </div>
                </>
              ) : (
                <div className="p-6 text-center space-y-3">
                  <Camera className="w-10 h-10 text-amber-400 mx-auto" />
                  <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                </div>
              )}

              {isStartingCamera && (
                <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-2 text-white text-xs font-bold">
                  <RefreshCw className="w-6 h-6 animate-spin text-lime-400" />
                  Iniciando cámara...
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-900 space-y-2.5">
              {!cameraError && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Girar
                  </button>
                  <button
                    type="button"
                    onClick={capturePhotoFromVideo}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-lime-400 to-emerald-500 hover:from-lime-500 hover:to-emerald-600 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Capturar Foto Ahora
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Abrir Cámara Nativa del Teléfono
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
