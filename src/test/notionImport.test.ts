import { describe, expect, it } from "vitest";
import {
  benefitsToTasks,
  inferFaseFromName,
  NOTION_SOURCES,
  type NotionImportPreview,
} from "@/lib/notionImport";

type Benefit = NotionImportPreview["benefits"][number];

const base: Benefit = {
  id: "page-1",
  name: "Stand 3x3",
  type: "Contrato",
  category: null,
  modality: null,
  status: "Sin empezar",
  sponsorId: "s1",
  sponsorName: "Sponsor Demo",
  owner: "Nathalia Muñoz",
  dia: null,
  hora: null,
  fase: null,
};

describe("inferFaseFromName", () => {
  it("detecta pre y post evento por palabras clave", () => {
    expect(inferFaseFromName("Newsletter con contenido del sponsor")).toBe("pre_evento");
    expect(inferFaseFromName("Banner en la app oficial")).toBe("pre_evento");
    expect(inferFaseFromName("Base de datos de asistentes")).toBe("post_evento");
  });

  it("sin pista devuelve null (queda durante_evento)", () => {
    expect(inferFaseFromName("Speaking Slot Main Stage")).toBeNull();
  });
});

describe("benefitsToTasks", () => {
  it("marca stands con flujo stand_recepcion y categoría Stands", () => {
    const [t] = benefitsToTasks("evt", [base]);
    expect(t.flujo).toBe("stand_recepcion");
    expect(t.category).toBe("Stands");
    expect(t.fase).toBe("durante_evento");
    expect(t.responsable).toBe("Nathalia Muñoz");
    expect(t.tipo_beneficio).toBe("Contrato: Stand 3x3");
  });

  it("usa la fase inferida y flujo simple para beneficios normales", () => {
    const [t] = benefitsToTasks("evt", [
      { ...base, name: "Newsletter", fase: "pre_evento" },
    ]);
    expect(t.flujo).toBe("simple");
    expect(t.fase).toBe("pre_evento");
    expect(t.category).toBeNull();
  });
});

describe("NOTION_SOURCES", () => {
  it("govtech consulta data sources y asigna responsable fijo", () => {
    expect(NOTION_SOURCES.govtech.lab.kind).toBe("data_source");
    expect(NOTION_SOURCES.govtech.crm.kind).toBe("data_source");
    expect(NOTION_SOURCES.govtech.fixedOwner).toBe("Nathalia Muñoz");
    expect(NOTION_SOURCES.govtech.followup).toBeNull();
  });

  it("ctw conserva las BDs originales", () => {
    expect(NOTION_SOURCES.ctw.lab.id).toBe("c46217e9-0d5e-4d9a-9d4f-8c50aff644c6");
    expect(NOTION_SOURCES.ctw.fixedOwner).toBeNull();
  });
});
