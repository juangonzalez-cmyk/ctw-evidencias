/** Bases CS de Colombia Tech Week (mismas del Dashboard Seguimiento). */
export const NOTION_DATABASES = {
  crm: "ef338899-bfe1-450d-bd2c-96a8228cb054",
  lab: "c46217e9-0d5e-4d9a-9d4f-8c50aff644c6",
  followup: "53f452ee-2ccc-4a6f-afa4-fcb8b39a281e",
} as const;

export const NOTION_FIELDS = {
  crm: {
    title: "Sponsor",
    owner: "Owner CS",
    event: "Evento",
  },
  lab: {
    title: "Beneficio",
    status: "Estado",
    sponsor: "Sponsor (CRM)",
    type: "Tipo de Beneficio",
    category: "Categoria beneficio",
    modality: "Modalidad",
  },
  followup: {
    title: "Acción",
    deadline: "Deadline",
    benefit: "Beneficio LAB",
  },
} as const;

type NotionPage = {
  id: string;
  url?: string | null;
  properties: Record<string, unknown>;
};

type RichText = { plain_text?: string }[];

function plainText(items: RichText | undefined): string {
  return (items ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function propOf(page: NotionPage, name: string): Record<string, unknown> | null {
  const p = page.properties?.[name];
  if (!p || typeof p !== "object") return null;
  return p as Record<string, unknown>;
}

function getTitle(page: NotionPage, name: string): string {
  const p = propOf(page, name);
  if (!p) return "";
  if (p.type === "title") return plainText(p.title as RichText);
  if (p.type === "rich_text") return plainText(p.rich_text as RichText);
  return "";
}

function getSelect(page: NotionPage, name: string): string | null {
  const p = propOf(page, name);
  if (!p) return null;
  if (p.type === "status") {
    return ((p.status as { name?: string } | null)?.name ?? null) as string | null;
  }
  if (p.type === "select") {
    return ((p.select as { name?: string } | null)?.name ?? null) as string | null;
  }
  return null;
}

function getPeopleNames(page: NotionPage, name: string): string[] {
  const p = propOf(page, name);
  if (!p || p.type !== "people") return [];
  return ((p.people as { name?: string }[]) ?? [])
    .map((u) => u.name?.trim() || "")
    .filter(Boolean);
}

function getRelationIds(page: NotionPage, name: string): string[] {
  const p = propOf(page, name);
  if (!p || p.type !== "relation") return [];
  return ((p.relation as { id: string }[]) ?? []).map((r) => r.id);
}

function getDateStart(page: NotionPage, name: string): string | null {
  const p = propOf(page, name);
  if (!p || p.type !== "date") return null;
  const d = p.date as { start?: string | null } | null;
  return d?.start ?? null;
}

function splitDateTime(iso: string | null): { dia: string | null; hora: string | null } {
  if (!iso) return { dia: null, hora: null };
  // Notion date can be "2026-08-13" or "2026-08-13T15:30:00.000-05:00"
  const [datePart, timePart] = iso.split("T");
  let hora: string | null = null;
  if (timePart) {
    const hm = timePart.slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(hm) && hm !== "00:00") hora = hm;
  }
  // Etiqueta legible en es-CO
  try {
    const label = new Date(datePart + "T12:00:00").toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
    });
    return { dia: `${datePart} · ${label}`, hora };
  } catch {
    return { dia: datePart, hora };
  }
}

async function notionProxy(
  token: string,
  path: string,
  method = "GET",
  body?: unknown
) {
  const res = await fetch("/api/notion/proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Notion-Token": token,
    },
    body: JSON.stringify({ path, method, body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { message?: string; error?: string }).message ||
      (data as { error?: string }).error ||
      `Notion HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function resolveDataSourceId(token: string, databaseId: string): Promise<string> {
  const db = await notionProxy(token, `/databases/${databaseId}`);
  const ds = (db as { data_sources?: { id: string }[] }).data_sources?.[0]?.id;
  if (!ds) {
    // Fallback: API antigua — usar el mismo id como database query
    return databaseId;
  }
  return ds;
}

async function queryAll(
  token: string,
  dataSourceOrDbId: string,
  useDataSource: boolean
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const path = useDataSource
      ? `/data_sources/${dataSourceOrDbId}/query`
      : `/databases/${dataSourceOrDbId}/query`;
    const res = (await notionProxy(token, path, "POST", {
      start_cursor: cursor,
      page_size: 100,
    })) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    for (const row of res.results ?? []) {
      if (row && "properties" in row) pages.push(row);
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return pages;
}

async function fetchDatabasePages(token: string, databaseId: string): Promise<NotionPage[]> {
  try {
    const ds = await resolveDataSourceId(token, databaseId);
    if (ds !== databaseId) {
      return await queryAll(token, ds, true);
    }
  } catch {
    // fallback below
  }
  return queryAll(token, databaseId, false);
}

export type NotionImportPreview = {
  sponsors: { id: string; name: string; owner: string; event: string | null }[];
  benefits: {
    id: string;
    name: string;
    type: string | null;
    category: string | null;
    modality: string | null;
    status: string | null;
    sponsorId: string | null;
    sponsorName: string;
    owner: string;
    dia: string | null;
    hora: string | null;
  }[];
  eventOptions: string[];
};

export async function previewNotionImport(
  token: string,
  opts?: { eventFilter?: string | null }
): Promise<NotionImportPreview> {
  const [crm, lab, followup] = await Promise.all([
    fetchDatabasePages(token, NOTION_DATABASES.crm),
    fetchDatabasePages(token, NOTION_DATABASES.lab),
    fetchDatabasePages(token, NOTION_DATABASES.followup).catch(() => [] as NotionPage[]),
  ]);

  // Earliest deadline per Lab benefit id
  const deadlineByBenefit = new Map<string, string>();
  for (const fu of followup) {
    const benefitIds = getRelationIds(fu, NOTION_FIELDS.followup.benefit);
    const deadline = getDateStart(fu, NOTION_FIELDS.followup.deadline);
    if (!deadline) continue;
    for (const bid of benefitIds) {
      const prev = deadlineByBenefit.get(bid);
      if (!prev || deadline < prev) deadlineByBenefit.set(bid, deadline);
    }
  }

  let sponsors = crm.map((p) => ({
    id: p.id,
    name: getTitle(p, NOTION_FIELDS.crm.title) || "Sin nombre",
    owner: getPeopleNames(p, NOTION_FIELDS.crm.owner)[0] || "Sin asignar",
    event: getSelect(p, NOTION_FIELDS.crm.event),
  }));

  const eventOptions = Array.from(
    new Set(sponsors.map((s) => s.event).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b, "es"));

  if (opts?.eventFilter) {
    const f = opts.eventFilter.toLowerCase();
    sponsors = sponsors.filter((s) => (s.event || "").toLowerCase() === f);
  }

  const sponsorMap = new Map(sponsors.map((s) => [s.id, s]));
  const allowedIds = new Set(sponsors.map((s) => s.id));

  const benefits = lab
    .map((p) => {
      const sponsorIds = getRelationIds(p, NOTION_FIELDS.lab.sponsor);
      const sponsorId = sponsorIds.find((id) => allowedIds.has(id)) || sponsorIds[0] || null;
      const sponsor = sponsorId ? sponsorMap.get(sponsorId) : undefined;
      if (opts?.eventFilter && sponsorId && !allowedIds.has(sponsorId)) {
        return null;
      }
      if (opts?.eventFilter && !sponsor) return null;
      const { dia, hora } = splitDateTime(deadlineByBenefit.get(p.id) || null);
      return {
        id: p.id,
        name: getTitle(p, NOTION_FIELDS.lab.title) || "Beneficio",
        type: getSelect(p, NOTION_FIELDS.lab.type),
        category: getSelect(p, NOTION_FIELDS.lab.category),
        modality: getSelect(p, NOTION_FIELDS.lab.modality),
        status: getSelect(p, NOTION_FIELDS.lab.status),
        sponsorId,
        sponsorName: sponsor?.name || "Sin sponsor",
        owner: sponsor?.owner || "Sin asignar",
        dia,
        hora,
      };
    })
    .filter(Boolean) as NotionImportPreview["benefits"];

  return { sponsors, benefits, eventOptions };
}

export type SeedTaskFromNotion = {
  event_id: string;
  marca: string;
  tipo_beneficio: string;
  category: string | null;
  responsable: string;
  notion_page_id: string;
  fase: string;
  status: string;
  media_type: string;
  is_timed: boolean;
  dia: string | null;
  hora: string | null;
};

export function benefitsToTasks(
  eventId: string,
  benefits: NotionImportPreview["benefits"]
): SeedTaskFromNotion[] {
  return benefits.map((b) => {
    const modality = (b.modality || "").toLowerCase();
    let fase = "durante_evento";
    if (modality.includes("pre")) fase = "pre_evento";
    if (modality.includes("post")) fase = "post_evento";

    return {
      event_id: eventId,
      marca: b.sponsorName,
      tipo_beneficio: b.type ? `${b.type}: ${b.name}` : b.name,
      category: b.category,
      responsable: b.owner,
      notion_page_id: b.id,
      fase,
      status: "pendiente",
      media_type: "photo",
      is_timed: !!(b.dia || b.hora),
      dia: b.dia,
      hora: b.hora,
    };
  });
}
