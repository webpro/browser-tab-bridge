# browser-tab-bridge

Read and control browser tabs from outside the browser. macOS only for now.

## Usage

```js
import { openInBrowserTab, getActiveTabUrl } from "browser-tab-bridge";

// Focus an existing tab or open a new one
await openInBrowserTab("https://github.com");

// Get the URL of the active browser tab
const url = await getActiveTabUrl();
```

## Browser support

| Browser              | Method                                         | Setup required  |
| -------------------- | ---------------------------------------------- | --------------- |
| Chrome, Chrome-based | AppleScript                                    | None            |
| Safari               | AppleScript                                    | None            |
| Firefox, Zen         | Companion WebExtension + native messaging host | Yes (see below) |

For unsupported browsers, falls back to the system `open` command.

## Firefox / Zen setup

1. Build the `.xpi` files and native messaging host:

   ```sh
   pnpm build
   ```

2. Install the browser extension via "Install Add-on From File" (`about:addons`):
   - Firefox: `extension/firefox/firefox.xpi`
   - Zen: `extension/zen/zen.xpi`

   Note: Regular Firefox requires signed extensions. Either use Firefox Developer
   Edition (set `xpinstall.signatures.required` to `false` in `about:config`) or
   sign the .xpi as unlisted on [addons.mozilla.org](https://addons.mozilla.org).

3. Install the native messaging host:

   ```sh
   pnpm install:firefox
   # or
   pnpm install:zen
   ```

## License

ISC
