# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vue 3, TypeScript, Vite, and CesiumJS example library.

- `src/examples/<category>/<example>/index.vue` contains runnable examples. Every category and example directory must include a `config.json`; `src/examples/config.ts` discovers them and creates routes automatically.
- `src/cesium/tools/` contains reusable Cesium primitives and layer managers.
- `src/cesium/dem/` contains DEM parsing, raster, color-ramp, and imagery-provider code.
- `src/views/` and `src/router/` implement the example browser and routing.
- `public/` stores files served without transformation, including models, textures, icons, and sample DEM data.
- `src/assets/` stores assets imported by application modules. `dist/` and `node_modules/` are generated and must not be edited.

## Build, Test, and Development Commands

Use pnpm because `pnpm-lock.yaml` is committed.

```bash
pnpm install       # install exact dependency versions
pnpm dev           # start the Vite development server
pnpm build         # run vue-tsc, then create a production bundle
pnpm preview       # serve the production bundle locally
```

There is currently no automated test command. Before submitting changes, run `pnpm build` and manually open every affected route, for example `/examples/primitive/circle-text`. Verify rendering, camera interaction, cleanup after navigation, and browser-console output.

## Coding Style & Naming Conventions

Use two-space indentation and TypeScript for application logic. Keep strict compiler checks clean, including unused locals and parameters. Use `pnpm lint` to run Oxlint for script rules followed by ESLint with `eslint-plugin-vue` on `.vue` files for remaining Vue rules and `@html-eslint/eslint-plugin` on `.html` files for HTML checks, and `pnpm lint:strict` to reject warnings. Standalone JS/TS files must not be parsed by ESLint; keep the CLI glob, ESLint global ignores, and editor validation limited accordingly. Configure script rules in `.oxlintrc.json` and Vue/HTML rules in `eslint.config.js`, with each plugin scoped to its own file extension. Run `pnpm lint:html` for HTML-only checks. Keep `eslint-plugin-oxlint` last in the ESLint config and derive disabled rules from the actual Oxlint configuration to avoid duplicate checks without losing coverage. Use `pnpm format` / `pnpm format:check` for Oxfmt formatting. Root configurations apply to workspace packages too. Oxfmt uses double quotes, semicolons, and an 80-column print width. Keep formatting rules and Vue 2-only rules disabled. `vue-tsc` remains responsible for Vue template type checking.

Use PascalCase for classes and reusable Vue components (`CircleTextPrimitive`), camelCase for functions and variables, and kebab-case for example directories (`local-dem`). Keep Cesium resource ownership explicit: remove event listeners and destroy primitives, viewers, textures, or layers during teardown.

## Adding Examples

Create both `index.vue` and `config.json` under a two-level category path. Keep example-specific UI and setup in the example, while moving reusable rendering logic into `src/cesium/`. Do not hard-code credentials; document required tokens or service URLs and prefer environment variables for secrets.

## Local Globe Basemap

Every Cesium example must use `createLocalWorldBaseLayers` from `src/cesium/tools/localWorldImagery.ts` as its globe base map. The helper displays Cesium's two bundled NaturalEarthII level-zero hemisphere images with `SingleTileImageryProvider`, so navigation never starts a tile pyramid or contacts an external map or terrain service. Do not use remote imagery services, URL/TMS/WMTS tile providers, Cesium ion world imagery or online terrain providers in examples. Examples may add local or in-memory analytical overlays, such as the DEM imagery layer, above this base map.

## Shared Viewer Configuration

Every Cesium example must call `applyDefaultViewerConfig` from `src/cesium/tools/viewerConfig.ts` immediately after creating its `Viewer`. The shared defaults use right-button drag for globe rotation and reserve wheel/pinch for zoom. An example that needs different controls may pass overrides to the helper or reassign `screenSpaceCameraController` properties afterward.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout, so no existing commit convention can be verified. Prefer concise Conventional Commit messages such as `feat(primitive): add editable circle labels`. Pull requests should describe behavior changes, list affected routes, include screenshots or recordings for visual changes, mention external data/API requirements, and confirm `pnpm build` succeeds.
