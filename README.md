# deck.gl Layer Manager

A small web app: a deck.gl map with a side panel to manage layers.

- **Add layers**: a layer is a *source* (where its rows come from) plus a *render kind* (how they're drawn) — independent of each other. Sources: a plain CORS-enabled JSON/GeoJSON **URL**, **WMS**, **WFS**, **ClickHouse** (a SQL query against the HTTP interface) or **DuckDB** (a SQL query run in-browser by DuckDB-WASM — no server, no credentials). Render kinds: Scatterplot, GeoJSON, Path, Arc, Hexagon bins, Heatmap — picked via the same *Render as* control regardless of source (WMS is the one exception: raster tiles render themselves, no render kind to pick). For WMS and WFS, "Get layers" / "Get feature types" reads the service's GetCapabilities so you can pick from a list; for ClickHouse and DuckDB, "Test query" runs the SQL without adding a layer. *Render as* stays editable after a layer is added, for every source.
- **Show and hide**: every layer and group has a checkbox. A layer is drawn only if it and all of its parent groups are checked. The header has *All* / *None* buttons, and each group has ☑ / ☐ buttons to check or uncheck all of its layers.
- **Group and ungroup**: use *+ Group*, then drag layers onto it. Groups can be nested. ⇱ ungroups (keeps the layers) and ✕ deletes the group with its layers.
- **Reorder** with drag and drop (the ⋮⋮ handle):
  - drop on the top or bottom half of a layer to go before or after it;
  - drop on the middle of a group header to go inside it (the top quarter of the header places the item before the group);
  - use the "Move to bottom" zone that shows up while you drag to go to the end of the top level.
  - Like most GIS tools, **the top of the list is drawn on top**.
- **Per-layer settings** (⚙): opacity, fill colour, radius, line width and line/stroke colour — each either a fixed value or a per-row JS accessor you write — data or service URL, WMS layers/format/version, WFS type/max features/axis swap/output format, ClickHouse query/render kind/database/credentials, DuckDB query/render kind, a **data filter** (deck.gl's `DataFilterExtension`, with a JS `getFilterValue` you write and a manual or Timeline-relative range), and Reload.
- **Zoom to** (⌖) a layer or a whole group. Rename a layer or group by double-clicking its name.
- The side panel is **resizable**: drag its bottom-right corner (plain CSS `resize: horizontal`, 240–720px) to make room for longer names or a wide accessor code editor.
- **Basemap**: a row at the top of the layer tree, styled like a layer — a checkbox to show/hide it and a ⚙ to configure its tile URL (any raster XYZ `{z}/{x}/{y}` server), max zoom and attribution. Defaults to OpenStreetMap's own tiles. The layer tree is saved to `localStorage`, and **Reset demo** brings back the sample layers (and the default basemap).
- **Widgets**: the *Widgets* button (top right) toggles deck.gl's own map-chrome widgets on and off — Zoom, Compass, Reset view, Gimbal, Fullscreen, Screenshot, Widget theme (light/dark), Loading indicator, Scale bar — each with its own corner placement. Settings are saved to `localStorage` like everything else.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (tree operations, data normalisation, GML parsing)
npm run build    # production build in dist/
```

## Docker

The image builds the app with Node, then serves the compiled `dist/` with nginx on port 80:

```bash
docker build -t deckgl-layer-manager .
docker run --rm -p 8080:80 deckgl-layer-manager   # http://localhost:8080
```

`nginx.conf` caches the hashed files in `/assets` for a year and makes the browser revalidate `index.html`, so a new deployment shows up on the next reload.

### Publishing to Docker Hub

`.github/workflows/docker.yml` runs the tests and the build, then builds a `linux/amd64` + `linux/arm64` image:

- a push to `main` publishes `latest` and `sha-<commit>`;
- a `vX.Y.Z` tag publishes `X.Y.Z`, `X.Y` and `X`;
- a pull request only builds the image, without pushing it.

In the GitHub repository, go to *Settings → Secrets and variables → Actions* and set:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `DOCKERHUB_USERNAME` | Docker Hub user or organisation |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub access token with *Read & Write* scope |
| Variable (optional) | `DOCKERHUB_IMAGE` | Repository name, `deckgl-layer-manager` by default |

## How it works

`src/sources/` holds everything about *where rows come from* (fetching/querying, independent of how they're drawn); `src/layers/` holds everything about *how rows become a deck.gl layer* (style resolution, extensions). `src/catalog.ts` and `src/data.ts` sit above both — `catalog.ts` is what unifies a source with a render kind into one `LayerNode` in the first place, and `data.ts` is the fetch/cache orchestrator that calls into `src/sources/` and feeds `src/layers/deckLayers.ts`.

| File | Role |
| --- | --- |
| `src/types.ts` | Layer / group tree model |
| `src/catalog.ts` | `RENDER_KINDS` (style defaults/controls per render kind) + `SOURCE_KINDS` (label/icon/hint per source); `makeLayer`; migrates an old-shaped saved layer/style to the current one |
| `src/tree.ts` | Pure tree operations (move, insert, ungroup, render order) |
| `src/state.ts` | Reducer + localStorage persistence |
| `src/data.ts` | Fetch + cache layer data (via `src/sources/`), normalise common JSON shapes, compute extents |
| `src/widgetCatalog.ts` | Catalog of addable deck.gl widgets (label/icon/default placement/factory) |
| `src/sources/ogc.ts` | WMS GetMap / WFS GetFeature URLs, GetCapabilities parsing |
| `src/sources/gml.ts` | WFS GML (2 / 3.1 / 3.2) → GeoJSON |
| `src/sources/clickhouse.ts` | ClickHouse HTTP interface query URL + fetch |
| `src/sources/duckdb.ts` | Lazy-initialised in-browser DuckDB-WASM engine (CDN-hosted, keyless) + query |
| `src/sources/queryTemplate.ts` | `{{timestamp}}` etc. placeholder interpolation shared by ClickHouse and DuckDB queries |
| `src/layers/deckLayers.ts` | Tree node → deck.gl layer; basemaps |
| `src/layers/accessors.ts` | Compiles a style property's JS accessor code (colour/opacity/radius/line width) and resolves it, or its constant, to what a deck.gl prop expects |
| `src/layers/accessorRuntime.ts` | `hash`/`numberToColor` — functions available inside every accessor/`getFilterValue` JS code editor |
| `src/layers/colors.ts` | Hex ↔ RGB(A) helpers |
| `src/layers/layerExtensions.ts` | deck.gl layer extensions (`DataFilterExtension` + `FilterFadeExtension`): compiles the user's `getFilterValue` JS and builds the layer props |
| `src/layers/filterFadeExtension.ts` | `FilterFadeExtension`: the GPU shader behind "Fade opacity across range" |
| `src/layers/featureInfo.ts` | Click-to-inspect popup widget |
| `src/components/LayerPanel.tsx` | Tree UI and drag and drop (dnd-kit) |
| `src/components/BasemapSettings.tsx` | The basemap's row + inline settings (URL/max zoom/attribution), at the top of the layer tree |
| `src/components/LayerSettings.tsx` | Inline layer settings |
| `src/components/AddLayerDialog.tsx` | Add-layer dialog (deck.gl / WMS / WFS / ClickHouse / DuckDB) |
| `src/components/CodeEditor.tsx` | Shared [CodeMirror 6](https://codemirror.net/) editor (syntax highlighting + basic completion) for every SQL and JS code field |
| `src/components/WidgetsPanel.tsx` | Widgets dropdown (enable + corner placement) |

- **WMS** is requested as 256px tiles in EPSG:3857 (`TileLayer` + `BitmapLayer`). If the server returns an XML ServiceException instead of an image, its message shows as ⚠ on the layer.
- **WFS** is requested in `EPSG:4326` (WFS 2.0.0 `TYPENAMES/COUNT`, or 1.1.0 `TYPENAME/MAXFEATURES`), as `application/json` by default. For servers that only return XML, set *Output format* to *GML / XML (server default)* or to one of the formats the server lists. "Get feature types" picks GML automatically when the capabilities list no JSON format. GML 2, 3.1 and 3.2 are converted to GeoJSON in the browser (`src/sources/gml.ts`). Lat/lon axis order is detected from the `srsName` (`urn:ogc:def:crs:EPSG::4326`). If features still look mirrored, tick *Swap X/Y*.
- **ClickHouse** runs your `SELECT` against the [HTTP interface](https://clickhouse.com/docs/interfaces/http) (`?query=...FORMAT JSON`); username/password go in `X-ClickHouse-User` / `X-ClickHouse-Key` headers, not the URL. The result rows are interpreted exactly like the layer's *Render as* kind — e.g. a `lon`/`lat` (or `lng`/`latitude`/`x`/`y`) column pair for Scatterplot/Hexagon/Heatmap, a `path` array for Path, `from`/`to` for Arc. Rows share the same click-to-inspect popup as WFS features.
  - `{{timestamp}}`, `{{timeRangeStart}}` and `{{timeRangeEnd}}` anywhere in the query are replaced with epoch-ms numbers before it's sent — the Timeline widget's position/range if it's enabled, else "now" for all three. `{{bboxWest}}`, `{{bboxSouth}}`, `{{bboxEast}}` and `{{bboxNorth}}` are replaced with the map viewport's current extent, in degrees (e.g. `WHERE lon BETWEEN {{bboxWest}} AND {{bboxEast}} AND lat BETWEEN {{bboxSouth}} AND {{bboxNorth}}`, to only fetch what's currently visible). Double braces, so they don't collide with ClickHouse's own `{name:Type}` query-parameter syntax. Resolved when the query actually runs (first load, *Test query*, or *Reload*), not continuously — panning the map or dragging the Timeline doesn't re-fetch on every frame/tick, only `dataStore`'s own cache key (the un-interpolated query text) decides whether a fetch is needed, so *Reload* is what re-resolves these against the current viewport/time.
- **DuckDB** runs your `SELECT` entirely in the browser via [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview.html) — no server, no credentials, no CORS to worry about. The engine (a few MB of WASM + its own worker) is fetched from jsDelivr's CDN and instantiated once, lazily, on first use, then shared by every DuckDB-kind layer. Rows are interpreted exactly like ClickHouse's (above), the same `{{timestamp}}` etc. placeholders work, and rows share the same click-to-inspect popup as WFS/ClickHouse features. Arrow's Decimal/Int64/Uint64 column values are converted to plain JS numbers before the usual row-shape sniffing runs (`src/sources/duckdb.ts`'s `tableToRows`) — DuckDB infers a bare numeric literal like `-122.27` in a `VALUES (...)` query as `DECIMAL(5,2)`, not `DOUBLE`, and Arrow's raw decimal representation needs its scale applied explicitly or it's off by orders of magnitude.
- Data only loads when a layer is first shown, and layers with the same source (and, for ClickHouse/DuckDB, the same render kind) share one download.
- The browser fetches services directly, so they must send CORS headers (ClickHouse: `add_http_cors_header` in its config, or a reverse proxy in front of it; DuckDB has no such requirement since it never leaves the browser). Otherwise you'll see "Network or CORS error"; put the service behind a proxy in that case.
- Every SQL query (ClickHouse/DuckDB) and JS accessor/`getFilterValue` field is a [CodeMirror 6](https://codemirror.net/) editor (`src/components/CodeEditor.tsx`) with syntax highlighting and basic completion, themed to follow the app's own light/dark CSS custom properties (no JS dark-mode detection — the generated stylesheet just references `var(--bg)` etc. directly). SQL and JS currently share one generic mode each; ClickHouse/DuckDB-specific keywords and schema-aware completion (table/column names from the engine itself) aren't wired up yet.
- **Style properties as accessors**: fill colour, opacity, radius, line width and line colour each have a *Value*/*Accessor* dropdown next to them (where the chosen render kind supports it — not hexagon/heatmap/WMS, which aggregate many rows into one mark or have no rows at all). *Accessor* switches the control to a JS function body (an implicit `return` is added for a bare expression) that runs once per row — `properties` is that row's/feature's properties, `d` is the raw row/feature — and must return a number (opacity/radius/line width) or a hex colour string like `"#ff8800"` (fill/line colour). A bad or throwing accessor falls back to the property's last constant value and shows its error inline, instead of hiding the layer. Switching modes keeps both the constant and the code around, so toggling back and forth doesn't lose either. Since a deck.gl layer's own `opacity` prop only accepts a constant (not a per-row accessor), the resolved opacity — constant or accessor — is baked into the alpha channel of whichever colour the layer paints with instead (`src/layers/accessors.ts`'s `resolveColorWithAlpha`), fill and line independently. Line colour is its own property (`getLineColor` for Scatterplot/GeoJSON) rather than reusing the fill colour — e.g. a Scatterplot point's white border, independently recolourable/accessor-able from its fill.
  - Besides `properties`/`d`, every accessor (and `getFilterValue`, below) can call two helpers from `src/layers/accessorRuntime.ts`: **`hash(...values)`** — a deterministic 32-bit unsigned integer from any number of values, for mapping a categorical property to a stable pseudo-random number (e.g. a palette index, or a bucket) — and **`numberToColor(value, min?, max?)`** — a hex colour linearly interpolated between a cold and a hot colour across `[min, max]` (default `0..1`), clamped at both ends. Paired, e.g. `return numberToColor(hash(properties.category), 0, 2**32);` gives every distinct category a stable colour with no server-side palette to maintain.
- **Data filter**: every non-WMS layer can enable deck.gl's [`DataFilterExtension`](https://deck.gl/docs/api-reference/extensions/data-filter-extension) to hide rows on the GPU. `getFilterValue(properties)` is a JS function body you write (an implicit `return` is added for a bare expression); it runs per row — `properties` is that row's/feature's properties — and must return a number. Its *Range* has two modes:
  - **Manual** — you type a fixed [min, max]; *Set range from data* runs `getFilterValue` over the loaded rows to suggest one.
  - **Timeline-relative** — you set a *Delay* as a value + unit (ms/sec/min/hr/days); the range becomes `[timestamp − delay, timestamp]`, recomputed from the Timeline widget's current position (or "now" if it's off) — a trailing window that moves with the timeline. `getFilterValue` itself has no access to `timestamp`; a typical use is returning the row's own time field (e.g. `return properties.event_time;`) so it's compared against that window.
  - The extension is attached to every vector layer from creation and switched on/off with its own `filterEnabled` prop, because deck.gl only wires an extension's GPU attribute up when a layer is first created — adding `extensions` in a later props update on the same layer id is silently ignored.
  - `getFilterValue`/`enabled`/the resolved range also drive the layer's `updateTriggers.getFilterValue` explicitly. deck.gl's generic attribute system only recomputes an accessor-driven GPU attribute when something in `updateTriggers` changes for it — editing the filter code or range (including a 'timeline'-mode range moving as the Timeline does) is *not* by itself treated as "needs recompute" without this. Found by instrumenting the compiled accessor in the browser and seeing it simply never get called again after the layer's first draw.
  - **Fade opacity across range (GPU)** — an optional checkbox, off by default. Rows near the start of the active range fade toward 0% opacity, rows near its end are at 100%, with every row in between a continuous gradient — not just the rows the hard range would otherwise hide/show. This is `src/layers/filterFadeExtension.ts`, a small hand-written `LayerExtension` (this app's only hand-written shader), not a JS accessor: the fade math runs entirely in the fragment shader, reading its own copy of the per-row filter value (it can't read `DataFilterExtension`'s own internal one) and a `[min, max]` uniform that's updated every frame. That matters specifically because the range can move continuously — a 'timeline'-mode filter under Timeline autoplay recomputes `[min, max]` on every tick; a uniform update is effectively free, whereas a JS-accessor equivalent would need the whole colour buffer recomputed and re-uploaded on every one of those ticks.
- **Widgets** are deck.gl's own `@deck.gl/widgets` classes (`ZoomWidget`, `CompassWidget`, …), not custom React controls, so they match deck.gl's native look and interact directly with the map's view state. All default to the top-left corner (the only one this app's own UI doesn't already occupy); use the placement dropdown next to each one to spread them across corners. `ResetViewWidget` is given this app's initial view state explicitly — deck.gl's own default (`deck.props.initialViewState`) is unset here since the map's `viewState` is controlled by React, not deck.gl.
- **Timeline widget**: a time slider (`timeRange`, *Step*, *Interval* and optional auto-play, all configurable from the Widgets panel) — *Last 24h* sets `timeRange` to `[now − 24h, now]` in one click, a shortcut for the common case rather than typing both *From*/*To* by hand. Its position drives a layer's 'timeline'-mode data filter (above) and `{{timestamp}}` / `{{timeRangeStart}}` / `{{timeRangeEnd}}` placeholders in a ClickHouse query (below). With the Timeline off, these all collapse to "now" — a snapshot taken whenever something rebuilds the layer (an edit, a reload, …), not a live-ticking clock; enable the Timeline's own auto-play if you want continuous motion. *Step* is how far each auto-play tick (or arrow-key press) advances the slider, set as a value + unit (ms/sec/min/hr/days); *Interval* is the real-time ms between ticks — together they set the play speed (the library default, 1ms of simulated time per 1000ms of real time, is visually frozen, so this app defaults to 1 simulated hour per real second instead). `TimelineWidget` ignores the `placement` prop and always renders full-width at the bottom, regardless of what's selected.

Demo data: [deck.gl-data](https://github.com/visgl/deck.gl-data) (BART, SF bike parking), terrestris OSM WMS, and IGN Géoplateforme WFS (French regions).
