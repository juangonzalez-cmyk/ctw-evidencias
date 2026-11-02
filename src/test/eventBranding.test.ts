import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_HIGHLIGHT_STATS,
  EVENT_HIGHLIGHT_SUBTITLE,
  getEventBranding,
  isGovTechEvent,
  withOrgLabel,
} from "@/lib/eventHighlightStats";

describe("getEventBranding", () => {
  it("GovTech: sin Colombia Tech Week y con sus métricas", () => {
    const b = getEventBranding("govtech-summit-2026");
    expect(b.orgLabel).toBeNull();
    expect(b.highlightStats.map((s) => [s.value, s.label])).toEqual([
      ["+1.000", "Asistentes"],
      ["+50", "Países representados"],
      ["+150", "Speakers"],
    ]);
    expect(b.highlightSubtitle).toContain("GovTech Summit 2026");
    expect(b.highlightSubtitle).not.toMatch(/Colombia Tech|Tech Fest|CTW|CTF/);
    expect(withOrgLabel("GovTech Summit 2026", b)).toBe("GovTech Summit 2026");
  });

  it("CTF/CTW y sin slug conservan exactamente el comportamiento anterior", () => {
    for (const slug of ["ctf-2026", null, undefined, ""]) {
      const b = getEventBranding(slug);
      expect(b.orgLabel).toBe("Colombia Tech Week");
      expect(b.highlightStats).toBe(DEFAULT_EVENT_HIGHLIGHT_STATS);
      expect(b.highlightSubtitle).toBe(EVENT_HIGHLIGHT_SUBTITLE);
      expect(withOrgLabel("Colombia Tech Fest 2026", b)).toBe(
        "Colombia Tech Fest 2026 · Colombia Tech Week"
      );
    }
    expect(DEFAULT_EVENT_HIGHLIGHT_STATS.map((s) => s.value)).toEqual(["+15,000", "+50", "+160"]);
  });

  it("isGovTechEvent solo por slug govtech*", () => {
    expect(isGovTechEvent("govtech-summit-2026")).toBe(true);
    expect(isGovTechEvent("ctf-2026")).toBe(false);
  });
});
