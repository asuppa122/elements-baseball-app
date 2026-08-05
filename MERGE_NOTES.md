# Merged Publish-Ready Project

This package uses the uploaded `elements-baseball-app(12).zip` as the source of truth for all current application code and Home-screen visuals.

Restored from the stable beta backup:
- `.git` repository metadata, history, branch tracking, and GitHub origin
- Vercel SPA routing configuration
- `PUSH_LIVE.command`
- `RUN_LOCAL.command`
- `APPLY_UPDATE.command`
- publishing/testing documentation

Not replaced from the stable beta:
- `src/`
- `public/`
- current Home-screen graphics
- current package files
- current application functionality

`node_modules`, `dist`, and `.vite` were removed so dependencies install cleanly on the destination Mac.
