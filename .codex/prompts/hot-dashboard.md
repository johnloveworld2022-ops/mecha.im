Build the bot dashboard and hot-deploy it to a running bot container for live preview.

## Arguments

`$ARGUMENTS` is the bot name. Default to `posca` when omitted.

## Instructions

1. Build the dashboard from `agent/dashboard` with `npx vite build`.
2. Read `~/.mecha/registry.json` and find the selected bot's `path`.
3. Replace `<path>/dashboard-dist` with the newly built `agent/dashboard/dist` directory.
4. Do not restart the bot unless the user explicitly asks.
5. Tell the user to refresh the browser after deployment.
