# CTW Evidencias

PWA + Vite + Supabase para captura y entrega de evidencias de sponsors (Colombia Tech Week).

## Desarrollo

```bash
cp .env.example .env   # pega keys reales
npm install
npm run dev            # http://localhost:8080
```

## PWA

La app se puede **instalar en el celular** (Añadir a inicio / Install app).
Tras el deploy en HTTPS (Vercel), Chrome/Safari muestran el prompt de instalación.

## Vercel

1. Importa este repo en Vercel (root = esta carpeta).
2. Variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
3. Build: `npm run build` · Output: `dist`

## Scripts útiles

```bash
npm run db:schema                 # aplica schema.sql (requiere DATABASE_URL)
npm run db:sync-notion-evidencias # trae Evidencia de Notion → Supabase
npm run db:materialize-evidencias # convierte Drive/links a storage público
```
