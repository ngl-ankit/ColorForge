# ColorForge

ColorForge turns UI screenshots into actionable, implementation-ready design reports.

## What it does

- Accepts PNG, JPG, and WebP UI references through drag-and-drop or file selection
- Extracts dominant colors, luminance, contrast, image dimensions, and visual regions locally in the browser
- Presents report views for colors, typography, layout, components, responsive behavior, and recreation guidance
- Lets you inspect inferred regions and copy design tokens and implementation snippets
- Exports JSON reports, CSS variables, and Tailwind configuration
- Persists the latest report locally so a refresh does not discard the analysis

## Run locally

```bash
pnpm install
pnpm --filter @workspace/colorforge run dev
```

The app is privacy-first: the first analysis pass runs entirely in the browser and does not require an API key or upload a screenshot to a server.