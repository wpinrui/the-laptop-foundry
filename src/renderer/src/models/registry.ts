import type { ModelKey, ModelModule } from "./contract";

// Every file in ./roles/ registers itself: ./roles/<key>.ts exporting `model`.
// Adding a model means adding that one file; nothing else changes.

const found = import.meta.glob<{ model: ModelModule }>("./roles/*.ts", {
  eager: true,
});

export const MODELS = new Map<ModelKey, ModelModule>();
export const MODEL_FILES = new Map<ModelKey, string>();

for (const [path, mod] of Object.entries(found)) {
  if (path.endsWith(".test.ts")) continue;
  const file = path.slice("./roles/".length, -".ts".length);
  if (!mod.model) throw new Error(`${path} must export \`model\``);
  if (mod.model.key !== file)
    throw new Error(
      `${path} exports a model for "${mod.model.key}"; the file must be named ${mod.model.key}.ts`,
    );
  MODELS.set(mod.model.key, mod.model);
  MODEL_FILES.set(mod.model.key, path);
}
