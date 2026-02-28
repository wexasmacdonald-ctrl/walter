# Web Map Status (Source of Truth)

Last updated: 2026-02-25  
Main commit at update time: `d5efc015`

## Purpose
This file is the only handoff doc for current web map state.

Do not create duplicate map READMEs unless explicitly requested.

## Current Source Of Truth
- Web map component: `features/route-planner/MapScreen.web.tsx`
- Web location controller: `features/route-planner/useWebLocationController.ts`
- Shared map entrypoint (platform switch): `features/route-planner/MapScreen.tsx`
- Native map component (separate behavior): `features/route-planner/MapScreen.native.tsx`
- Web map container integration: `features/admin/AdminDriverDetail.tsx`

## Intentional Current Behavior (Web)
- Map is rendered in fullscreen-only mode (no small + fullscreen toggle mode).
- Map/satellite toggle is overlaid on map.
- `Close map` button is overlaid on map and wired to parent close action.
- User location is mobile-web only.
- Desktop web location is intentionally disabled.
- Location attempts auto-start on mobile and are retried on map interaction (tap/dragstart).
- Pin style is custom badge pins (white numbers, full opacity).
- User location marker is blue/white dot marker.

## Test Route
- Isolated sandbox route exists: `/map-app`
- File: `app/map-app.tsx`
- Intended use: web map isolation/debugging only.

If this route is no longer needed, remove it in a dedicated cleanup commit.

## Known Constraints
- iPhone Safari Fullscreen API support is limited; fallback behavior is expected.
- Desktop browsers often provide approximate network location (no GPS), hence desktop location is disabled by design.
- Web map gesture behavior is highly sensitive to parent overlays/scroll containers.

## Rollback Anchors
- Tag: `backup/main-before-actual-fullscreen-20260225-8d588e7b`
- Branch: `backup-branch/main-before-actual-fullscreen-20260225-8d588e7b`
- Other historical backups:
  - `backup/pre-web-drag-hotfix-2026-02-25`
  - `backup/pre-fullscreen-web-20260224`
  - `backup/web-location-pre-foolproof-20260224`

## Fast Rollback Commands
Use only if asked.

Revert latest map change commit:
```bash
git revert <sha>
git push origin main
```

Reset main to fullscreen backup anchor (history rewrite):
```bash
git checkout main
git reset --hard backup/main-before-actual-fullscreen-20260225-8d588e7b
git push --force origin main
```

## Guardrails For Next Agent
- Treat web and native map work as separate tracks.
- For web map changes, default to touching only:
  - `features/route-planner/MapScreen.web.tsx`
  - `features/route-planner/useWebLocationController.ts`
  - (only if needed) `features/admin/AdminDriverDetail.tsx`
- Avoid mixing unrelated files in web map commits.
- Keep one objective per commit (gesture, location, fullscreen, pins).
- Run before push:
  - `npx eslint features/route-planner/MapScreen.web.tsx features/route-planner/useWebLocationController.ts`
  - `npm run web:build`

## Android Start Point (Next Work)
- Android/native map source: `features/route-planner/MapScreen.native.tsx`
- Android marker helpers:
  - `features/route-planner/useAndroidPinIconRegistry.ts`
  - `features/route-planner/marker-icon-cache.ts`
- Keep Android work isolated from web map files unless explicitly required.
