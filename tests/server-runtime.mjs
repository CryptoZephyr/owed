import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: new URL("./server-only.cjs", import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
