import type { Paginated } from './types';

export async function collectPaginated<T>(
  fetchPage: (offset: number, limit: number) => Promise<Paginated<T>>,
  pageSize = 100,
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;

  for (;;) {
    const page = await fetchPage(offset, pageSize);
    if (page.offset !== offset) {
      throw new Error(
        `Pagination returned offset ${page.offset}; expected ${offset}`,
      );
    }
    results.push(...page.data);
    if (!page.hasMore) return results;
    if (page.data.length === 0) {
      throw new Error('Pagination did not advance');
    }
    offset += page.data.length;
  }
}

export async function collectNumberedPages<T>(
  fetchPage: (page: number, perPage: number) => Promise<T[]>,
  pageSize = 100,
  maxPages = 1_000,
): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchPage(page, pageSize);
    results.push(...batch);
    if (batch.length < pageSize) return results;
  }
  throw new Error(`Pagination exceeded ${maxPages} pages`);
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
