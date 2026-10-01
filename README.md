# deck.gl Layer Manager

A small web app: a deck.gl map with a side panel to manage layers.

- **Add layers**: the common deck.gl layers (Scatterplot, GeoJSON, Path, Arc, Hexagon bins, Heatmap) from any CORS-enabled JSON/GeoJSON URL, plus **WMS**, **WFS** and **ClickHouse** sources. For WMS and WFS, "Get layers" / "Get feature types" reads the service's GetCapabilities so you can pick from a list. For ClickHouse, write a SQL query against the HTTP interface and pick which deck.gl layer renders its rows; "Test query" runs it without adding a layer.
- **Show and hide**: every layer and group has a checkbox. A layer is drawn only if it and all of its parent groups are checked. The header has *All* / *None* buttons, and each group has ☑ / ☐ buttons to check or uncheck all of its layers.
- **Group and ungroup**: use *+ Group*, then drag layers onto it. Groups can be nested. ⇱ ungroups (keeps the layers) and ✕ deletes the group with its layers.
- **Reorder** with drag and drop (the ⋮⋮ handle):
  - drop on the top or bottom half of a layer to go before or after it;
  - drop on the middle of a group header to go inside it (the top quarter of the header places the item before the group);
  - use the "Move to bottom" zone that shows up while you drag to go to the end of the top level.
  - Like most GIS tools, **the top of the list is drawn on top**.
- **Per-layer settings** (⚙): opacity, colour, radius or line width, data or service URL, WMS layers/format/version, WFS type/max features/axis swap/output format, ClickHouse query/render kind/database/credentials, a **data filter** (deck.gl's `DataFilterExtension`, with a JS `getFilterValue` you write and a manual or Timeline-relative range), and Reload.
- **Zoom to** (⌖) a layer or a whole group. Rename a layer or group by double-clicking its name.
- Basemap switcher (Esri Light/Dark Gray, OpenStreetMap, Esri Imagery, none). The layer tree is saved to `localStorage`, and **Reset demo** brings back the sample layers.
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

| File | Role |
| --- | --- |
| `src/types.ts` | Layer / group tree model |
| `src/tree.ts` | Pure tree operations (move, insert, ungroup, render order) |
| `src/state.ts` | Reducer + localStorage persistence |
| `src/data.ts` | Fetch + cache layer data, normalise common JSON shapes, compute extents |
| `src/ogc.ts` | WMS GetMap / WFS GetFeature URLs, GetCapabilities parsing |
| `src/gml.ts` | WFS GML (2 / 3.1 / 3.2) → GeoJSON |
| `src/clickhouse.ts` | ClickHouse HTTP interface query URL + fetch |
| `src/layerExtensions.ts` | deck.gl layer extensions (currently `DataFilterExtension`): compiles the user's `getFilterValue` JS and builds the layer props |
| `src/widgetCatalog.ts` | Catalog of addable deck.gl widgets (label/icon/default placement/factory) |
| `src/deckLayers.ts` | Tree node → deck.gl layer; basemaps |
| `src/components/LayerPanel.tsx` | Tree UI and drag and drop (dnd-kit) |
| `src/components/LayerSettings.tsx` | Inline layer settings |
| `src/components/AddLayerDialog.tsx` | Add-layer dialog (deck.gl / WMS / WFS / ClickHouse) |
| `src/components/WidgetsPanel.tsx` | Widgets dropdown (enable + corner placement) |

- **WMS** is requested as 256px tiles in EPSG:3857 (`TileLayer` + `BitmapLayer`). If the server returns an XML ServiceException instead of an image, its message shows as ⚠ on the layer.
- **WFS** is requested in `EPSG:4326` (WFS 2.0.0 `TYPENAMES/COUNT`, or 1.1.0 `TYPENAME/MAXFEATURES`), as `application/json` by default. For servers that only return XML, set *Output format* to *GML / XML (server default)* or to one of the formats the server lists. "Get feature types" picks GML automatically when the capabilities list no JSON format. GML 2, 3.1 and 3.2 are converted to GeoJSON in the browser (`src/gml.ts`). Lat/lon axis order is detected from the `srsName` (`urn:ogc:def:crs:EPSG::4326`). If features still look mirrored, tick *Swap X/Y*.
- **ClickHouse** runs your `SELECT` against the [HTTP interface](https://clickhouse.com/docs/interfaces/http) (`?query=...FORMAT JSON`); username/password go in `X-ClickHouse-User` / `X-ClickHouse-Key` headers, not the URL. The result rows are interpreted exactly like the deck.gl layer you pick as *Render as* — e.g. a `lon`/`lat` (or `lng`/`latitude`/`x`/`y`) column pair for Scatterplot/Hexagon/Heatmap, a `path` array for Path, `from`/`to` for Arc. Rows share the same click-to-inspect popup as WFS features.
  - `{{timestamp}}`, `{{timeRangeStart}}` and `{{timeRangeEnd}}` anywhere in the query are replaced with epoch-ms numbers before it's sent — the Timeline widget's position/range if it's enabled, else "now" for all three. Double braces, so they don't collide with ClickHouse's own `{name:Type}` query-parameter syntax. Resolved when the query actually runs (first load, *Test query*, or *Reload*), not continuously — dragging the Timeline doesn't re-fetch on every tick, only `dataStore`'s own cache key (the un-interpolated query text) decides whether a fetch is needed, so *Reload* is what re-resolves it against the current time.
- Data only loads when a layer is first shown, and layers with the same source (and, for ClickHouse, the same render kind) share one download.
- The browser fetches services directly, so they must send CORS headers (ClickHouse: `add_http_cors_header` in its config, or a reverse proxy in front of it). Otherwise you'll see "Network or CORS error"; put the service behind a proxy in that case.
- **Data filter**: every non-WMS layer can enable deck.gl's [`DataFilterExtension`](https://deck.gl/docs/api-reference/extensions/data-filter-extension) to hide rows on the GPU. `getFilterValue(properties)` is a JS function body you write (an implicit `return` is added for a bare expression); it runs per row — `properties` is that row's/feature's properties — and must return a number. Its *Range* has two modes:
  - **Manual** — you type a fixed [min, max]; *Set range from data* runs `getFilterValue` over the loaded rows to suggest one.
  - **Timeline-relative** — you set a *Delay* (ms); the range becomes `[timestamp − delay, timestamp]`, recomputed from the Timeline widget's current position (or "now" if it's off) — a trailing window that moves with the timeline. `getFilterValue` itself has no access to `timestamp`; a typical use is returning the row's own time field (e.g. `return properties.event_time;`) so it's compared against that window.
  - The extension is attached to every vector layer from creation and switched on/off with its own `filterEnabled` prop, because deck.gl only wires an extension's GPU attribute up when a layer is first created — adding `extensions` in a later props update on the same layer id is silently ignored.
  - `getFilterValue`/`enabled`/the resolved range also drive the layer's `updateTriggers.getFilterValue` explicitly. deck.gl's generic attribute system only recomputes an accessor-driven GPU attribute when something in `updateTriggers` changes for it — editing the filter code or range (including a 'timeline'-mode range moving as the Timeline does) is *not* by itself treated as "needs recompute" without this. Found by instrumenting the compiled accessor in the browser and seeing it simply never get called again after the layer's first draw.
- **Widgets** are deck.gl's own `@deck.gl/widgets` classes (`ZoomWidget`, `CompassWidget`, …), not custom React controls, so they match deck.gl's native look and interact directly with the map's view state. All default to the top-left corner (the only one this app's own UI doesn't already occupy); use the placement dropdown next to each one to spread them across corners. `ResetViewWidget` is given this app's initial view state explicitly — deck.gl's own default (`deck.props.initialViewState`) is unset here since the map's `viewState` is controlled by React, not deck.gl.
- **Timeline widget**: a time slider (`timeRange` + optional auto-play, configurable from the Widgets panel). Its position drives a layer's 'timeline'-mode data filter (above) and `{{timestamp}}` / `{{timeRangeStart}}` / `{{timeRangeEnd}}` placeholders in a ClickHouse query (below). With the Timeline off, these all collapse to "now" — a snapshot taken whenever something rebuilds the layer (an edit, a reload, …), not a live-ticking clock; enable the Timeline's own auto-play if you want continuous motion. `TimelineWidget` ignores the `placement` prop and always renders full-width at the bottom, regardless of what's selected.

Demo data: [deck.gl-data](https://github.com/visgl/deck.gl-data) (BART, SF bike parking), terrestris OSM WMS, and IGN Géoplateforme WFS (French regions).
