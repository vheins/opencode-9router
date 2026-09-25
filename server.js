/**
 * Load the built 9Router plugin for OpenCode's local-directory resolver.
 *
 * OpenCode V2 resolves an absolute plugin directory through its `server`
 * entrypoint. Published packages use the equivalent `./server` export from
 * package.json; this bridge keeps local development and V1-style paths aligned.
 */
export { default } from "./dist/index.js";
export * from "./dist/index.js";
