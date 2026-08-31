// Zero-dependency stub for `@deepseek-ai/schemastery`, used only by
// test/loader-hooks.mjs so test/verify.js can import the REAL lib/index.js
// without resolving the actual peer dependency. Only the surface used at
// module top level (chainable z.object / z.array / z.string / z.number /
// z.union / z.dict with .default()) needs to not throw; CONFIG_SCHEMA is
// passed to the stubbed installSettingsSection and never validated.
const z = new Proxy(function schemasteryStub() {}, {
  get: () => z,
  apply: () => z,
});

export default z;