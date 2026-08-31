// Loader hooks that redirect the two @deepseek-ai peer imports of
// lib/index.js to local zero-dependency stubs (test/stubs), so test/verify.js
// can import and drive the REAL host plugin without a node_modules.
// Registered from test/verify.js via module.register before importing
// ../lib/index.js.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const STUBS = {
  "@deepseek-ai/schemastery": join(here, "stubs", "schemastery.mjs"),
  "@deepseek-ai/dsh-settings": join(here, "stubs", "dsh-settings.mjs"),
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in STUBS) {
    return { url: pathToFileURL(STUBS[specifier]).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}