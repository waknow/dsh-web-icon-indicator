// Zero-dependency stub for `@deepseek-ai/dsh-settings`, used only by
// test/loader-hooks.mjs. Captures the installSettingsSection args into
// globalThis so test/verify.js can assert the settings wiring and drive the
// captured setSource/onChange hooks.
export function settingsNamespace(name) {
  return name;
}

export function installSettingsSection(ctx, ns, schema, entry, opts) {
  const slot = (globalThis.__DSH_ICON_TEST__ ||= {});
  slot.ns = ns;
  slot.schema = schema;
  slot.entry = entry;
  slot.settingsOpts = opts;
}