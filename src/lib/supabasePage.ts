/** PostgREST recorta cada consulta a 1000 filas aunque pongas .limit(2000). */

const PAGE = 1000;
const MAX_ROWS = 50_000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};

function rowId(row: unknown): string | null {
  if (row && typeof row === "object" && "id" in row) {
    const id = (row as { id?: unknown }).id;
    return typeof id === "string" || typeof id === "number" ? String(id) : null;
  }
  return null;
}

/**
 * Trae todas las filas, página a página, sin pisar ni omitir ids.
 * Si una página falla, reintenta una vez y conserva lo ya cargado.
 */
export async function fetchAllPages<T>(
  run: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const byId = new Map<string, T>();
  const noId: T[] = [];
  let expected: number | null = null;
  let lastError: { message: string } | null = null;

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let chunk: T[] = [];
    let error: { message: string } | null = null;
    let count: number | null | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await run(from, from + PAGE - 1);
      error = res.error;
      count = res.count;
      chunk = res.data ?? [];
      if (!error) break;
    }

    if (typeof count === "number" && count >= 0) expected = count;

    if (error) {
      lastError = error;
      break;
    }

    for (const row of chunk) {
      const id = rowId(row);
      if (id) byId.set(id, row);
      else noId.push(row);
    }

    if (chunk.length < PAGE) break;
    if (expected != null && byId.size + noId.length >= expected) break;
  }

  const data = [...byId.values(), ...noId];
  if (expected != null && data.length < expected && !lastError) {
    lastError = {
      message: `Se cargaron ${data.length} de ${expected} filas. Recarga la app.`,
    };
  }
  return { data, error: lastError };
}
