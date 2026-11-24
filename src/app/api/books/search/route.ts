import { NextRequest, NextResponse } from 'next/server';
import { CatalogBookSeed, searchCatalog } from '@/lib/domain/catalog';
import { BookGenre } from '@/lib/types';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') ?? '';
  const genre = (req.nextUrl.searchParams.get('genre') ?? 'all') as BookGenre | 'all';

  const localResults = searchCatalog(query, genre);

  // Also query live Open Library API on deployed instances when query has >= 3 chars
  if (query.trim().length >= 3) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const olRes = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(
          query.trim()
        )}&limit=8&fields=key,title,author_name,isbn,number_of_pages_median,subject`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (olRes.ok) {
        const olData = (await olRes.json()) as {
          docs?: {
            key?: string;
            title?: string;
            author_name?: string[];
            isbn?: string[];
            number_of_pages_median?: number;
            subject?: string[];
          }[];
        };

        const remoteMapped: CatalogBookSeed[] = (olData.docs ?? [])
          .filter((d) => d.title)
          .map((doc, idx) => {
            const pages = Math.max(40, Math.min(2000, doc.number_of_pages_median || 280));
            return {
              catalogId: `ol-${doc.key?.replace(/\W+/g, '') || idx}`,
              title: doc.title!,
              author: doc.author_name?.[0] || 'Unknown Author',
              isbn: doc.isbn?.[0] || '',
              genre: [genre !== 'all' ? genre : 'general_nonfiction'],
              subgenre: (doc.subject ?? []).slice(0, 2),
              page_count: pages,
              word_count_estimate: pages * 280,
              difficulty_band: 3,
              cover_color: '#0f766e',
              description: '',
              source: 'OpenLibrary',
              sample_passages: [],
            };
          });

        const seen = new Set(localResults.map((r) => r.title.toLowerCase()));
        const merged = [
          ...localResults,
          ...remoteMapped.filter((r) => !seen.has(r.title.toLowerCase())),
        ];
        return NextResponse.json({ results: merged.slice(0, 14) });
      }
    } catch {
      // Fallback to built-in catalog when offline or sandboxed
    }
  }

  return NextResponse.json({ results: localResults });
}
