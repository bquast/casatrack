# CasaTrack

A 3D progress tracker for a house construction in Costa Rica. It runs in the browser, with no build step and no server.

- **Orbit view:** the house at each date, with a timeline slider. You can see it with real materials, by status (done, in progress, late) or by phase.
- **Walk-through:** a site worker with a hard hat. You can walk the site, the stairs and the rooms.
- **Meta Quest 3:** VR at life size or as a tabletop model, and AR (passthrough) with the model on your real table.
- **Progress report:** % complete, earned value, schedule slip (earned schedule), S-curve, phases, late items, next 14 days. You can print it or save it as a PDF.
- **Photo pins:** site photos at the position and date where you took them.
- **Copilot:** a second device (for example a MacBook) sees along with the Quest and changes the date and the view.

The demo project is a two-storey free-standing house in a condominio (lot 12 × 22 m, house 9 × 11 m, about 190 m²). It has concrete block walls (mampostería integral), a concrete second floor slab (entrepiso), a hip roof with steel structure and lámina, and perimeter walls (tapias). The demo is 120 days into the work, and rain made it 16 days late. All the names, dates and costs in the demo are examples.

## Files

| File | Contents |
|---|---|
| `index.html`, `style.css` | the page |
| `app.js` | the main file: state, panels, photos, report, VR menu, copilot link |
| `model.js` | element types, stages, phases, and the demo house with its schedule and costs |
| `progress.js` | the state of each stage at a date, earned value, slip, report lists |
| `scene.js` | materials, meshes, site, collision |
| `walk.js` | the walk-through and the character |
| `xr.js` | VR and AR on the Quest |
| `report.js` | report panel, S-curve, print page |
| `store.js` | browser storage (IndexedDB) |
| `copilot.js` | the copilot link (same file as in `ski`, with PeerJS and a QR encoder) |
| `three.module.js`, `three.core.js`, `OrbitControls.js`, `BufferGeometryUtils.js` | three.js r187 (ESM, local files) |

## Deploy

1. Make a repo, for example `casatrack`, with the files in the root, on branch `master`.
2. In the repo settings, set Pages to deploy from the branch `master`, folder `/ (root)`.
3. Open `https://<user>.github.io/casatrack/`. WebXR needs HTTPS, and GitHub Pages gives HTTPS.

To test on your computer: `python3 -m http.server` in the folder, then open `http://localhost:8000`. A `file://` address does not work, because the browser does not load modules from it.

## How to use

**Timeline:** drag the slider, or use `−7`, `+7`, `Today` and `▶`. Keys: `[` and `]` = one week, `,` and `.` = one day, `T` = today, `Space` = play.
- **Actual:** actual dates up to today. After today it shows a forecast (planned dates + the current slip).
- **Planned:** the planned dates.

**Elements:** click an element in the view (Shift-click selects more than one), or find it in the Elements tab. Each stage has planned and actual dates. `Started today` and `Done today` set the actual date. With more than one element selected, you can set the dates of one stage for all of them. X-ray shows the parts that are not built yet, so that you can click them.

**Photos:** move the view to where you took the photo, then push `Add photos`. The photo gets the position of the view, and the file date as its date. You can change the date, the note and the position. `Snapshot of this view` makes a photo from the 3D view.

**Walk:** `W A S D` or the arrows to walk, `Shift` to run, `Space` to jump, `V` = first or third person, `R` = back to the street, `Q` = back to orbit. Click the view to look with the mouse (`Esc` releases the mouse), and click again to select the element at the centre.

**VR (Quest 3):** push `VR` in the Quest browser.
- **Right stick forward:** aim the teleport arc. Release the stick to teleport. Floors and stairs follow you.
- **Right stick left or right:** turn 30°.
- **Left stick:** smooth walk, only if `SMOOTH WALK` is on in the menu. It is off for comfort.
- **Menu:** a tablet on your left hand. Point at it with the right hand and pull the trigger. `Y` shows or hides the menu, `X` = today.
- **Trigger on an element:** an info card with its stages, and `NEXT STAGE DONE TODAY`.
- **Trigger on a photo pin:** the photo, and `GO THERE`.
- **`B`:** tabletop model. In tabletop mode the right stick turns and scales the model.

**AR (Quest 3):** push `AR`. The house is a tabletop model in your room, with passthrough.

## Data

The project and the photos are in the storage of the browser (IndexedDB) on each device. Nothing goes to a server.
- **Export:** `Project` tab, `Export project file`. You get one JSON file, with the photos in it.
- **Import:** the same tab, `Import project file`. You can move a project between devices this way.
- **Demo:** `Start again with the demo` deletes the project and its photos.

If you clear the site data of the browser, the project is gone. Export a file from time to time.

## Copilot

1. On the MacBook, open the page and push `BE COPILOT` in the panel at the top right. The Mac shows a QR code.
2. On the Quest, scan the QR code (Quick Settings > Camera, or the Camera app). The page opens on the Quest and connects.
3. The Quest (pilot) sends its project and photos to the Mac. The Mac shows them and does not save them.
4. On the Mac:
   - **Option lines and keys `1` to `9`:** change the date, play, colour, data, what to show, X-ray and tabletop on the Quest.
   - **`C`:** the view of the pilot (head or walk camera), or a free orbit view with the pilot as a hard hat.
   - **Click an element:** the element shows in magenta on the Quest and on the Mac, so that you can point at things.
   - **Project tab, `Send the project of this device to the pilot`:** the Quest takes the project of the Mac. It keeps its old project as a backup in its storage.

The free PeerJS cloud server helps the two devices to find each other. After that the data goes directly between the devices with WebRTC. `?peer=host:port` in the address uses your own PeerServer.

## Your own house

The tracker draws the elements in `model.js`. For your own house, change the floor plans (`GF_WALLS`, `UF_WALLS`, the openings, the columns and the roof) and the schedule (`GROUPS`) in `demoProject()`. Then push `Start again with the demo`. The page has no editor for geometry.
