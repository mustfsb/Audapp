# Audapp UI Polish Design

**Date:** 2026-05-30

**Goal:** Simplify the existing Audapp Phase 1 UI so it feels like a serious shadcn-based Windows utility app: minimal, readable, calm, and desktop-focused.

## Scope

This pass is UI polish only.

- No product structure changes
- No navigation changes
- No mock data model changes
- No Tauri command behavior changes
- No audio engine logic
- No backend architecture changes
- No extra state library

The only functional addition is a lightweight persisted theme toggle using `localStorage` and the `dark` class on `document.documentElement`.

## Visual Direction

Use strict shadcn normalization rather than preserving the current more decorative prototype styling.

### Global system changes

- Replace `Raleway` as the primary typeface with a neutral Windows/system-style sans stack.
- Use calmer typography for both headings and body text.
- Dark mode background should be pure or effectively pure black.
- Light mode background should be pure or effectively pure white.
- Remove all gradients and decorative overlays.
- Reduce global radius to roughly `0.35rem`.
- Reduce shadows, border intensity, badge emphasis, and tinted surfaces.

### Design intent

The app should feel:

- shadcn-native
- minimal
- serious
- readable
- desktop-utility focused

It should not feel like a branded dashboard, a futuristic audio visualizer, or a marketing UI.

## Shell Simplification

### Sidebar

- Keep the same navigation structure.
- Flatten the background treatment.
- Reduce icon framing and oversized containers.
- Tighten vertical spacing.
- Keep branding visible but more restrained.

### Topbar

- Keep search, status, and quick actions.
- Add a visible theme toggle.
- Reduce the number of strong pills and outlined chips.
- Make the frame calmer and less visually segmented.

### App frame

- Remove background overlay layers from the shell.
- Let the app read as one clean desktop surface.
- Use subtle separation between sidebar, topbar, and content area rather than decorative contrast.

## Page Simplification

### Dashboard

- Keep the current section structure.
- Flatten CPU/audio metric presentation inside the main card.
- Simplify warnings and status rows.
- Remove mini-card feeling inside larger cards.

### Mixer

- Keep one clear card per channel strip.
- Simplify internals so meter, output, and actions read as stacked controls rather than nested framed blocks.

### Apps

- Keep one clear card per app session.
- Replace boxed route treatment with simpler aligned rows.

### Devices

- Keep one card per device group.
- Make device entries feel like compact list items rather than nested cards.

### Equalizer

- Keep the two main panels.
- Turn EQ bands into compact control cells rather than mini cards.

### Noise Suppression

- Keep the two-column structure.
- Simplify the preview surface and remove decorative framing where possible.

### Profiles

- Keep profile cards.
- Reduce active-state emphasis.
- Simplify the action row.

### Settings

- Keep grouped settings.
- Reduce inner boxed treatments and let layout rely more on spacing and separators.

## Component Strategy

Prioritize cleanup in shared primitives first, then focused page-level reductions.

### Shared primitives likely to change

- `src/index.css`
- `src/main.tsx`
- `src/app/App.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/layout/topbar.tsx`
- `src/components/layout/section-header.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/dropdown-menu.tsx`

### Theme implementation

- Store theme as local UI state with a small helper.
- Persist to `localStorage`.
- Apply the current theme by toggling the `dark` class on `document.documentElement`.
- No new dependency such as `next-themes`.

## Verification

Run:

- `npm run build`
- `npm run tauri dev`

Manual checks:

- Theme toggle is visible and persistent.
- Dark mode background is effectively black.
- Light mode background is effectively white.
- All existing pages still render and navigate correctly.
- The UI no longer reads as gradient-heavy or over-nested.
- No new fake audio functionality is implied.

## Constraints

- Keep the current information architecture.
- Do not overcomplicate the redesign.
- Make the smallest clean set of changes that achieves the approved visual direction.
