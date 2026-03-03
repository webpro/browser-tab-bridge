# open-in-browser-tab

Focus an existing browser tab matching a URL, or open a new one. macOS only.

## Usage

```js
import { openInBrowserTab } from "open-in-browser-tab";

await openInBrowserTab("https://github.com");
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

3. Install the native messaging host:

   ```sh
   pnpm install:firefox
   # or
   pnpm install:zen
   ```

## License

ISC
