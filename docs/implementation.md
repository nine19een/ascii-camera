# Implementation notes

**English** · [简体中文](implementation.zh-CN.md)

This document describes the browser rendering and export pipeline, its limits and the development checks. For product features and local setup, see the [README](../README.md).

## Frame sources and rendering

The camera and demo implement a shared `FrameSource` interface containing the current image, dimensions and readiness. One main rendering loop consumes the active source. Camera frames use `requestVideoFrameCallback` when available, with `requestAnimationFrame` as a fallback; the demo uses `requestAnimationFrame` capped at 30 fps.

The renderer samples the image into a `columns × rows` canvas. Rows follow the source aspect ratio and measured glyph advance, preserving image proportions. Mirroring happens during image sampling, so the glyphs themselves stay readable. Freeze keeps a source frame for further adjustment; compare draws both sides from the same frame.

Each cell receives a BT.601 luminance value. Automatic levels use smoothed 2nd / 98th histogram percentiles; manual contrast and brightness follow those levels. Lookup tables map the resulting tones to characters and colors. Mono draws one text string per row. Color and Palette tint a white text layer through `source-in`; palette colors use a cached 256-entry OKLCH gradient.

Character ramps run from dark to light. Binary and Matrix digits are sorted by measured ink coverage, with a space for the darkest step. Custom ramps accept 2–64 valid characters; unsupported or wide glyphs, duplicates and control characters are filtered. An invalid ramp leaves the last valid one active. Blocks uses Unicode block elements, whose alignment depends on the system font.

The six preset previews share one demo video decoder. Each preview tick downsamples the current frame once into a shared 240 × 135 canvas. Preview renderers use 40% of each preset's column count and normally run at 10 fps, reducing to 4 fps under load. Off-screen cards and background tabs pause previews. Preset values are defined in [presets.ts](../src/ascii/presets.ts).

## Camera and interface lifecycle

Start, stop, errors, unmount and page exit advance a session number. Asynchronous camera operations check it after each await, releasing streams from obsolete requests. A device switch opens the new camera before releasing the old one; drivers that cannot open both trigger a release-and-retry path, with restoration of the original device if possible. Ended tracks outside a device switch return the view to the demo.

iOS can end the previous track while opening another camera, as documented in [WebKit's camera concurrency discussion](https://bugs.webkit.org/show_bug.cgi?id=264288). The switch keeps a reference to that previous stream so its `ended` event cannot invalidate the replacement request; events from a replaced stream are also ignored. If the request fails after the old stream has ended, the release/retry/restore path runs even when the error normally means an unavailable device. Device selection uses the enumerated `deviceId` with an exact constraint; the default start prefers `facingMode: user`, without combining conflicting facing and device constraints. Physical and combined lens availability remains browser- and device-dependent.

React manages interface and low-frequency state. Settings reach the renderer through refs; language changes update text without replacing the active camera or recorder. Camera frames and the demo share the same compare, freeze and export paths.

## Capture and recording

PNG uses the final canvas at its current pixel size. The capture request keeps its dimensions, and a generation check prevents a late image callback from creating a download after page cleanup.

Video uses a separate recording canvas with even dimensions, capped at 1920 × 1080. Its size is fixed when recording starts; resizing, fullscreen or source changes scale the picture to fit, with black bars where needed. The target timeline is 30 fps, using `captureStream(0)` and explicit `requestFrame()` submissions, with timed capture as a fallback. Browser scheduling and encoding load can still cause frame delays.

MediaRecorder provides MP4 / H.264 or WebM / VP9, with VP8 and browser defaults among the supported-format fallbacks. Estimated video bitrate ranges from 2.5 to 12 Mbps. There is no audio. Video and GIF recording are mutually exclusive, and camera device switching is locked during recording.

### Container finalization

The finalizers handle this app's single-video-track recordings, rather than arbitrary media conversion. Encoded samples are preserved without re-encoding.

- **MP4:** fragmented output becomes `ftyp | moov | mdat`. The finalizer preserves codec configuration and reconstructs timing, sample locations and sync-sample tables. It checks box boundaries, field counts, integer ranges and that sample data lies inside real `mdat` payloads. Ordinary MP4 files can pass through unchanged.
- **WebM:** the finalizer writes known Segment / Cluster sizes, Duration, SeekHead and Cues. Cluster payloads remain unchanged; cues point to clusters beginning with keyframes. Invalid lengths, time scales and timestamps reject the rewrite.

If finalization fails, the app returns the original recording with a localized warning about duration and seeking. This preserves the available data; it cannot repair a damaged source recording. MP4 assembles media slices without reading the entire payload into memory. WebM reads the whole file, with peak memory roughly 2–3 times its size. Prefer MP4 for long recordings; if the browser terminates the tab under memory pressure, fallback delivery cannot be guaranteed.

### GIF and cleanup

GIF samples at 10 fps, up to 10 seconds and 640 px wide, with a 256-color palette per frame. Transferable pixel buffers go to a Web Worker for encoding. The main thread retains one pending frame to calculate its delay; queued Worker messages can still accumulate on slower devices.

Completion, cancellation, errors and page exit clean up recording resources and terminate the Worker. Screenshot Blob URLs are released shortly after download; video and GIF URLs remain until replaced, dismissed or cleaned up on page exit.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/ascii/` | Renderer, glyph metrics, character ramps, palettes and presets |
| `src/camera/`, `src/media/`, `src/demo/` | Camera lifecycle, shared frame interface and demo source |
| `src/presets/` | Shared live preset previews |
| `src/export/` | Capture, recorders, container finalizers and GIF Worker |
| `src/hooks/`, `src/components/`, `src/i18n/` | Interface lifecycle, controls and translations |
| `tests/` | MP4 / WebM tests and recorded fixtures |
| `tools/audit/` | Browser, media and third-party distribution checks |
| `public/vendor/` | Corresponding third-party source, licenses and notices |

## Development checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
node tools/audit/verify-third-party.mjs
```

Unit tests use Chrome MediaRecorder fixtures and independent parsers to check output structure, preserved encoded bytes, timestamps, seek indexes, repeat finalization and corrupted-input fallback. The fixture coverage is single-track H.264 / VP9, not every browser's container variant.

The [local verification guide (Chinese)](../tools/audit/README.md) covers production-build browser checks, synthetic cameras, FFmpeg decoding and seeking, and third-party source verification. Desktop automation and simulated mobile layouts do not establish real-device camera or photo-album compatibility. Use the [local HTTPS guide (Chinese)](mobile-testing.zh-CN.md) for device testing.
