# WildScope — demo video script (2 min 45 s)

**Status: not recorded.** This is the script and shot list. Nothing in this file implies a video exists.

Every number below was seen on the live site on 2026-11-01. Live GBIF counts change daily, so read
the numbers from the screen while recording rather than from this script.

## Setup before recording

- Browser at 1920×1080 or 1440×900, full screen, no extensions, notifications off.
- Open https://d2za8aq0bl0uib.cloudfront.net once beforehand so CloudFront and the GBIF image cache are
  warm (first photo requests can be slow).
- Have these links ready in tabs (each opens straight into the view):
  - Lahore birds: `https://d2za8aq0bl0uib.cloudfront.net/?group=birds&cam=31.52,74.34,45000`
  - London: `https://d2za8aq0bl0uib.cloudfront.net/?cam=51.5,-0.12,60000`
  - London 1990s: `https://d2za8aq0bl0uib.cloudfront.net/?bin=B05&cam=51.5,-0.12,60000`
- In dense areas GBIF can take up to ~30 s to return totals: wait for the status bar to show
  "… records in view" before talking about it, or cut the wait in editing.

## Shot list and narration

| # | Time | Screen | Narration |
|---|---|---|---|
| 1 | 0:00–0:15 | Opening screen "Where life has been recorded.", globe descends | "GBIF holds billions of animal records, and a snapshot of them sits in the Registry of Open Data on AWS: 303 gigabytes of Parquet. WildScope turns it into a globe you can explore, from the planet down to a single observation." |
| 2 | 0:15–0:35 | Global view; point at the legend and the status bar | "At global scale, each hexagon is an H3 cell of about 87,000 square kilometres, counted from the snapshot. The colour shows recorded occurrences, not abundance: records follow observers, not animals. The bar at the top always says what you're looking at and where it comes from." |
| 3 | 0:35–0:55 | Zoom to Europe (regional cells), then click **Birds** in the group list, then **All** | "Zoom in and the cells shrink to about 1,770 square kilometres. Every layer can be filtered by group: mammals, birds, reptiles, amphibians, fishes, insects, other invertebrates." |
| 4 | 0:55–1:20 | Lahore birds link: clusters and bird points over satellite imagery; read the total from the status bar | "Below 1,200 kilometres the map switches to individual records, fetched live from GBIF with the same licence and quality filters as the snapshot. Here are the birds recorded around Lahore: [read total] records in view. The satellite basemap is Amazon Location Service." |
| 5 | 1:20–1:40 | Click a bird point → record card | "Each point is a real observation: species, date, location and accuracy, who recorded it, the dataset and its licence. Photos appear only when the image itself is licensed for reuse, credited to its creator." |
| 6 | 1:40–2:00 | London link: density dots and clusters; then the 1990s link and **Details** | "In London, every matching record is drawn as a density dot, millions of them, with clickable points on top. Choose the 1990s on the timeline and the records, and the breakdown of top species and IUCN categories, change to that decade." |
| 7 | 2:00–2:15 | Zoom out to regional, click a cell → cell summary; open **Data notes** briefly | "Click any cell for its summary: records, species, datasets, change over time. Data notes lists every filter and how many records it removed, including duplicates." |
| 8 | 2:15–2:35 | Architecture diagram from the README (screen capture of the GitHub page or the Mermaid render) | "Under the hood: a Python and DuckDB pipeline reads the GBIF snapshot from S3, indexes it with H3 and publishes versioned files to S3 behind CloudFront. Amazon Location provides the satellite basemap and, through API Gateway and Lambda, place search. Everything is deployed with CloudFormation." |
| 9 | 2:35–2:45 | Back to the globe, slow rotation | "WildScope shows where people have recorded the world's animals, honestly labelled and open to everyone. Records, not animals, but a powerful place to start." |

## Things not to say

- Do not call cells or extents a "range" or "distribution", and do not say a species "disappeared" or is
  "extinct" from missing records (the app's wording rules).
- Do not present snapshot counts as global totals: the deployed snapshot layers are a sample build.
- Do not mention Trees: that lens is not in this build.
