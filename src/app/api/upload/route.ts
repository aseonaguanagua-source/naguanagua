import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB máximo
const MAX_BASE64_FALLBACK_BYTES = 2 * 1024 * 1024; // 2 MB máximo para fallback Data URL
const ALLOWED_BUCKETS = new Set(['documentos', 'comprobantes', 'retenciones', 'reclamos', 'public']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawBucket = (formData.get('bucket') as string) || 'documentos';
    const rawFolder = (formData.get('folder') as string | null) || 'uploads';
    const customPath = formData.get('path') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No se envió ningún archivo.' },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'El archivo excede el tamaño máximo permitido (10 MB).' },
        { status: 413 }
      );
    }

    const mime = (file.type || '').toLowerCase();
    const extMatch = file.name.toLowerCase().match(/\.(pdf|jpg|jpeg|png|webp)$/);
    if (!ALLOWED_MIME_TYPES.has(mime) && !extMatch) {
      return NextResponse.json(
        { success: false, error: 'Tipo de archivo no permitido. Solo se aceptan PDF, JPG, PNG o WEBP.' },
        { status: 400 }
      );
    }

    const bucket = ALLOWED_BUCKETS.has(rawBucket) ? rawBucket : 'documentos';
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileNameClean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Sanitizar customPath y folder contra Path Traversal (..)
    const safeFolder = rawFolder.replace(/\.\.+/g, '').replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9/_-]/g, '_') || 'uploads';
    const safeCustomPath = customPath
      ? customPath.replace(/\.\.+/g, '').replace(/^\/+/, '').replace(/[^a-zA-Z0-9/_.-]/g, '_')
      : null;
    const uploadPath = safeCustomPath || `${safeFolder}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${fileNameClean}`;

    const contentType = ALLOWED_MIME_TYPES.has(mime) ? mime : (extMatch?.[1] === 'pdf' ? 'application/pdf' : 'image/jpeg');

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(uploadPath, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      if (file.size > MAX_BASE64_FALLBACK_BYTES) {
        return NextResponse.json(
          { success: false, error: `Error almacenando archivo (${error.message}) y supera el límite para respaldo local.` },
          { status: 500 }
        );
      }
      console.warn('Supabase Storage error, usando fallback base64 Data URL:', error.message);
      const b64 = buffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${b64}`;
      return NextResponse.json({
        success: true,
        path: uploadPath,
        publicUrl: dataUrl,
        url: dataUrl,
        fileUrl: dataUrl,
      });
    }

    const { data: pubData } = supabaseAdmin.storage.from(bucket).getPublicUrl(uploadPath);
    const publicUrl = pubData?.publicUrl || '';

    return NextResponse.json({
      success: true,
      path: uploadPath,
      publicUrl,
      url: publicUrl,
      fileUrl: publicUrl,
    });
  } catch (err: any) {
    console.error('Error en /api/upload:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
