# content/geo

| File                   | Edited by                        | Purpose                                                          |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `policy.json`          | hand (game-designer + tech-lead) | which Natural Earth units are playable, territories, unplantable |
| `entities.json`        | **generated** (`pnpm geo`)       | playable entities + territories with metadata (data-model §2)    |
| `world-110m.topo.json` | **generated**                    | world view, zoom < ×3                                            |
| `world-50m.topo.json`  | **generated**                    | zoom ≥ ×3 and answer validation                                  |
| `micro-10m.topo.json`  | **generated**                    | micro-states and small territories missing from 50m              |
| `geo-manifest.json`    | **generated**                    | versions, hashes, sizes                                          |

Never edit generated files by hand: change `policy.json` or `tools/geo-pipeline`, run `pnpm geo`, commit the result. CI runs `pnpm geo:check` to prove the committed files match the pipeline output.
