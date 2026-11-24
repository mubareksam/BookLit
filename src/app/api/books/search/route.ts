import { NextRequest, NextResponse } from 'next/server';
import { searchCatalog } from '@/lib/domain/catalog';
import { BookGenre } from '@/lib/types';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') ?? '';
  const genre = (req.nextUrl.searchParams.get('genre') ?? 'all') as BookGenre | 'all';
  const results = searchCatalog(query, genre);
  return NextResponse.json({ results });
}
