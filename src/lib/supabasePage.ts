/** PostgREST recorta cada consulta a 1000 filas aunque pongas .limit(2000). */

const PAGE = 1000;
const MAX_ROWS = 20_000;

export async function fetchAllPages<T>(
  run: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) return { data: rows, error };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return { data: rows, error: null };
}
