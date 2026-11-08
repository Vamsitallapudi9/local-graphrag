# 7. The 3D view

*Code:* `lib/graphData.ts`, `lib/forceSimulation.ts`, `components/GraphVisualizer.tsx`

## Where the data comes from

When a build finishes, GraphRAG's tables (Parquet files) are converted to JSON in `output/`, for example `entities.json`, `relationships.json` and `communities.json`. The browser loads them through `/api/data/<name>`, which only serves a fixed list of allowed files. `lib/graphData.ts` then joins them into one object with entities, relationships and communities.

## How the dots get their places

There is no "correct" position for an idea, so the app uses a **physics simulation** (the `d3-force-3d` library). Think of it like this:

- every dot is a **magnet that pushes** other dots away, so they don't pile up,
- every line is a **spring** that pulls two connected dots together. Stronger relationships pull harder and sit closer,
- dots in the **same community** are gently pulled toward their community's center, which makes visible clusters,
- a soft **sphere rule** puts the most connected ideas near the middle and the less connected ones toward the outside,
- **collision** stops dots from overlapping.

The simulation runs for a while until things calm down. That is why the graph "settles" when it first appears.

## Size and color

| What you see | What it means |
|--------------|---------------|
| **Bigger dot** | More connections (`degree`), and it appears in more chunks (`frequency`) |
| **Red** | Organization |
| **Teal** | Event |
| **Blue** | Person |
| **Green** | Place (GEO) |
| **Line** | A relationship. Click a dot to see its description |

The colors are set in `ENTITY_COLORS` in `lib/forceSimulation.ts`. The size is set by `calculateNodeSize()` in the same file.

## Drawing it

The drawing uses **Three.js** (3D graphics in the browser) through **React Three Fiber** (Three.js written as React components):

- `OrbitControls` lets you rotate, zoom and pan with the mouse,
- a "bloom" effect makes the dots glow,
- `GalaxyBackground.tsx` draws the starry background.

## Using it

| Action | How |
|--------|-----|
| Rotate | Drag |
| Zoom | Scroll |
| Pan | Right-drag |
| See details | Click a dot (opens the **Inspector**) |
| Search | `Cmd/Ctrl + K`, then type a name |
| Clear search | `Cmd/Ctrl + Backspace` |
| See answer sources | Ask a question. Mentioned entities light up |

## Live view while building

During a build, the app converts any finished tables right away. So you can watch dots appear before the build ends. The final, complete graph replaces this view when the build succeeds.

Next: [Code tour](08-code-tour.md)
