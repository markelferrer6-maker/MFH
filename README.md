# MFH

App de entrenamiento personal: rutinas, registro de series y progreso. Es una web instalable (PWA) pensada para el iPhone. Funciona sin conexión, no tiene cuentas ni servidor y no cuesta nada.

## Qué hace

- **Rutinas** con series planificadas, descansos por ejercicio, notas y superseries.
- **Entreno en curso**: cada serie muestra lo que hiciste la última vez y viene sugerida con esos valores; un toque la marca como hecha y arranca el descanso.
- **Historial** editable de todos los entrenos.
- **Progreso** por ejercicio: peso máximo, 1RM estimado (fórmula de Epley), volumen y récords personales.
- **Copia de seguridad** en un archivo JSON que exportas e importas cuando quieras.

## Dónde están los datos

Solo en el dispositivo, en el almacenamiento del navegador (IndexedDB). Nada se envía a ningún servidor.

Consecuencias que conviene tener claras:

- Si borras la app de la pantalla de inicio, se borran sus datos.
- Safari y la app instalada no comparten datos. Importa siempre dentro de la app instalada.
- Exporta una copia de vez en cuando (Ajustes → Exportar copia) y guárdala fuera del móvil. La app te lo recuerda si pasan más de 7 días.

## Instalar en el iPhone

1. Abre la dirección de la app en **Safari**.
2. Pulsa **Compartir** → **Añadir a pantalla de inicio**.
3. Abre MFH desde el icono nuevo.
4. Si tienes un archivo de copia: **Ajustes → Importar copia**.

## Limitaciones conocidas en iOS

- El aviso sonoro del descanso solo suena con la app abierta y en pantalla. Una web no puede programar una alarma con el móvil bloqueado. Por eso la app mantiene la pantalla encendida durante el entreno (se puede desactivar en Ajustes).
- El temporizador guarda la hora de fin, así que no se desajusta aunque salgas de la app y vuelvas.

## Desarrollo

Requiere Node 22.18 o posterior.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build && npm run e2e
```

`npm run e2e` abre la app compilada en Chromium con tamaño de iPhone y recorre el flujo completo: importar, entrenar, terminar, historial, gráficas, exportar y uso sin conexión. Necesita el navegador de Playwright (`npx playwright install chromium`).

### Estructura

| Carpeta | Contenido |
|---|---|
| `src/db` | Tipos, base de datos (Dexie) y formato de copia con su validación |
| `src/domain` | Lógica pura: estadísticas, récords, construcción y cierre de entrenos |
| `src/features` | Pantallas |
| `src/ui` | Componentes compartidos: tarjeta de ejercicio, diálogos, gráficas |
| `src/import` | Conversor de datos de Hevy |
| `tests` | Pruebas unitarias y de extremo a extremo |

### Importar desde Hevy

`scripts/hevy-to-mfh.mjs` convierte un volcado de la API de Hevy (rutinas, entrenos y plantillas de ejercicio en JSON) a un archivo de copia de MFH:

```bash
node scripts/hevy-to-mfh.mjs <carpeta-del-volcado> mfh-import.json
```

El archivo resultante contiene datos personales. `.gitignore` lo excluye; no lo subas al repositorio.

## Publicación

`.github/workflows/deploy.yml` compila, pasa las pruebas y publica en GitHub Pages con cada cambio en `main`. En **Settings → Pages** hay que elegir **GitHub Actions** como origen. La app se sirve en `https://<usuario>.github.io/MFH/`; si cambia el nombre del repositorio, hay que cambiar `base` en `vite.config.ts`.
