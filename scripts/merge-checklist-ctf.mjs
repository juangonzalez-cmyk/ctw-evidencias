/**
 * Merge Checklists_CTF_CTW_2026.xlsx → tasks (sin borrar evidencias).
 *
 * Uso:
 *   node scripts/merge-checklist-ctf.mjs --dry-run
 *   node scripts/merge-checklist-ctf.mjs --apply
 *
 * - Alinea nombres de perfiles al Excel
 * - Renombra Juan González → Juan Camilo González en tasks
 * - TIMED/CTW/FLEX: matchea contratos Notion o crea checklist de captura
 * - Sponsors de experiencias (sin stand) se tratan igual: quedan con responsable y PDF
 */
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// load .env
for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const EXCEL =
  process.env.CHECKLIST_XLSX ||
  "/Users/juancamilogonzalezg/Downloads/Checklists_CTF_CTW_2026.xlsx";

const EVENT_ID = "f16f297f-ba4e-459f-826d-3a7352c24ec5";

const SHEETS = {
  "Juanita B.": "Juanita Buitrago",
  "Valentina G.": "Valentina Garcés",
  "Paola G.": "Paola Giraldo",
  "Daniela S.": "Daniela Serrano",
  "Manuela G.": "Manuela García",
  "Juan C.": "Juan Camilo González",
};

/** Canonical brand names (Lovable MD). */
const CANONICAL = {
  addi: "Addi",
  "aci worldwide": "ACI WORLDWIDE COLOMBIA",
  "aci worldwide colombia": "ACI WORLDWIDE COLOMBIA",
  aci: "ACI WORLDWIDE COLOMBIA",
  bacu: "Bacu",
  buk: "Buk",
  colsubsidio: "Colsubsidio",
  computrabajo: "Computrabajo",
  "conexa ai": "Conexa ai",
  davivienda: "Davivienda",
  "due legal": "DUE LEGAL",
  "ea sports": "EA Sports",
  envia: "Envía",
  envía: "Envía",
  "growth rockstar": "Growth Rockstar",
  indriver: "Indriver",
  jelou: "Jelou",
  lavalentina: "LaValentina",
  "la valentina": "LaValentina",
  "lemon cash": "Lemon Cash",
  littio: "Littio",
  loreal: "Loreal",
  "l'oréal": "Loreal",
  "mitu growth": "MITU Growth",
  mitu: "MITU Growth",
  nesst: "NESsT",
  oracle: "Oracle",
  phylo: "Phylo",
  scotiatech: "ScotiaTech",
  siigo: "Siigo",
  smartfit: "SmartFit",
  "wenia & wompi": "Wenia & Wompi",
  "wenia/wompi": "Wenia & Wompi",
  wenia: "Wenia & Wompi",
  wompi: "Wenia & Wompi",
  wolkvox: "Wolkvox",
  cineco: "Cineco",
  cinecolombia: "Cineco",
  zebra: "ZEBRA",
  converzzo: "Converzzo",
  sandler: "Sandler",
  copu: "Copu",
  bodytech: "Bodytech",
  binance: "Binance",
  deel: "Deel",
  slash: "SLASH",
  alegra: "Alegra",
  startti: "Startti",
  treble: "Treble",
  hapi: "Hapi",
  numundo: "Numundo",
  claro: "Claro",
  semana: "Semana",
  uber: "Uber",
  colfondos: "Colfondos",
  netsoft: "Netsoft",
  kiggu: "Kiggu",
  snowflake: "Snowflake",
  incode: "INCODE",
  "pc mac": "PC MAC",
  pixis: "Pixis",
  clevertap: "CleverTap",
  druo: "DRUO",
  visa: "Visa Mono",
  mono: "Visa Mono",
  "visa/mono": "Visa Mono",
  colcapital: "Colcapital",
  bancoldex: "Bancoldex",
  procolombia: "Procolombia",
  technoserve: "TechnoServe",
  ean: "EAN",
  "fund.bolívar": "Fund.Bolívar",
  "fund bolivar": "Fund.Bolívar",
  innpactia: "Innpactia",
  puntored: "Puntored",
  wagon: "Wagon",
  reap: "Reap",
  smartkeep: "Smartkeep",
  qvision: "Qvision",
  efecty: "EFECTY",
  coursera: "Coursera",
  lab10: "Lab10",
  "30x": "30x",
  alcaldía: "Alcaldía",
  alcaldia: "Alcaldía",
  wework: "WeWork",
  lucidbot: "Lucidbot",
  kapital: "Kapital",
  "fitlo": "Fitlo",
};

function canon(raw) {
  const k = (raw || "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const k2 = (raw || "").trim().toLowerCase();
  return CANONICAL[k2] || CANONICAL[k] || (raw || "").trim();
}

function parseHora(horaRaw) {
  const s = String(horaRaw || "").trim();
  if (!s || s === "–" || s === "-" || /confirmar|por conf|pendiente/i.test(s)) {
    return { hora: null, horaFin: null, isTimed: false };
  }
  const m = s.match(/(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})/);
  if (m) return { hora: m[1], horaFin: m[2], isTimed: true };
  const m2 = s.match(/^(\d{1,2}:\d{2})$/);
  if (m2) return { hora: m2[1], horaFin: null, isTimed: true };
  return { hora: null, horaFin: null, isTimed: false };
}

function mapDia(diaRaw) {
  const s = String(diaRaw || "").trim();
  if (!s || /por conf/i.test(s)) return null;
  if (/ambos/i.test(s)) return "Ambos días";
  if (/lun\s*10/i.test(s)) return "Lun 10 agosto";
  if (/mar\s*11/i.test(s)) return "Mar 11 agosto";
  if (/mi[eé]\s*12/i.test(s)) return "Mié 12 agosto";
  if (/jue\s*13/i.test(s)) return "Jue 13 agosto";
  if (/vie\s*14/i.test(s)) return "Vie 14 agosto";
  return s;
}

function extractBrandsFromDesc(desc, tipoCheck) {
  const d = desc || "";

  // Menciones MC
  let m = d.match(/Menciones?\s+MC\s+(.+?)(?:\s*[×x]|\s*—|\s*·|\s*$)/i);
  if (m) return splitBrands(m[1]);

  // Speaking / Workshop: "Speaking Origen — Addi · Speaker"
  m = d.match(/Speaking\s+(Origen|Ra[ií]z)\s*[—\-–]\s*(.+?)(?:\s*·|\s*$)/i);
  if (m) return splitBrands(m[2]);
  m = d.match(/Workshop\s*[—\-–]\s*(.+?)(?:\s*·|\s*$)/i);
  if (m) return splitBrands(m[1]);

  // CTW · Title — Brands · venue · foto…
  m = d.match(/^CTW\s*·\s*(.+)$/i);
  if (m) {
    // Prefer brands after em-dash: "Welcoming Cocktail — Kiggu · Casa…"
    const dash = m[1].match(/\s*[—\-–]\s*([^·]+)/);
    if (dash) {
      const brands = splitBrands(dash[1]);
      if (brands.length) return brands;
    }
    const segments = m[1]
      .split(/\s*·\s*/)
      .map((s) => s.trim())
      .filter((s) => s && !/^foto:/i.test(s));
    const title = (segments[0] || "")
      .replace(/\s*[—\-–].*$/, "")
      .replace(
        /^(Welcoming Cocktail|Opening Party|Lunch|Fintech Cocktail|Founders Padel|Forbes Connect|Women Tech Brunch|VIP Lunch|CMOs Brunch|VC Strategic Meetings|LPs & VCs Sunset|Impact House|Closing Party)\s*/i,
        ""
      )
      .trim();
    const fromTitle = splitBrands(title);
    if (fromTitle.length) return fromTitle;
  }

  // Stand X
  m = d.match(/Stand\s+(?:\/\s*activaci[oó]n\s+)?(.+?)(?:\s+\d|\s*\+|$)/i);
  if (m && tipoCheck === "FLEX") {
    const brandPart = m[1].replace(/\s+\d+[x×]\d+.*$/i, "").trim();
    return splitBrands(brandPart);
  }
  // Addi naming / Bacu punto
  if (/^Addi\b/i.test(d)) return ["Addi"];
  if (/^Bacu\b/i.test(d)) return ["Bacu"];
  if (/^Kapital\b/i.test(d)) return ["Kapital"];
  if (/Lab10/i.test(d)) return ["Lab10"];
  if (/\b30x\b/i.test(d) && /stage|skill|tarima|sal[oó]n/i.test(d)) return ["30x"];
  if (/Sandler/i.test(d) && /Sales Arena/i.test(d)) return ["Sandler"];
  // Escarapelas / Camisetas / Tótems / Backing lists
  m = d.match(/(?:Escarapelas|Camisetas[^:]*|T[oó]tems|Backing[^:]*):\s*(.+)$/i);
  if (m) return splitBrands(m[1]);
  // Pórtico naming list
  m = d.match(/naming:\s*(.+)$/i);
  if (m) return splitBrands(m[1]);
  // Fallback: after em-dash
  m = d.match(/[—\-–]\s*([A-Za-zÁÉÍÓÚÑ0-9][^·]+)/);
  if (m) return splitBrands(m[1].split("·")[0]);
  return [];
}

function splitBrands(raw) {
  const junk =
    /^(foto|ambas|marcas|registro|activaciones|hora|pendiente|mc|con|logo|visible|espacio|pend[oó]n|cosechas|casa|rep[uú]blica|sinergia|padel|drop|rest\.?|ideal|material|impreso|speaker|bienvenida|pantalla|hi|j-8|sc|tarjetas|mesas|general|todos|los|logos|al|abrir|cada|d[ií]a|est[aá]tica|del|brandeado|en|cmos|brunch)$/i;
  return [
    ...new Set(
      String(raw || "")
        .split(/\s*(?:\+|\/|&|·|,|\by\b)\s*/i)
        .map((s) =>
          s
            .replace(/^[\s—\-–]+/, "")
            .replace(/\s+\d+[x×]\d+.*$/i, "")
            .replace(/\s*\(.*$/, "")
            .trim()
        )
        .filter((s) => s && s.length > 1 && s.length < 40 && !junk.test(s) && !/^foto\b/i.test(s))
        .map(canon)
        .filter((s) => s && !/^(hora pendiente|pendiente)$/i.test(s))
    ),
  ];
}

function classifyDesc(desc, tipoCheck) {
  const d = desc || "";
  if (/Speaking\s+Origen/i.test(d)) return { category: "Speaking", stage: "Origen Stage", media_type: "photo", fase: "durante_evento" };
  if (/Speaking\s+Ra[ií]z/i.test(d)) return { category: "Speaking", stage: "Raíz Stage", media_type: "photo", fase: "durante_evento" };
  if (/Workshop/i.test(d)) return { category: "Workshop", stage: null, media_type: "photo", fase: "durante_evento" };
  if (tipoCheck === "CTW" || /^CTW\b/i.test(d)) return { category: "CTW Experiencia", stage: null, media_type: "photo", fase: "pre_evento" };
  // Solo recepción de stand si el Excel describe un stand con tamaño (NxN) o "Stand Marca …"
  // Evita falsos positivos tipo "Juanita cubre si DS en stand" o marcas sin stand real.
  if (
    /\bStand\b/i.test(d) &&
    !/cubre si .+ stand/i.test(d) &&
    (/\d+\s*[x×]\s*\d+/i.test(d) || /^Stand\b/i.test(d.trim()) || /Stand\s*\/\s*activaci/i.test(d))
  ) {
    return { category: "Stands", stage: null, media_type: "photo", fase: "durante_evento", flujo: "stand_recepcion" };
  }
  if (/Loop|P[oó]rtico|Pantalla|sillas|Escarapelas|Camisetas|T[oó]tems|Backing|Stage|Tarima|Lab10|Sales Arena|naming|activaci/i.test(d)) {
    return { category: "Branding", stage: null, media_type: "photo", fase: "durante_evento" };
  }
  return { category: "Checklist captura", stage: null, media_type: "photo", fase: "durante_evento" };
}

function extractSpeaker(desc) {
  const m = String(desc || "").match(/·\s*([^·]+?)(?:\s*·|\s*$)/);
  if (!m) return null;
  const s = m[1].trim();
  if (/foto:|Juanita|cubre|Colombia Tech|Sales Arena|Lab10|COSECHAS|Casa /i.test(s)) return null;
  if (s.length > 80) return null;
  return s;
}

function extractVenue(desc) {
  const m = String(desc || "").match(/·\s*(Colombia Tech Room|Sales Arena|Lab10|Casa República|Casa Sinergia|Padel Drop|Four Seasons|COSECHAS|HI J-8|Rest\.?\s*Ideal)[^·]*/i);
  return m ? m[1].trim() : null;
}

function buildTipoBeneficio(desc, category, brand) {
  const d = desc || "";
  if (/Speaking\s+Origen/i.test(d)) return `Captura: Speaking Origen Stage — ${brand}`;
  if (/Speaking\s+Ra[ií]z/i.test(d)) return `Captura: Speaking Raíz Stage — ${brand}`;
  if (/Workshop/i.test(d)) return `Captura: Workshop — ${brand}`;
  if (/^CTW\b/i.test(d) || category === "CTW Experiencia") {
    const title = d.replace(/^CTW\s*·\s*/i, "").split(/[—\-–]/)[0].trim();
    return `Captura: CTW · ${title} — ${brand}`;
  }
  if (/Stand/i.test(d)) return `Captura: Stand — ${brand}`;
  // keep flex descriptive but scoped to brand when multi
  const short = d.length > 120 ? d.slice(0, 117) + "…" : d;
  return `Captura: ${short}`;
}

function scoreMatch(task, brand, category, desc) {
  const m = canon(task.marca);
  if (m.toLowerCase() !== brand.toLowerCase() && unifyLoose(task.marca) !== unifyLoose(brand)) {
    // allow partial
    if (!m.toLowerCase().includes(brand.toLowerCase()) && !brand.toLowerCase().includes(m.toLowerCase())) {
      return 0;
    }
  }
  const tipo = (task.tipo_beneficio || "").toLowerCase();
  const cat = (task.category || "").toLowerCase();
  let score = 40;
  if (m.toLowerCase() === brand.toLowerCase()) score += 40;

  // Hard gates: checklist category must match the contractual benefit type
  if (category === "Speaking") {
    if (!/speaking|keynote|panel|fireside|pitch/i.test(tipo + " " + cat)) return 0;
    score += 30;
    if (/origen/.test(desc) && /origen/.test(tipo)) score += 15;
    if (/ra[ií]z/.test(desc) && /ra[ií]z|raiz/.test(tipo)) score += 15;
  } else if (category === "Workshop") {
    if (!/workshop/i.test(tipo + " " + cat)) return 0;
    score += 35;
  } else if (category === "Stands") {
    if (!(/stand/.test(tipo) || task.flujo === "stand_recepcion" || /stand/.test(cat))) return 0;
    score += 40;
  } else if (category === "CTW Experiencia") {
    // CTW experiences: only match existing captura/experiencia rows — never logo/BTL/website
    if (!/captura:\s*ctw|ctw experiencia/i.test(tipo + " " + cat)) return 0;
    if (/logo|website|btl|accesos|naming|c[aá]psula|landing|materiales/i.test(tipo)) return 0;
    score += 35;
  } else if (category === "Branding") {
    // FLEX branding can enrich logo/loop/backing rows, but never speaking/workshop/stand
    if (/speaking|workshop|stand\s*\d|captura:\s*ctw/i.test(tipo)) return 0;
    if (!/logo|loop|backing|escarapela|camiseta|t[oó]tem|p[oó]rtico|btl|material|pantalla|arco|naming|sillas|stage|tarima/i.test(tipo)) {
      return 0;
    }
    score += 25;
  } else if (category === "Checklist captura") {
    // generic flex — only weak match on similar wording
    if (/speaking|workshop|stand\s*\d/i.test(tipo)) return 0;
    score += 5;
  }

  return score;
}

function unifyLoose(s) {
  return canon(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

function loadChecklist() {
  const openpyxl = null;
  // use child process python to dump json for reliability
  return null;
}

async function main() {
  const { spawnSync } = await import("child_process");
  const py = `
import openpyxl, json
path = ${JSON.stringify(EXCEL)}
sheets = ${JSON.stringify(SHEETS)}
wb = openpyxl.load_workbook(path, data_only=True)
out = []
for sheet, owner in sheets.items():
    ws = wb[sheet]
    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        if i < 4: continue
        tipo = (row[0] or "").strip() if isinstance(row[0], str) else ""
        if tipo not in ("TIMED", "CTW", "FLEX"): continue
        out.append({
            "owner": owner,
            "sheet": sheet,
            "tipo_check": tipo,
            "dia": str(row[1] or "").strip(),
            "hora": str(row[2] or "").strip() if row[2] is not None else "",
            "desc": str(row[3] or "").strip(),
        })
print(json.dumps(out, ensure_ascii=False))
`;
  const proc = spawnSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (proc.status !== 0) {
    console.error(proc.stderr);
    process.exit(1);
  }
  const checklist = JSON.parse(proc.stdout);

  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

  // ---- load tasks
  let tasks = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("tasks").select("*").eq("event_id", EVENT_ID).range(from, from + 999);
    if (error) throw error;
    tasks = tasks.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  const active = () => tasks.filter((t) => !t.deleted_at);

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    checklistRows: checklist.length,
    profileUpdates: [],
    responsableRenames: [],
    matched: [],
    created: [],
    skipped: [],
    ambiguous: [],
  };

  // ---- profiles align
  const profilePlan = [
    { from: "Juan González", to: "Juan Camilo González", slug: "juan-camilo-gonzalez", role: "KAM · Campo / CS" },
    { from: "Paula Giraldo", to: "Paola Giraldo", slug: "paola-giraldo", role: "Workshops + Branding" },
    { from: "Valentina Garces", to: "Valentina Garcés", slug: "valentina-garces", role: "Raíz Stage" },
  ];
  const { data: profiles } = await sb.from("profiles").select("*").eq("event_id", EVENT_ID);
  for (const p of profilePlan) {
    const row = (profiles || []).find((x) => x.name === p.from);
    if (row) {
      report.profileUpdates.push({ id: row.id, ...p });
      if (APPLY) {
        await sb.from("profiles").update({ name: p.to, slug: p.slug, role: p.role, active: true }).eq("id", row.id);
      }
    }
  }
  // ensure Juanita role label
  const jb = (profiles || []).find((x) => x.name === "Juanita Buitrago");
  if (jb && APPLY) {
    await sb.from("profiles").update({ role: "Origen Stage", active: true }).eq("id", jb.id);
  }
  const ds = (profiles || []).find((x) => x.name === "Daniela Serrano");
  if (ds && APPLY) {
    await sb.from("profiles").update({ role: "KAM · Campo / CS", active: true }).eq("id", ds.id);
  }
  const mg = (profiles || []).find((x) => x.name === "Manuela García");
  if (mg && APPLY) {
    await sb.from("profiles").update({ role: "KAM · Campo / CS", active: true }).eq("id", mg.id);
  }

  // rename responsable on all tasks Juan González → Juan Camilo
  const juanTasks = active().filter((t) => t.responsable === "Juan González");
  report.responsableRenames.push({ from: "Juan González", to: "Juan Camilo González", count: juanTasks.length });
  if (APPLY && juanTasks.length) {
    const { error } = await sb
      .from("tasks")
      .update({ responsable: "Juan Camilo González", edited_at: new Date().toISOString() })
      .eq("event_id", EVENT_ID)
      .eq("responsable", "Juan González");
    if (error) throw error;
    for (const t of tasks) if (t.responsable === "Juan González") t.responsable = "Juan Camilo González";
  }

  // Build intended ops from checklist
  /** @type {Array<{owner:string,tipo_check:string,brand:string,desc:string,dia:string|null,hora:string|null,isTimed:boolean,category:string,stage:string|null,speaker:string|null,venue:string|null,tipo_beneficio:string,flujo?:string,priority:number}>} */
  const intended = [];

  for (const row of checklist) {
    const meta = classifyDesc(row.desc, row.tipo_check);
    const { hora, isTimed } = parseHora(row.hora);
    const dia = mapDia(row.dia);
    let brands = extractBrandsFromDesc(row.desc, row.tipo_check);
    // FLEX multi-brand branding lines: keep one operational task
    const isMultiFlexList =
      row.tipo_check === "FLEX" &&
      (/Escarapelas|Camisetas|T[oó]tems|Backing principal|Backing fotográfico|Backing CTW|Pórtico|Loop pantallas|Zona \d+|Stage brandeado|Stage \+|Tarima|naming:|arco\/pórtico/i.test(
        row.desc
      ) ||
        brands.length > 4);

    // Drop garbage marcas from bad parses
    brands = brands.filter(
      (b) =>
        b &&
        !/^(CTF Operaciones|COSECHAS)$/i.test(b) &&
        !/^foto\b/i.test(b) &&
        !/^pend[oó]n\b/i.test(b) &&
        b.length < 40
    );

    if (isMultiFlexList || brands.length === 0) {
      brands = ["_checklist_"];
    }

    // priority: voluntarias timed first
    const priority =
      row.tipo_check === "TIMED" && /Juanita|Valentina|Paola/.test(row.owner)
        ? 1
        : row.tipo_check === "TIMED"
          ? 2
          : row.tipo_check === "CTW"
            ? 3
            : 4;

    for (const brand of brands) {
      const brandName = brand === "_checklist_" ? "CTF Operaciones" : brand;
      intended.push({
        owner: row.owner,
        tipo_check: row.tipo_check,
        brand: brandName,
        desc: row.desc,
        dia,
        hora: isTimed ? hora : null,
        isTimed: row.tipo_check !== "FLEX" && isTimed,
        category: meta.category,
        stage: meta.stage || extractVenue(row.desc),
        speaker: extractSpeaker(row.desc),
        venue: extractVenue(row.desc),
        tipo_beneficio:
          brand === "_checklist_"
            ? `Captura: ${row.desc.slice(0, 140)}`
            : buildTipoBeneficio(row.desc, meta.category, brandName),
        flujo: meta.flujo,
        priority,
        multiFlex: brand === "_checklist_",
      });
    }
  }

  intended.sort((a, b) => a.priority - b.priority);

  // Track which task ids already claimed by higher-priority checklist items
  const claimed = new Set();

  function findBest(item) {
    const candidates = active()
      .filter((t) => !claimed.has(t.id))
      .map((t) => ({ t, score: scoreMatch(t, item.brand, item.category, item.desc) }))
      .filter((x) => x.score >= 70)
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) return null;
    if (candidates.length > 1 && candidates[0].score === candidates[1].score && candidates[0].score < 100) {
      // prefer without evidence conflict - prefer exact speaking stage
      return candidates[0];
    }
    return candidates[0];
  }

  for (const item of intended) {
    // Skip duplicate KAM timed if volunteer already claimed same speaking brand+stage
    if (item.priority >= 2 && item.category === "Speaking") {
      const wantOrigen = /origen/i.test(item.desc);
      const wantRaiz = /ra[ií]z/i.test(item.desc);
      const already = active().find((t) => {
        if (!claimed.has(t.id)) return false;
        if (unifyLoose(t.marca) !== unifyLoose(item.brand)) return false;
        if (!/speaking/i.test(t.tipo_beneficio || "")) return false;
        const tipo = t.tipo_beneficio || "";
        if (wantOrigen && !/origen/i.test(tipo)) return false;
        if (wantRaiz && !/ra[ií]z|raiz/i.test(tipo)) return false;
        return true;
      });
      if (already) {
        report.skipped.push({
          reason: "already_assigned_to_stage_volunteer",
          owner: item.owner,
          brand: item.brand,
          desc: item.desc.slice(0, 80),
          taskId: already.id,
        });
        continue;
      }
    }

    // CTW checklist rows always get their own Captura task (sponsors de experiencia incluidos)
    const hit = item.multiFlex || item.category === "CTW Experiencia" ? null : findBest(item);

    if (hit) {
      const t = hit.t;
      claimed.add(t.id);
      const patch = {
        responsable: item.owner,
        edited_at: new Date().toISOString(),
      };
      // enrich schedule without wiping contractual tipo_beneficio
      if (item.isTimed) {
        patch.is_timed = true;
        if (item.hora) patch.hora = item.hora;
        if (item.dia) patch.dia = item.dia;
      }
      if (item.stage && !t.stage) patch.stage = item.stage;
      if (item.speaker && !t.speaker) patch.speaker = item.speaker;
      if (item.category && !t.category) patch.category = item.category;
      // append capture note
      const noteLine = `[Checklist ${item.tipo_check}] ${item.desc}`;
      const prev = t.notas || "";
      if (!prev.includes(item.desc.slice(0, 40))) {
        patch.notas = prev ? `${prev}\n${noteLine}` : noteLine;
      }
      // stand flujo
      if (item.flujo && t.flujo !== item.flujo && /stand/i.test(t.tipo_beneficio || "")) {
        patch.flujo = item.flujo;
      }

      report.matched.push({
        taskId: t.id,
        marca: t.marca,
        tipo: t.tipo_beneficio.slice(0, 60),
        from: t.responsable,
        to: item.owner,
        score: hit.score,
        hasEvidence: !!t.evidencia_url,
        patch: { ...patch, notas: patch.notas ? "updated" : undefined },
      });

      if (APPLY) {
        const { error } = await sb.from("tasks").update(patch).eq("id", t.id);
        if (error) throw error;
      }
      Object.assign(t, patch);
      continue;
    }

    // Nunca crear stands nuevos desde checklist: solo enriquecer contratos Notion existentes.
    // Evita inventar recepción de stand (Converzzo, LaValentina, etc.).
    if (item.flujo === "stand_recepcion" || item.category === "Stands") {
      report.skipped.push({
        reason: "no_contractual_stand_skip_create",
        owner: item.owner,
        brand: item.brand,
        desc: item.desc.slice(0, 80),
      });
      continue;
    }

    // Idempotency: skip if same captura already exists
    const alreadySame = active().find(
      (t) =>
        !claimed.has(t.id) &&
        unifyLoose(t.marca) === unifyLoose(item.brand) &&
        (t.tipo_beneficio || "") === item.tipo_beneficio
    );
    if (alreadySame) {
      claimed.add(alreadySame.id);
      report.skipped.push({
        reason: "captura_already_exists",
        owner: item.owner,
        brand: item.brand,
        desc: item.desc.slice(0, 80),
        taskId: alreadySame.id,
      });
      // still reassign owner / schedule on existing captura
      if (APPLY) {
        const patch = {
          responsable: item.owner,
          edited_at: new Date().toISOString(),
        };
        if (item.isTimed) {
          patch.is_timed = true;
          if (item.hora) patch.hora = item.hora;
          if (item.dia) patch.dia = item.dia;
        }
        await sb.from("tasks").update(patch).eq("id", alreadySame.id);
        Object.assign(alreadySame, patch);
      }
      continue;
    }

    // create new capture task
    const insert = {
      event_id: EVENT_ID,
      marca: item.brand,
      tipo_beneficio: item.tipo_beneficio,
      category: item.category,
      responsable: item.owner,
      dia: item.dia,
      hora: item.hora,
      is_timed: !!item.isTimed,
      speaker: item.speaker,
      stage: item.stage,
      notas: `[Checklist ${item.tipo_check}] ${item.desc}`,
      status: "pendiente",
      media_type: "photo",
      fase: item.category === "CTW Experiencia" ? "pre_evento" : "durante_evento",
      flujo: item.flujo || "simple",
    };

    report.created.push({
      marca: insert.marca,
      tipo: insert.tipo_beneficio.slice(0, 80),
      owner: insert.responsable,
      dia: insert.dia,
      hora: insert.hora,
      category: insert.category,
    });

    if (APPLY) {
      const { data: ins, error } = await sb.from("tasks").insert(insert).select("*").single();
      if (error) throw error;
      tasks.push(ins);
      claimed.add(ins.id);
    }
  }

  // Ensure sponsor_reports tokens exist for all unified brands (experiencias included)
  if (APPLY) {
    const brands = [...new Set(active().map((t) => canon(t.marca)))].filter((b) => b && b !== "CTF Operaciones");
    const { data: existing } = await sb
      .from("sponsor_reports")
      .select("sponsor_unified_name")
      .eq("event_id", EVENT_ID);
    const have = new Set((existing || []).map((r) => r.sponsor_unified_name));
    const missing = brands.filter((b) => !have.has(b));
    if (missing.length) {
      const { error } = await sb.from("sponsor_reports").insert(
        missing.map((sponsor_unified_name) => ({ event_id: EVENT_ID, sponsor_unified_name }))
      );
      if (error) console.warn("sponsor_reports insert warn", error.message);
      report.sponsorReportsCreated = missing.length;
    }
  }

  const outPath = resolve(
    ROOT,
    "backups",
    `checklist_merge_${APPLY ? "applied" : "dryrun"}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        checklistRows: report.checklistRows,
        profileUpdates: report.profileUpdates.length,
        renameJuanTasks: report.responsableRenames,
        matched: report.matched.length,
        created: report.created.length,
        skipped: report.skipped.length,
        report: outPath,
        sampleCreated: report.created.slice(0, 8),
        sampleMatched: report.matched.slice(0, 5).map((m) => `${m.marca}: ${m.from}→${m.to} (${m.score})`),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
