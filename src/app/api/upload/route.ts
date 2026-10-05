import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as string) || 'documentos';
    const customPath = formData.get('path') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No se envió ningún archivo.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileNameClean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = customPath || `uploads/${Date.now()}_${fileNameClean}`;

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (error) {
      console.warn('Supabase Storage error, usando fallback base64 Data URL:', error.message);
      const mime = file.type || 'application/octet-stream';
      const b64 = buffer.toString('base64');
      return NextResponse.json({
        success: true,
        path,
        publicUrl: `data:${mime};base64,${b64}`,
      });
    }

    const { data: pubData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);

    return NextResponse.json({
      success: true,
      path,
      publicUrl: pubData?.publicUrl || '',
    });
  } catch (err: any) {
    console.error('Error en /api/upload:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
