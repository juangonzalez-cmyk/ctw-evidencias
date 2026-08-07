// Dataset completo de tareas para AI Summit 2026
// Se siembra en la BD la primera vez que se abre la app.

export interface SeedTask {
  marca: string;
  tipo_beneficio: string;
  dia: string | null;
  hora: string | null;
  responsable: string;
  is_timed: boolean;
  category: string;
  speaker?: string;
  notas?: string;
  media_type?: "photo" | "video";
  stage?: string | null;
  brands?: string[];
  flujo?: "simple" | "stand_recepcion";
}

const RESP = {
  juanita: "Juanita Buitrago",
  samuel: "Samuel Rodriguez",
  alejandro: "Alejandro Gamboa",
  daniela: "Daniela Serrano",
};

const STAGE_MAIN = "Main Stage";
const STAGE_INDUSTRY = "Industry Stage";
const STAGE_WORKSHOP = "Workshops";

const flexList = (
  responsable: string,
  category: string,
  tipo_beneficio: string,
  marcas: string[],
  opts?: { stage?: string; notasFn?: (m: string) => string }
): SeedTask[] =>
  marcas.map((marca) => ({
    marca,
    tipo_beneficio,
    dia: null,
    hora: null,
    responsable,
    is_timed: false,
    category,
    notas: opts?.notasFn?.(marca),
    media_type: "photo" as const,
    stage: opts?.stage ?? null,
  }));

// Helper: menciones MC individuales (una tarea por fila, sin brands array)
type MencionRow = { marca: string; menciones: number; dia: string; hora: string };

const mencionesIndividuales = (
  responsable: string,
  stage: string,
  rows: MencionRow[]
): SeedTask[] =>
  rows.map(({ marca, menciones, dia, hora }) => ({
    marca,
    tipo_beneficio: `Mención MC ${stage}`,
    dia,
    hora,
    responsable,
    is_timed: true,
    category: `Menciones MC – ${stage}`,
    media_type: "video" as const,
    stage,
  }));

// ============== JUANITA — MAIN STAGE ==============
const juanitaTimed: SeedTask[] = [
  { marca: "Buk", speaker: "Jaime Arrieta", dia: "7 de mayo", hora: "Por confirmar", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", notas: "Hora flexible — cualquiera de los 2 días", media_type: "photo", stage: STAGE_MAIN },
  { marca: "Snowflake", speaker: "Sergio Correcha, Fabián Villalobos, Ernesto Serrano", dia: "7 de mayo", hora: "09:00", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "Davivienda", speaker: "Catalina Riveros", dia: "7 de mayo", hora: "11:30", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "MERCATELY INC", speaker: "Pablo Montoya", dia: "7 de mayo", hora: "14:30", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "Wonderful", speaker: "Juan Pablo Consuegra", dia: "7 de mayo", hora: "17:30", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "Alpina", speaker: "Nicolas Forero", dia: "8 de mayo", hora: "09:00", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "Jelou", speaker: "Luis Loaiza", dia: "8 de mayo", hora: "10:00", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "CEIBA", speaker: "Andres Cano", dia: "8 de mayo", hora: "11:00", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "Engineering System", speaker: "Jair Sanchez", dia: "8 de mayo", hora: "11:00", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "Oracle", speaker: "Luis Martin Lopez, Andres Carpio, Fabio Gualtero", dia: "8 de mayo", hora: "12:00", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
  { marca: "Make", speaker: "Sara Maldon", dia: "8 de mayo", hora: "14:00", responsable: RESP.juanita, is_timed: true, category: "Speaking slot Main Stage", tipo_beneficio: "Speaking slot Main Stage", media_type: "photo", stage: STAGE_MAIN },
];

// Menciones MC Main Stage — NUEVOS HORARIOS (una tarea por fila)
const mencionesMainRows: MencionRow[] = [
  { marca: "Semana", menciones: 3, dia: "7 de mayo", hora: "12:30" },
  { marca: "Semana", menciones: 3, dia: "8 de mayo", hora: "9:00" },
  { marca: "CEIBA Software House", menciones: 3, dia: "7 de mayo", hora: "16:00" },
  { marca: "Creatio", menciones: 3, dia: "7 de mayo", hora: "12:30" },
  { marca: "Wonderful", menciones: 3, dia: "7 de mayo", hora: "14:30" },
  { marca: "Wonderful", menciones: 3, dia: "7 de mayo", hora: "17:30" },
  { marca: "Wonderful", menciones: 3, dia: "8 de mayo", hora: "9:00" },
  { marca: "SS&C", menciones: 3, dia: "7 de mayo", hora: "14:30" },
  { marca: "SS&C", menciones: 3, dia: "8 de mayo", hora: "14:00" },
  { marca: "Oracle", menciones: 3, dia: "8 de mayo", hora: "12:00" },
  { marca: "Takum", menciones: 3, dia: "7 de mayo", hora: "12:30" },
  { marca: "Snowflake", menciones: 3, dia: "8 de mayo", hora: "11:00" },
  { marca: "Snowflake", menciones: 3, dia: "7 de mayo", hora: "10:00" },
  { marca: "Buk", menciones: 3, dia: "7 de mayo", hora: "15:30" },
  { marca: "Buk", menciones: 3, dia: "8 de mayo", hora: "9:00" },
  { marca: "Jelou", menciones: 3, dia: "8 de mayo", hora: "10:00" },
  { marca: "Jelou", menciones: 3, dia: "7 de mayo", hora: "12:30" },
  { marca: "Engineering System", menciones: 3, dia: "7 de mayo", hora: "12:30" },
  { marca: "Engineering System", menciones: 3, dia: "8 de mayo", hora: "11:00" },
  { marca: "MERCATELY INC", menciones: 3, dia: "7 de mayo", hora: "14:30" },
  { marca: "MERCATELY INC", menciones: 3, dia: "8 de mayo", hora: "14:00" },
  { marca: "Applying Consulting", menciones: 3, dia: "7 de mayo", hora: "16:00" },
  { marca: "Applying Consulting", menciones: 3, dia: "8 de mayo", hora: "12:00" },
  { marca: "CEIBA Software House", menciones: 3, dia: "8 de mayo", hora: "11:00" },
  { marca: "Audi", menciones: 2, dia: "8 de mayo", hora: "9:00" },
  { marca: "Alpina", menciones: 2, dia: "8 de mayo", hora: "9:00" },
  { marca: "Claro", menciones: 2, dia: "7 de mayo", hora: "17:00" },
  { marca: "Hubspot", menciones: 2, dia: "7 de mayo", hora: "14:00" },
  { marca: "Hubspot", menciones: 2, dia: "8 de mayo", hora: "17:00" },
  { marca: "Concentrix-Gail", menciones: 2, dia: "8 de mayo", hora: "12:00" },
  { marca: "Davivienda", menciones: 2, dia: "7 de mayo", hora: "11:00" },
  { marca: "Davivienda", menciones: 2, dia: "8 de mayo", hora: "11:00" },
  { marca: "Russell Bedford", menciones: 2, dia: "8 de mayo", hora: "14:00" },
  { marca: "Make-Celonis", menciones: 2, dia: "8 de mayo", hora: "14:00" },
  { marca: "Akua Ops LLC", menciones: 2, dia: "7 de mayo", hora: "16:00" },
  { marca: "Akua Ops LLC", menciones: 2, dia: "8 de mayo", hora: "11:30" },
  { marca: "Western Digital", menciones: 1, dia: "7 de mayo", hora: "12:30" },
  { marca: "Startti", menciones: 1, dia: "7 de mayo", hora: "12:30" },
  { marca: "LaValentina", menciones: 1, dia: "7 de mayo", hora: "12:30" },
  { marca: "Go to cloud", menciones: 1, dia: "7 de mayo", hora: "14:30" },
  { marca: "Bravent", menciones: 1, dia: "7 de mayo", hora: "16:00" },
  { marca: "CognosOnline", menciones: 1, dia: "7 de mayo", hora: "12:30" },
  { marca: "Payana", menciones: 1, dia: "7 de mayo", hora: "16:00" },
];

const pantallasLateralesMain = ["ServiceLab", "Concentrix-Gail", "Claro", "HubSpot", "Audi", "Startti", "Nuptum", "Go to Cloud", "Akua", "Alpina", "Coursera", "Western Digital", "Bravent", "Rooftop", "Muno Labs", "La Valentina", "CognosOnline", "Payana", "You", "Four Seasons", "Hotel Casa Dann"];

const pantallaPrincipalMain = ["Ceiba", "Snowflake", "ServiceLab", "Jelou", "Creatio", "Wonderful", "SS&C", "Make", "Takum", "Applying", "Colsubsidio", "Oracle", "Buk", "Mercately", "Davivienda", "Universidad del Rosario", "Semana", "Black Agency"];

// ============== SAMUEL — INDUSTRY STAGE ==============
const samuelTimed: SeedTask[] = [
  { marca: "Creatio", speaker: "Grecia Flores", dia: "7 de mayo", hora: "11:30", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Bravent", speaker: "Mario Lopez", dia: "7 de mayo", hora: "15:00", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Concentrix-Gail", speaker: "Edson Romero, Arnaldo Carrillo, Daniel Ortega, Ruben Vargas", dia: "7 de mayo", hora: "18:00", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Akua Ops", speaker: "Santiago Castillo", dia: "8 de mayo", hora: "Por confirmar", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", notas: "Hora flexible — cualquiera de los 2 días", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Takum", speaker: "Javier Pinto", dia: "8 de mayo", hora: "09:00", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Colsubsidio", speaker: "Ana María Tobar", dia: "8 de mayo", hora: "10:30", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Coursera", speaker: "Juan Zerda", dia: "8 de mayo", hora: "11:00", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Alpina", speaker: "Andres Cano (CEIBA Industry)", dia: "8 de mayo", hora: "11:00", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "CEIBA Software House", speaker: "Andres Cano (CEIBA Industry)", dia: "8 de mayo", hora: "11:00", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "CEIBA", speaker: "Rafael Ospino", dia: "8 de mayo", hora: "16:30", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Applying Consulting", speaker: "Vladimir Vivar", dia: "8 de mayo", hora: "16:30", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "Universidad el Rosario", speaker: "Mauricio Sanabria", dia: "8 de mayo", hora: "17:00", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
  { marca: "SS&C", speaker: "Jaime Robles", dia: "8 de mayo", hora: "17:30", responsable: RESP.samuel, is_timed: true, category: "Speaking slot Industry Stage", tipo_beneficio: "Speaking slot Industry Stage", media_type: "photo", stage: STAGE_INDUSTRY },
];

// Menciones MC Industry Stage — NUEVOS HORARIOS (una tarea por fila)
const mencionesIndustryRows: MencionRow[] = [
  { marca: "Semana", menciones: 3, dia: "7 de mayo", hora: "12:00" },
  { marca: "Creatio", menciones: 3, dia: "7 de mayo", hora: "11:00" },
  { marca: "Creatio", menciones: 3, dia: "8 de mayo", hora: "10:00" },
  { marca: "SS&C", menciones: 3, dia: "7 de mayo", hora: "11:00" },
  { marca: "Oracle", menciones: 3, dia: "7 de mayo", hora: "12:00" },
  { marca: "Oracle", menciones: 3, dia: "8 de mayo", hora: "10:00" },
  { marca: "Takum", menciones: 3, dia: "7 de mayo", hora: "9:00" },
  { marca: "Snowflake", menciones: 3, dia: "7 de mayo", hora: "9:00" },
  { marca: "Jelou", menciones: 3, dia: "8 de mayo", hora: "17:00" },
  { marca: "Engineering System", menciones: 3, dia: "7 de mayo", hora: "11:30" },
  { marca: "MERCATELY INC", menciones: 3, dia: "7 de mayo", hora: "10:30" },
  { marca: "Applying Consulting", menciones: 3, dia: "7 de mayo", hora: "14:30" },
  { marca: "CEIBA Software House", menciones: 3, dia: "7 de mayo", hora: "15:00" },
  { marca: "Audi", menciones: 2, dia: "8 de mayo", hora: "12:30" },
  { marca: "Alpina", menciones: 2, dia: "7 de mayo", hora: "12:00" },
  { marca: "Claro", menciones: 2, dia: "8 de mayo", hora: "9:00" },
  { marca: "Concentrix-Gail", menciones: 2, dia: "7 de mayo", hora: "12:00" },
  { marca: "Russell Bedford", menciones: 2, dia: "7 de mayo", hora: "16:00" },
  { marca: "Make-Celonis", menciones: 2, dia: "7 de mayo", hora: "12:00" },
  { marca: "Colsubsidio", menciones: 2, dia: "8 de mayo", hora: "10:30" },
  { marca: "Akua Ops LLC", menciones: 2, dia: "8 de mayo", hora: "11:30" },
  { marca: "Rooftop", menciones: 1, dia: "8 de mayo", hora: "9:00" },
  { marca: "Coursera", menciones: 1, dia: "8 de mayo", hora: "11:00" },
  { marca: "Universidad el Rosario", menciones: 1, dia: "7 de mayo", hora: "12:30" },
];

const pantallasLateralesIndustry = ["Ceiba", "Snowflake", "ServiceLab", "Jelou", "Concentrix-Gail", "Creatio", "Wonderful", "SS&C", "Make", "Takum", "Applying", "Colsubsidio", "Oracle", "Buk", "Mercately", "Russell Bedford", "Claro", "HubSpot", "Audi", "Startti", "Nuptum", "Go to Cloud", "Akua", "Davivienda", "Alpina", "Coursera", "Western Digital", "Bravent", "Rooftop", "Muno Labs", "La Valentina", "CognosOnline", "Payana", "You", "Universidad del Rosario", "Semana", "Four Seasons", "Hotel Casa Dann", "Black Agency"];

// ============== ALEJANDRO — WORKSHOPS ==============
const alejandroTimed: SeedTask[] = [
  { marca: "MunoLabs", speaker: "Daniela Gomez", dia: "7 de mayo", hora: "10:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "ServiceIA", speaker: "Alexis Gomez y Juan David Lopez", dia: "7 de mayo", hora: "11:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "Applying Consulting", speaker: "Luisa Vesga y Luis Torres", dia: "7 de mayo", hora: "12:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "CEIBA", speaker: "Juan Esteban Castaño y Juan Pablo Botero", dia: "7 de mayo", hora: "13:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "HubSpot", speaker: "Jessica Gonzalez y David Bernal", dia: "7 de mayo", hora: "14:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "Make-Celonis", speaker: "Francisco Fontez", dia: "7 de mayo", hora: "15:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "Russell Bedford", speaker: "Lidia Roa, Diego Arias", dia: "8 de mayo", hora: "09:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "Snowflake", speaker: "Jorge Parrado", dia: "8 de mayo", hora: "11:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "Applying Consulting", speaker: "Gabriel Paredes y Luis Torres", dia: "8 de mayo", hora: "12:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "Jelou", speaker: "Denny", dia: "8 de mayo", hora: "14:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
  { marca: "Startti", speaker: "Julian Caicedo", dia: "8 de mayo", hora: "15:00", responsable: RESP.alejandro, is_timed: true, category: "Workshop slot", tipo_beneficio: "Workshop", media_type: "photo", stage: STAGE_WORKSHOP },
];

const alejandroBranding: SeedTask[] = alejandroTimed.map((t) => ({
  marca: t.marca,
  tipo_beneficio: "Branding del salón (foto antes de la sesión)",
  dia: t.dia,
  hora: null,
  responsable: RESP.alejandro,
  is_timed: false,
  category: "Branding salones workshop",
  notas: `Salón del workshop de ${t.speaker}`,
  media_type: "photo" as const,
  stage: STAGE_WORKSHOP,
}));

// ============== DANIELA — EXPERIENCES & GROWTH + BRANDING (ex-Santiago) ==============
const stands: Array<[string, string]> = [
  ["Claro", "2x2"], ["Startti", "2x2"], ["Gatekeeper", "2x2"], ["U.Sabana", "2x2"],
  ["Nuptum", "2x2"], ["Go to Cloud", "2x2"], ["CognosOnline", "2x2"], ["Colsubsidio", "2x2"],
  ["Payana", "2x2"], ["Akua", "2x2"],
  ["HubSpot", "3x3"], ["Alpina", "3x3"], ["Creatio", "3x3"], ["Bravent", "3x3"],
  ["Make", "3x3"], ["Concentrix-Gail", "3x3"], ["SS&C", "3x3"], ["Oracle", "3x3"],
  ["Takum", "3x3"], ["Monday", "3x3"], ["Mercately", "3x3"], ["Applying Cloud", "3x3"],
  ["Jelou", "4x4"], ["Audi", "4x4"], ["Snowflake", "4x4"], ["ServiceLab", "4x4"],
];

const danielaStands: SeedTask[] = stands.map(([marca, size]) => ({
  marca,
  tipo_beneficio: `Stand ${size}`,
  dia: null,
  hora: null,
  responsable: RESP.daniela,
  is_timed: false,
  category: "Stands",
  notas: `Tamaño: ${size}`,
  media_type: "photo" as const,
  stage: null,
  flujo: "stand_recepcion",
}));

const danielaExperiencias: SeedTask[] = [
  { marca: "Buk", tipo_beneficio: "Bar de Buk – Open Drinks", dia: null, hora: null, responsable: RESP.daniela, is_timed: false, category: "Experiencias dinámicas", notas: "Foto del espacio con branding de Buk visible", media_type: "photo", stage: null },
  { marca: "Applying Consulting", tipo_beneficio: "Sala de workshops Applying", dia: null, hora: null, responsable: RESP.daniela, is_timed: false, category: "Experiencias dinámicas", notas: "Foto del espacio con branding visible", media_type: "photo", stage: null },
  { marca: "CEIBA", tipo_beneficio: "Sala VIP de CEIBA", dia: null, hora: null, responsable: RESP.daniela, is_timed: false, category: "Experiencias dinámicas", notas: "Foto del espacio con branding de CEIBA visible", media_type: "photo", stage: null },
];

const capsulas = ["Alpina", "HubSpot", "Creatio", "Audi", "Bravent", "Davivienda", "Wonderful", "SS&C", "Make", "Akua"];
const danielaCapsulas: SeedTask[] = capsulas.map((marca) => ({
  marca,
  tipo_beneficio: "Cápsula de video — branding visible",
  dia: null,
  hora: null,
  responsable: RESP.daniela,
  is_timed: false,
  category: "Cápsulas de video",
  notas: "Confirmar que el branding de la marca aparezca visible en la cápsula",
  media_type: "video" as const,
  stage: null,
}));

// Coffee by Oracle — NUEVO
const danielaCoffee: SeedTask = {
  marca: "Oracle",
  tipo_beneficio: "Coffee / Experiencia dinámica",
  dia: "7 de mayo",
  hora: "11:00",
  responsable: RESP.daniela,
  is_timed: true,
  category: "Experiencias dinámicas",
  notas: "Capturar foto del espacio de coffee con branding de Oracle visible",
  media_type: "photo",
  stage: null,
};

// Tareas ex-Santiago → ahora Daniela
const totems = ["Claro", "Audi", "Creatio", "Nuptum", "Concentrix-Gail", "Davivienda", "Wonderful", "SS&C", "Make-Celonis", "Oracle", "Takum", "Go to Cloud", "Buk", "MERCATELY INC", "Applying Consulting", "Snowflake", "CEIBA Software House", "Jelou", "Engineering System"];
const escarapelas = ["Ceiba", "Snowflake", "ServiceLab", "AMD", "Equinix", "HPE", "Jelou", "Semana"];
const backings = ["Alpina", "Claro", "HubSpot", "Coursera", "Rooftop", "Startti", "Creatio", "MunoLab", "Nuptum", "Concentrix-Gail", "Universidad el Rosario", "Davivienda", "Russell Bedford", "Wonderful", "SS&C", "Make-Celonis", "Oracle", "Takum", "Semana", "LaValentina", "Snowflake", "Go to Cloud", "Bravent", "Colsubsidio", "CognosOnline", "Buk", "Jelou", "Payana", "Engineering System", "Akua Ops LLC", "MERCATELY INC", "CEIBA Software House", "Western Digital", "Applying Consulting", "Audi"];
const camisetas = ["Semana", "Dinero", "Snowflake", "ServiceLab", "HPE", "AMD", "Equinix", "Jelou", "Ceiba"];

// ============== EXPORT ALL ==============
export const ALL_SEED_TASKS: SeedTask[] = [
  // Juanita
  ...juanitaTimed,
  ...mencionesIndividuales(RESP.juanita, STAGE_MAIN, mencionesMainRows),
  ...flexList(RESP.juanita, "Pantallas laterales Main Stage", "Logo en pantalla lateral", pantallasLateralesMain, { stage: STAGE_MAIN }),
  ...flexList(RESP.juanita, "Pantalla principal Main Stage", "Logo en pantalla principal", pantallaPrincipalMain, { stage: STAGE_MAIN }),
  // Samuel
  ...samuelTimed,
  ...mencionesIndividuales(RESP.samuel, STAGE_INDUSTRY, mencionesIndustryRows),
  ...flexList(RESP.samuel, "Pantallas laterales Industry Stage", "Logo en pantalla lateral", pantallasLateralesIndustry, { stage: STAGE_INDUSTRY }),
  // Alejandro
  ...alejandroTimed,
  ...alejandroBranding,
  // Daniela (originales + ex-Santiago + Coffee Oracle)
  ...danielaStands,
  ...danielaExperiencias,
  ...danielaCapsulas,
  danielaCoffee,
  ...flexList(RESP.daniela, "Tótems", "Foto frontal del tótem", totems),
  ...flexList(RESP.daniela, "Escarapelas", "Close-up con logo legible", escarapelas),
  ...flexList(RESP.daniela, "Backing fotográfico", "Foto del backing con logo visible", backings),
  ...flexList(RESP.daniela, "Camisetas del staff", "Foto del staff con camiseta y logo visible", camisetas),
];
