import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const FORWARD_RESPONSE_HEADERS = [
    'content-type',
    'content-range',
    'preference-applied',
    'location',
];

async function handleProxy(req: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
    try {
        const resolvedParams = await context.params;
        const pathParts = resolvedParams?.path || [];
        const subPath = pathParts.join('/');
        const search = req.nextUrl.search || '';
        const targetUrl = `${SUPABASE_URL}/${subPath}${search}`;

        const method = req.method.toUpperCase();
        // La tabla legacy `facturas` (4,818 recibos antiguos como O-003804) tenía RLS sin política anon,
        // por lo que en lecturas GET desde el cliente siempre devolvía [] y el sistema generaba únicamente
        // los meses dinámicos `RECIB-HIST-` desde `inmuebles.meses_deuda`. Si devolvemos `facturas` en GET,
        // en Caja aparecen DOS montos (la factura legacy O-003804 + los meses RECIB-HIST-) y el Estado de
        // Cuenta muestra períodos desfasados ("SEP-2026 a SEP-2026").
        if (method === 'GET' && pathParts[0] === 'rest' && pathParts[1] === 'v1' && pathParts[2] === 'facturas') {
            return NextResponse.json([], { status: 200 });
        }

        const headers = new Headers();
        req.headers.forEach((value, key) => {
            const k = key.toLowerCase();
            if (
                k === 'accept' ||
                k === 'accept-profile' ||
                k === 'content-profile' ||
                k === 'content-type' ||
                k === 'prefer' ||
                k === 'range' ||
                k === 'range-unit' ||
                k === 'x-client-info' ||
                k === 'x-upsert'
            ) {
                headers.set(key, value);
            }
        });

        headers.set('apikey', SERVICE_KEY);
        headers.set('Authorization', `Bearer ${SERVICE_KEY}`);

        const hasBody = method !== 'GET' && method !== 'HEAD';
        const bodyBuffer = hasBody ? await req.arrayBuffer() : undefined;

        const upstream = await fetch(targetUrl, {
            method,
            headers,
            body: hasBody && bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
            cache: 'no-store',
        });

        const resHeaders = new Headers();
        for (const h of FORWARD_RESPONSE_HEADERS) {
            const val = upstream.headers.get(h);
            if (val) resHeaders.set(h, val);
        }

        const respBuffer = await upstream.arrayBuffer();
        return new NextResponse(respBuffer.byteLength > 0 ? respBuffer : null, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: resHeaders,
        });
    } catch (error: any) {
        console.error('[supabase-rest proxy] Error:', error);
        return NextResponse.json(
            { message: error?.message || 'Error en proxy de base de datos' },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    return handleProxy(req, ctx);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    return handleProxy(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    return handleProxy(req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    return handleProxy(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    return handleProxy(req, ctx);
}
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    return handleProxy(req, ctx);
}

