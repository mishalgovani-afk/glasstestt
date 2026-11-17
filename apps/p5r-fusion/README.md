# P5R Fusion

A Persona 5 Royal reverse fusion calculator in one self-contained HTML page (`index.html`).

- **Reverse Calculator tab**: every persona ranked by level. Open one to see its arcana card, base stats, affinities and skills, then every pair that fuses into it (cheapest first) and everything it fuses into. Every persona name is a link, so you can keep drilling into ingredients; the breadcrumb and the browser Back button walk back up.
- **Fuse Two tab**: pick two personas and see the result.
- **Include DLC personas**: DLC personas change the per-arcana ranking, so all results are recomputed when you toggle it.

Fusion rules (normal, same-arcana down-rank, Treasure Demon, and special fusions) are ported from
[chinhodado/persona5_calculator](https://github.com/chinhodado/persona5_calculator) (Apache-2.0), which is also the data source.

## Rebuilding

```sh
python3 src/convert.py <dir with PersonaDataRoyal.js and Data5Royal.js> src/data.json   # refresh data
python3 src/build.py                                                                     # inline data -> index.html
```

`index.html` is a standalone page; open it directly in a browser or serve it from the splash site.
