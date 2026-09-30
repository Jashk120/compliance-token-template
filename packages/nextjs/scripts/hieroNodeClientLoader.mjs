// Node module-customization hook for the DID scripts run under `tsx`.
//
// `@hiero-did-sdk/hcs@0.2.1` imports "@hiero-ledger/sdk/lib/client/NodeClient"
// (an internal, unexported subpath). Every `@hiero-ledger/sdk` 2.x release in
// the DID SDKs' peer range (^2.81.0) restricts "exports" to "." only, so Node
// and tsx reject the deep import with ERR_PACKAGE_PATH_NOT_EXPORTED. Next.js
// gets around this with a webpack alias in next.config.ts; this hook gives the
// CLI scripts the same mapping without a bundler. It is registered with
// `--import` (see the package.json scripts) and intercepts both ESM `import`
// and CommonJS `require`.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TARGET = "@hiero-ledger/sdk/lib/client/NodeClient";
const targetUrl = pathToFileURL(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/@hiero-ledger/sdk/lib/client/NodeClient.js"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === TARGET) {
    return { url: targetUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
