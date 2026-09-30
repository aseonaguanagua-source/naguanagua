import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getTasaBCV } from '@/services/bcv';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sync = searchParams.get('sync') === 'true';

  if (sync) {
    // @ts-expect-error - Next.js internal type mismatch
    revalidateTag('bcv-rate');
  }

  const result = await getTasaBCV(sync);

  if (result.success === false) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
