/**
 * El seed de tareas del evento se gestiona desde el admin / import.
 * Ya no se auto-inserta un dataset hardcodeado al abrir la app.
 */
export async function seedTasksIfEmpty(): Promise<{ seeded: boolean; count: number }> {
  return { seeded: false, count: 0 };
}
