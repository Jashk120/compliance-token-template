// Registers resolution hooks that map the internal, unexported subpath
// "@hiero-ledger/sdk/lib/client/NodeClient" (imported by @hiero-did-sdk/hcs)
// to its physical file. See hieroNodeClientLoader.mjs for the why.
//
// tsx compiles the .ts scripts to CommonJS, so `require()` needs a separate
// hook from the ESM loader: `module.register` only intercepts `import`. Both
// are installed here so the same one-line `--import` covers either format.
import Module, { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET = "@hiero-ledger/sdk/lib/client/NodeClient";
const physical = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../node_modules/@hiero-ledger/sdk/lib/client/NodeClient.js",
);

register("./hieroNodeClientLoader.mjs", import.meta.url);

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === TARGET) {
    return physical;
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};
