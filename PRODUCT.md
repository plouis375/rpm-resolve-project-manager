# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

DaVinci Resolve Studio Workflow Integration plugin, Electron host, vanilla JavaScript and CSS renderer, Blackmagic-signed `WorkflowIntegration.node`, bundled LGPL FFmpeg `ffprobe`, and a macOS Installer package.

## Users

The primary user is a video editor working in DaVinci Resolve Studio on macOS, preparing a project and organizing its source media.

## Product Purpose

RPM - Resolve Project Manager is a temporary, integrated setup assistant for creating and preparing a Resolve project. It guides the editor through project naming, source selection and classification, organization, and optional preparation actions, then closes so the editor can continue in Resolve without keeping the assistant open. Success means the editor starts editing with a useful Media Pool structure and selected media already imported.

## Positioning

The product combines Resolve project setup, guided media classification, and camera-aware rush organization in a focused creation flow. The product name is RPM - Resolve Project Manager.

## Operating Context

- Runs inside DaVinci Resolve Studio on macOS as a Workflow Integration plugin, launched from `Workspace → Workflow Integrations`; the plugin opens in a separate window. The user has Resolve Studio 21.1.1 installed from Blackmagic Design's website.
- Resolve registers the integration under its Workflow Integrations submenu. V1 does not replace or add a choice inside Resolve's native New Project dialog; the user opens the setup assistant from the Workspace menu.
- Example project: “Campagne Nike 2026”.
- Source media stays at its original Finder locations. The product does not create Finder folder structures or copy source media automatically.
- Media Pool bins: Rushs, Assets, Éléments, Séquences, Musiques, Exports.

## Capabilities and Constraints

- Start from the base Media Pool structure, then rename, add, or remove bins per project. Let users explicitly save one preferred structure locally or reset to base; do not add multiple named templates.
- Suggest media classification by type and allow correction before import.
- Organize video rushs as brand → camera model → shooting date. Prefer shooting-date metadata, falling back to file creation date and indicating fallback values.
- Detect likely duplicates by filename, file size, and duration; optionally compare suspicious groups by full SHA-256 content hash and restore distinct files to the import list.
- Allow long media scans and SHA-256 duplicate checks to be cancelled without discarding selected source folders or previously confirmed results.
- Refresh all selected source folders to detect new or removed media while preserving manual classifications and inclusion choices.
- Preview the complete Resolve Media Pool tree before project creation, including Rushs brand, camera model, and shooting date folders.
- Suggest one-at-a-time merges for near-duplicate camera brand or model names; never merge without explicit user action.
- Optionally prepare an “[Project Name] — Assemblage” timeline with retained rushs placed end-to-end. Let users choose resolution and frame rate independently, with each defaulting to the dominant rush format and 1920 × 1080 at 24 fps when no dominant format emerges.
- Offer optional proxy preparation: append selected source folders to Blackmagic Proxy Generator's saved watch-folder list without duplicates, then open the installed app. Preserve existing watched paths and refuse to edit preferences while the generator is running. Format and resolution remain user-controlled; generation may start according to the generator's saved Start setting.
- Before import, group review alerts by empty files, unavailable technical analysis, unidentified camera, fallback file-creation date, and probable duplicates. Alerts remain non-blocking because unavailable metadata analysis does not prove Resolve cannot read a file. The plugin does not estimate proxy storage space; the editor configures and starts proxy generation in Blackmagic Proxy Generator.
- Show media count, total size, formats, identified cameras, and import warnings during setup and on the completion screen.
- Flag files the metadata scanner cannot read so the user can review them before import. A failed metadata scan does not prove Resolve cannot decode a file.
- Create the Exports bin only; do not configure render settings or naming conventions.
- No project archive feature in V1.
- Operations do not require a routine recap confirmation. Classification remains editable before import; optional actions must be clearly visible.
- After project creation and preparation, provide a clear close action so the user can move directly to editing. V1 does not need a persistent project dashboard.
- Validate camera/date metadata and media checks with representative user-supplied footage before claiming reliable behavior.

## Brand Commitments

The user chose a bold graphic-brutalist interface: warm paper surfaces, heavy black rules and type, square controls, hard offset shadows, and a vivid coral action color. Preserve the clear four-step workflow and Resolve terminology. Reserve green and red for meaningful states.

## Evidence on Hand

- The installed Resolve 21.1.1 developer documentation is available on this Mac at `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/`.
- A user-supplied sample of seven Canon EOS C70 MXF clips with paired XML sidecars was scanned. The plugin identified the camera model and filtered the sidecars from the sequence list; the user confirmed the Resolve workflow works after installing the corrected v0.02 package.
- Public macOS releases provide an unsigned, non-notarized graphical `.pkg` installer and a fallback ZIP installer. Packages include the Blackmagic Workflow Integration module and a minimal universal LGPL `ffprobe`, so users do not need to install the Resolve SDK example or Homebrew. The `.pkg` backs up an existing plugin version and validates the installed files, but macOS may show a Gatekeeper warning because there is no Apple Developer ID certificate.
- Other camera brands and media formats have not been systematically validated.

## Product Principles

- Keep the workflow inside Resolve Studio, launched from its Workflow Integrations menu.
- Preserve source-media locations.
- Make automatic classification inspectable and correctable.
- Present import status and errors clearly during setup, then return control to the normal editing workspace.

## Accessibility & Inclusion

No product-specific accessibility requirements have been established yet.
