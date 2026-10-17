# LocalRoute landing assets

## AI brand artwork

- File: `brand-journey.png`, 1536 × 1024.
- Generated with the built-in image_gen tool on 2026-10-17 at the user's request.
- Conceptual brand illustration only: no actual venue, restaurant, navigation route or generated review. The landing caption explicitly identifies it as AI-generated artwork.
- Image uses the LocalRoute blue palette and represents a folded itinerary, a route ribbon, pins and coffee. It is not used as a place photograph.
- Original generation was copied unchanged into this project as PNG. `brand-journey.webp` is a browser delivery encoding (quality 84, same dimensions); the depicted content was not edited. No new dependencies or external API credentials were used.

Final generation prompt:

> Use case: ads-marketing. Asset type: premium Korean travel-planner website editorial illustration, landscape 3:2, high resolution. Create a sophisticated tactile 3D paper-and-ceramic still life representing an unhurried day of travel: an elegant folded ivory travel itinerary/map with a winding cobalt-blue route ribbon and three small sculptural map pins, a simple espresso cup, tiny soft-green paper trees, one abstract curved arch suggesting discovery. The objects form one flowing composition on a warm very pale blue/ivory seamless studio surface. Calm sunlight, refined shadows, beautiful subtle paper texture, art-directed like a premium travel magazine cover with a modern product brand sensibility. Palette anchored in LocalRoute cobalt #2563eb, ivory, pale sky blue, restrained sage green and a warm coffee accent. Composition predominantly central/right with gentle negative space, clearly an illustration, visually rich and inviting but clean, no text whatsoever, no letters, no numbers, no app interface, no device mockup, no logo, no people, no stars or ratings, no actual restaurant, no real-world identifiable building or landmark, no photographs of venues. This is a conceptual brand illustration, not an actual map or route. Do not generate any words or captions.

## Actual browser captures

- `discover-screen.png`: 780 × 1688, actual Korean LocalRoute UI at 390 CSS px and deviceScaleFactor 2. Source: `artifacts/launch-captures/raw/discover-ko-390.png`.
- `login-screen.png`: 780 × 1688, actual Korean LocalRoute email login UI at 390 CSS px and deviceScaleFactor 2. Source: `artifacts/launch-captures/raw/login-ko-390.png`.
- Captures were taken locally with the existing app and source-based initial place records served by an in-memory GET fixture. They do not assert production DB publication or availability.
- Auth was mocked as signed out, with email requests disabled. No user account, reservation, generated personalized itinerary, LP transaction or production data was created.
- Raster captures are placed inside HTML device frames; their text and UI were not synthesized by AI. The original screen files were copied unchanged.
- `discover-screen.webp` and `login-screen.webp` are lossless browser-delivery encodings of those original PNG captures. All three web-delivery images total approximately 384 KiB, are lazy loaded below the first screen, and declare their dimensions to reserve layout space.

Photographs visible inside the discovery capture retain their individual licenses and are operator-source imagery, separate from contributor photographs:

| Place                           | Credit                                      | License                                                         | Original                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seoul Forest                    | Christian Bolz                              | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Seoul_Forest_%EC%84%9C%EC%9A%B8%EC%88%B2.jpg)                                                                        |
| Jungangtap pagoda base          | 문화재청 / Cultural Heritage Administration | [KOGL Type 1](https://www.kogl.or.kr/info/licenseType1.do)      | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%EC%A4%91%EC%9B%90_%ED%83%91%ED%8F%89%EB%A6%AC_%EC%B9%A0%EC%B8%B5%EC%84%9D%ED%83%91_%EA%B8%B0%EB%8B%A8%EB%B6%80.jpg) |
| Hwalok Cave (partially visible) | Dittwjfsdgkvkdjg                            | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:CH-JC0234.jpg)                                                                                                       |

Credits and license links are retained in the captured UI and repeated in the landing page's expandable credits. The source photographs remain under their own licenses; ShareAlike requirements apply to adaptations of the corresponding photographs. No photographer or institution is claimed to endorse LocalRoute. Full original file verification metadata is in `scripts/data/verified-place-photos.json` and `public/place-source-photos/ATTRIBUTION.md`.
