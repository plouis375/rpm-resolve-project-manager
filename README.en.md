<p align="center">
  <img src="docs/banner-v2.svg" alt="RPM - Resolve Project Manager" width="100%">
</p>

<p align="center">
  <a href="README.md">Français</a> · <b>English</b>
</p>

<p align="center">
  <a href="https://github.com/plouis375/rpm-resolve-project-manager/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/plouis375/rpm-resolve-project-manager?style=flat-square&color=f0822a&labelColor=242424&label=version"></a>
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Intel%20%26%20Apple%20Silicon-ededed?style=flat-square&logo=apple&logoColor=ededed&labelColor=242424">
  <img alt="DaVinci Resolve Studio" src="https://img.shields.io/badge/DaVinci%20Resolve%20Studio-21.1-ededed?style=flat-square&labelColor=242424">
  <img alt="Interface language" src="https://img.shields.io/badge/interface-fran%C3%A7ais%20%C2%B7%20English-ededed?style=flat-square&labelColor=242424">
</p>

<h3 align="center">From memory card to timeline, in four steps.</h3>

<p align="center">
  An assistant for <strong>DaVinci Resolve Studio</strong> that creates the project, sorts rushes by camera and by day,<br>
  applies the right Color Space Transform and prepares the assembly timeline. Then it gets out of the way.
</p>

<p align="center">
  <a href="https://github.com/plouis375/rpm-resolve-project-manager/releases/latest"><img alt="Download for macOS" src="https://img.shields.io/badge/Download%20for%20macOS-.pkg-f0822a?style=for-the-badge&logo=apple&logoColor=161616&labelColor=f0822a&color=161616"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#cst">CST</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="CHANGELOG.md">Changelog (French)</a>
</p>

<br>

<p align="center">
  <img src="docs/screenshots/02-sources.png" alt="Sources step: rushes are sorted by brand, model and date, with their color profile (screenshot of the French interface)" width="92%">
</p>

<br>

## ✦ What it does

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>🗂️ Automatic sorting</h4>
      Rushes are filed by <b>brand</b>, <b>model</b> and <b>shooting date</b>, read from the metadata and from Canon and Sony sidecar XML files.
    </td>
    <td width="33%" valign="top">
      <h4>🔍 Source analysis</h4>
      Recognized media, duration, size, alerts. <b>Probable duplicates</b> are spotted, then confirmed by SHA-256 fingerprint when needed.
    </td>
    <td width="33%" valign="top">
      <h4>🎬 Project ready to edit</h4>
      Project, bins and imports are created in Resolve, with a <b>final report</b> of what was imported and what needs checking.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <h4>🎞️ Assembly timelines</h4>
      Adjustable or automatic resolution and frame rate, plus timelines <b>per camera</b> or <b>per day</b> if you want them.
    </td>
    <td width="33%" valign="top">
      <h4>🎨 Color Space Transform</h4>
      A CST node on each shot based on its detected <b>log profile</b>: S-Log3, Canon Log 2, Canon Log 3. Rec.709-A or Gamma 2.4 output.
    </td>
    <td width="33%" valign="top">
      <h4>⚡ Proxies</h4>
      Source folders are handed to <b>Blackmagic Proxy Generator</b>, which writes proxies next to the media.
    </td>
  </tr>
</table>

> [!NOTE]
> RPM works **inside Resolve only**: it does not create Finder folders, does not move or copy sources, and never modifies or deletes the original files.

<a id="installation"></a>

## ⬇️ Installation

| Step | |
|---|---|
| **1. Download** | Get the `.pkg` file from the [latest release](https://github.com/plouis375/rpm-resolve-project-manager/releases/latest). |
| **2. Install** | Quit DaVinci Resolve, then open the `.pkg`. The installer asks for your administrator password to copy the plugin into Resolve's shared folder. |
| **3. Allow** | If macOS blocks the package, open **System Settings → Privacy & Security** and choose **Open Anyway**. |
| **4. Launch** | Reopen Resolve: **Workspace → Workflow Integrations → RPM - Resolve Project Manager**. |

> [!IMPORTANT]
> The package is neither signed nor notarized (no Apple developer account), hence step 3. After an update, **restart Resolve** before opening the plugin.

<details>
<summary><b>Requirements</b></summary>
<br>

- macOS and DaVinci Resolve Studio. Tested with **Resolve Studio 21.1.1**; other versions may behave differently.
- An accessible Resolve project library.
- Source media reachable from this Mac (local disk or mounted volume).
- `ffprobe` is included, universal for Intel and Apple Silicon. If it cannot run, the plugin falls back to a partial analysis with Spotlight.

</details>

<details>
<summary><b>Language</b></summary>
<br>

The interface is available in **French and English**. It opens in French by default; switch to English with the **Language** list on the first step (the choice is remembered).

</details>

<details>
<summary><b>Updating and uninstalling</b></summary>
<br>

- A timestamped backup of the previous version is kept in `.backups`, in Resolve's integrations folder.
- **Uninstall**: button at the bottom of the plugin's first step, then restart Resolve. Projects and media are not deleted.

</details>

<a id="usage"></a>

## 🧭 In four steps

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/01-projet.png" alt="Project step">
      <h4>01 · Project</h4>
      Enter the project name. It is created in the library and folder currently selected in Resolve.
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/02-sources.png" alt="Sources step">
      <h4>02 · Sources</h4>
      Add one or more folders (subfolders included). Search, reclassify or exclude a file. <b>Refresh</b> picks up new media while keeping your corrections.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/03-organisation.png" alt="Organization step">
      <h4>03 · Organization</h4>
      Rename, add or remove bins and set up the timeline. A preview shows the final folder tree. Save your structure for future projects.
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/04-termine.png" alt="Done step">
      <h4>04 · Done</h4>
      The project is created and the media imported. The report sums it all up, and the final button opens the <b>Edit</b> page while closing the assistant.
    </td>
  </tr>
</table>

*Screenshots show the French interface.*

## 🗂️ Structure created in Resolve

```text
Project name
├── Rushes
│   └── Camera brand
│       └── Model
│           └── Shooting date
├── Sound
├── Assets
├── Elements
├── Sequences
├── Music
└── Exports
```

Other media types go straight into their bin. The structure can be edited before creation: **Save as preferred structure** keeps it on this Mac, **Reset to the base template** erases it. (Bin names follow the interface language; a structure you saved keeps your own names.)

For the shooting date, the plugin reads the metadata, falling back to the file creation date (flagged in the analysis). The Organization step can also suggest **merging similar camera names**; nothing changes until you click **Merge**.

## 🎞️ Assembly timeline

Optional: Resolve creates `Project name — Assembly` in the Sequences bin, with the kept rushes end to end.

| Setting | Choices |
|---|---|
| **Resolution** | HD, Full HD, 2K/4K DCI, Ultra HD, vertical or square |
| **Frame rate** | 23.976 to 60 fps |
| **Automatic** | most common rush format, otherwise 1920 × 1080 at 24 fps |
| **Shot order** | timecode (all cameras together), recording time, or by camera |
| **Extra timelines** | one per camera and/or one per shooting day |

It is a starting point: the timeline does not cut shots or pick takes. Shots are sorted day by day; a shot without timecode is placed by its recording time.

## 🎙️ Audio sync

With **Sync separately recorded audio**, Resolve matches the kept **WAV and AIFF** files to the rushes of the same shooting day, right after import:

| Mode | When to use it |
|---|---|
| **Timecode** | recorder and cameras jammed to the same timecode on set |
| **Waveform** | no common timecode, but audible scratch audio on the cameras |

Camera audio is kept, and assembly timelines use the synced audio. Sync runs day by day, because a time-of-day timecode repeats from one day to the next. A recorder file's date comes from its BWF metadata, otherwise from its creation date. It can be corrected in the Sources step, and WAV and AIFF files go by default into the **Sound** bin (MP3 and other formats stay in Music). The final report lists the days Resolve did not confirm.

## 🎬 Multicam clips

With **Create one multicam clip per day**, each shooting day with at least two rushes gets a multicam clip in Sequences: one angle per file, aligned by timecode or waveform according to the “Sync by” setting. Audio that was already synced follows the shots.

## 🎨 Clip color per camera

With **Color clips by camera**, each rush gets a Resolve clip color based on its camera. The color only depends on brand and model: an FX3 keeps the same color from one project to the next. Two cameras can end up with the same color, since Resolve only offers 16.

## 🎛️ Project color management

Next to the CST node, the **Project color management** method switches the project to *DaVinci YRGB Color Managed* (automatic color management on, SDR mode, SDR Rec.709 output) and sets each clip's input color space from its color profile. It is almost instant, applies to every timeline and does not require creating one. Clips or settings Resolve refuses are listed in the report.

## ⚙️ Project settings preset

If you saved project settings presets in Resolve, a list offers them in the Organization step. The preset is applied to the new project before the timeline format and color management chosen in the assistant, which therefore have the last word.

## 🔗 Existing proxies

If a rush already has a proxy in a neighboring `proxy` subfolder (same file name, any video extension), it is linked to the shot automatically after import. The final report counts the linked proxies. This avoids regenerating proxies that already exist.

## 📄 Exported report

In the Done step, **Export the report** saves a TXT or CSV file: status of each file, shots without CST, days whose sync is not confirmed, items refused by Resolve and technical warnings. The CSV opens directly in Excel.

## 🔔 Updates

On launch, a discreet banner tells you when a newer version is published on GitHub. Nothing is downloaded or installed automatically, and the plugin stays silent when offline.

<a id="cst"></a>

## 🎨 Color Space Transform

With **Apply a Color Space Transform**, each shot gets a CST node based on its color profile, detected shot by shot in the Sources step (**Color profile** column) and editable by hand.

| Cameras | Input profile |
|---|---|
| Sony FX3 · FX30 · FX6 · FX9 · Burano · A7S III · A7 IV · A1 · A7R V · ZV-E1 · FR7 | S-Gamut3.Cine / S-Log3 |
| Canon C50 · C70 | Cinema Gamut / Canon Log 2 |
| Canon R5 | Cinema Gamut / Canon Log 3 |

Ten other profiles can be chosen by hand in the **Color profile** column: Panasonic V-Log, Fujifilm F-Log and F-Log2, Nikon N-Log, DJI D-Log, Apple Log, ARRI LogC3 and LogC4, RED Log3G10, Blackmagic Film Gen 5. They have no `.drx` preset and need the **Project color management** method.

**Output**: Rec.709-A (viewing on Mac) or Rec.709 Gamma 2.4 (broadcast).

> [!TIP]
> For Sony cameras, the gamma recorded in the sidecar XML takes precedence over the model: an S-Log3 shot gets the CST, a Rec.709, HLG or S-Cinetone shot does not. Another log (S-Log2, for example) has no preset: pick its profile by hand.

Shots without a profile stay ungraded and are listed in the report. With many rushes, this step can be long.

## ⚡ Proxies with Blackmagic Proxy Generator

Tick **Prepare proxy generation** in the Organization step. The closing guide adds the source folders to Blackmagic Proxy Generator's watch list, then opens the application (close it first if it is already open). Proxies are written to `proxy` subfolders next to the media, and Resolve links them to their originals.

> [!WARNING]
> Blackmagic documents no API for this: the plugin edits the generator's preferences file. A format change on Blackmagic's side could require a plugin update.

## 🔁 Duplicates and alerts

- Probable duplicates are spotted by **name, size and duration**. Later copies are excluded by default and can be included again.
- **Compare the content of probable duplicates** computes a SHA-256 fingerprint on the suspect groups only. Reading entire files can be long for large files.
- Alerts (empty file, analysis unavailable, camera to identify, fallback date, duplicate) can be filtered on the Sources screen and **never block creation**.

<details>
<summary><b>📼 Recognized formats</b></summary>
<br>

| Type | Extensions |
|---|---|
| **Video rushes** | MOV, MP4, M4V, MXF, AVI, MPG/MPEG, MKV, MTS/M2TS, BRAW, R3D, ARI, CRM, 3GP, WEBM |
| **Audio** | WAV, AIF/AIFF, MP3, M4A, AAC, FLAC, OGG, OPUS, WMA |
| **Images** | PNG, JPG/JPEG, TIF/TIFF, BMP, WEBP, HEIC/HEIF, EXR, DPX, DNG, ARW, CR2/CR3, NEF, RAF |
| **Graphic assets** | PSD, AI, EPS, SVG, PDF |
| **Sequences** | FCPXML, EDL, AAF, DRT, OTIO, standalone XML |

Hidden files and `Proxy` subfolders are ignored. A Canon (`CLIP.XML`) or Sony (`C0001M01.XML`) sidecar XML paired with a video serves as its metadata sheet: it does not show up as a sequence.

</details>

<details>
<summary><b>🚫 Out of scope</b></summary>
<br>

- Project archiving.
- Creating Finder folders or backing up media.
- Estimating proxy disk space (see Blackmagic Proxy Generator).
- Export render presets and settings.

</details>

<a id="troubleshooting"></a>

## 🛠️ Troubleshooting

<details>
<summary><b>The plugin does not appear in Workspace</b></summary>
<br>Check the installation, then restart Resolve.
</details>

<details>
<summary><b>Resolve refuses the connection</b></summary>
<br>Quit and reopen Resolve. If it persists, reinstall the latest version.
</details>

<details>
<summary><b>Camera “To identify”</b></summary>
<br>Fix the brand and model in the list before creating the project. Canon XML files are read automatically.
</details>

<details>
<summary><b>A file is not imported</b></summary>
<br>Check the final report, make sure its volume is mounted and that your Resolve version supports the format.
</details>

## 🧑‍💻 Development

<details>
<summary><b>Structure, tests and releases</b></summary>
<br>

- Plugin code: [`plugin/`](plugin/). Sorting logic: [`plugin/lib/media.js`](plugin/lib/media.js). Project creation: [`plugin/lib/create-project.js`](plugin/lib/create-project.js). Translations: [`plugin/i18n/`](plugin/i18n/) (the French text is the key, `en.js` holds the English).
- Tests: `npm test` (Node 20+, no Resolve needed). The rushes in `rush test/` stay local and are not versioned.
- `package.command` (developer only) produces `dist/RPM-Resolve-Project-Manager-vX.Y.Z.pkg`.

**Publishing a version**

1. Update the version in `plugin/package.json` (the build copies it into the manifest and the interface footer), then add an entry to `CHANGELOG.md`.
2. Commit the changes.
3. Run `bash package.command` to build the `.pkg`.
4. Create the tag and the GitHub release with the `.pkg` attached.

</details>

## License

All rights reserved. The code is publicly visible, but reuse, copying and redistribution are not allowed without the author's written permission.

<br>

<p align="center">
  <sub>Made for editors who would rather edit than tidy up.</sub>
</p>
