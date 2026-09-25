// @vitest-environment node
// The model check: every registered model, built across its role's full size
// range and every context it meets in the game, must keep the contract.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SAMPLES, solve } from "../engine";
import { renderUnit } from "../viewer/renderUnit";
import {
  BUDGETS,
  contained,
  fingerprint,
  inspect,
  MATERIAL_SLOTS,
  type MaterialSlot,
  type ModelBox,
  type ModelContext,
  type ModelKey,
  type ModelModule,
  modelKey,
  REQUIRED_ANCHORS,
  runModel,
  seeded,
  seedFor,
} from "./contract";
import { type ModelInput, modelRanges } from "./ranges";
import { MODEL_FILES, MODELS } from "./registry";

const BANNED: [RegExp, string][] = [
  [/\bfetch\s*\(/, "fetch"],
  [/XMLHttpRequest/, "XMLHttpRequest"],
  [/\bnew\s+Image\b/, "Image"],
  [/Loader\b/, "a three.js loader"],
  [/\bimport\s*\(/, "dynamic import"],
  [/https?:\/\//, "a URL"],
  [/Math\.random/, "Math.random (use ctx.random)"],
  [/Date\.now|new Date\b|performance\.now/, "the clock"],
];

function slots(): Record<MaterialSlot, THREE.Material> {
  return Object.fromEntries(
    MATERIAL_SLOTS.map((s) => [s, new THREE.MeshBasicMaterial({ name: s })]),
  ) as unknown as Record<MaterialSlot, THREE.Material>;
}

function contextFor(
  key: ModelKey,
  box: ModelBox,
  input: ModelInput,
  materials: Record<MaterialSlot, THREE.Material>,
): ModelContext {
  const base = {
    year: input.year,
    piece: input.piece,
    part: input.part,
    edge: input.edge,
    hinge: input.hinge,
    removable: input.removable,
  };
  return {
    ...base,
    materials,
    random: seeded(seedFor(key, box, input.options, base)),
  };
}

/** Boxes to try for one input: its smallest and largest, and between them. */
function boxesFor(input: ModelInput): ModelBox[] {
  const mid = (a: number, b: number) => (a + b) / 2;
  return [
    input.min,
    {
      width: mid(input.min.width, input.max.width),
      height: mid(input.min.height, input.max.height),
      depth: mid(input.min.depth, input.max.depth),
    },
    input.max,
  ];
}

function disposeAll(obj: THREE.Object3D): void {
  obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}

describe("model contract", () => {
  const ranges = modelRanges();

  it("every drawn role has a size range derived from the content", () => {
    for (const key of Object.keys(REQUIRED_ANCHORS) as ModelKey[])
      expect(ranges.has(key), key).toBe(true);
  });

  it("registered files are named for their key and use no banned calls", () => {
    for (const [key, path] of MODEL_FILES) {
      expect(path).toBe(`./roles/${key}.ts`);
      const src = readFileSync(join("src/renderer/src/models", path), "utf8");
      for (const [re, what] of BANNED)
        expect(re.test(src), `${path} uses ${what}`).toBe(false);
    }
  });

  for (const [key, module] of MODELS) {
    it(`${key}: contained, deterministic, anchored, in budget, across every size and context`, () => {
      const range = ranges.get(key);
      expect(range, `no size range for ${key}`).toBeDefined();
      if (!range) return;
      const budget = BUDGETS[key];
      const failures: string[] = [];
      let builds = 0;
      let worstMs = 0;
      let worstTris = 0;
      // Every input the game produces, plus the role's extreme boxes in the first context.
      const cases: [ModelBox, ModelInput][] = range.inputs.flatMap((input) =>
        boxesFor(input).map((b): [ModelBox, ModelInput] => [b, input]),
      );
      cases.push([range.min, range.inputs[0]], [range.max, range.inputs[0]]);
      // Warm up so the time budget measures the model, not the JIT.
      for (let i = 0; i < 5; i++)
        disposeAll(
          runModel(
            module as ModelModule,
            range.max,
            range.inputs[0].options,
            contextFor(key, range.max, range.inputs[0], slots()),
          ),
        );
      for (const [box, input] of cases) {
        const label = `${key} ${JSON.stringify(box)} ${input.year} ${input.part ?? ""} ${JSON.stringify(input.options)} ${input.edge ?? ""}`;
        const mats = slots();
        let obj: THREE.Object3D;
        let ms = Number.POSITIVE_INFINITY;
        try {
          obj = runModel(
            module,
            box,
            input.options,
            contextFor(key, box, input, mats),
          );
          for (let k = 0; k < 3; k++) {
            const t0 = performance.now();
            const again = runModel(
              module,
              box,
              input.options,
              contextFor(key, box, input, mats),
            );
            ms = Math.min(ms, performance.now() - t0);
            disposeAll(again);
          }
        } catch (e) {
          failures.push(`${label}: threw ${(e as Error).message}`);
          continue;
        }
        builds++;
        const ctx = contextFor(key, box, input, mats);
        const ins = inspect(obj, ctx);
        if (!contained(ins, box))
          failures.push(
            `${label}: leaves its box (${ins.bounds.min.toArray().map((v) => v.toFixed(2))} to ${ins.bounds.max.toArray().map((v) => v.toFixed(2))})`,
          );
        for (const a of REQUIRED_ANCHORS[key])
          if (!ins.anchors.has(a))
            failures.push(`${label}: missing anchor:${a}`);
        if (ins.foreignMaterials > 0)
          failures.push(
            `${label}: uses ${ins.foreignMaterials} material(s) that are not engine slots`,
          );
        if (ins.triangles > budget.triangles)
          failures.push(
            `${label}: ${ins.triangles} triangles, budget ${budget.triangles}`,
          );
        if (ms > budget.ms)
          failures.push(
            `${label}: built in ${ms.toFixed(2)} ms, budget ${budget.ms}`,
          );
        worstMs = Math.max(worstMs, ms);
        worstTris = Math.max(worstTris, ins.triangles);
        const again = runModel(
          module,
          box,
          input.options,
          contextFor(key, box, input, mats),
        );
        if (fingerprint(again, ctx) !== fingerprint(obj, ctx))
          failures.push(`${label}: not deterministic`);
        disposeAll(obj);
        disposeAll(again);
      }
      console.log(
        `${key}: ${builds} builds, worst ${worstTris} triangles, worst ${worstMs.toFixed(2)} ms`,
      );
      expect(failures.slice(0, 20)).toEqual([]);
    });
  }

  it("the viewer places every registered model exactly in its engine box", () => {
    const m = () => new THREE.MeshBasicMaterial();
    const s = {
      body: m(),
      metal: m(),
      plastic: m(),
      rubber: m(),
      glass: m(),
      glow: m(),
    };
    const ctx = { material: () => m(), slots: () => s, danger: "red" };
    const bad: string[] = [];
    for (const sample of SAMPLES)
      for (const size of [sample.build.size, { x: 450, y: 330, z: 55 }]) {
        const fit = solve({ ...sample.build, size });
        for (const b of fit.boxes) {
          const key = b.kind === "unit" ? modelKey(b.role) : undefined;
          if (!key || !MODELS.has(key)) continue;
          const obj = renderUnit(
            b.role,
            b,
            {
              colour: "grey",
              year: sample.build.year,
              hinge: fit.shell.style.hinge,
            },
            ctx,
          );
          obj.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(obj);
          for (const k of ["x", "y", "z"] as const)
            if (
              bb.min[k] < b.at[k] - 0.06 ||
              bb.max[k] > b.at[k] + b.size[k] + 0.06
            )
              bad.push(`${sample.id} ${b.id} leaves its engine box on ${k}`);
        }
      }
    expect(bad).toEqual([]);
  });

  it("the check itself catches a model that breaks the rules", () => {
    const bad: ModelModule = {
      key: "fan",
      build: (box, _o, ctx) => {
        const g = new THREE.Group();
        g.add(
          new THREE.Mesh(
            new THREE.BoxGeometry(box.width + 2, box.height, box.depth),
            new THREE.MeshBasicMaterial(),
          ),
        );
        void ctx;
        return g;
      },
    };
    const mats = slots();
    const box = { width: 50, height: 5, depth: 50 };
    const input: ModelInput = {
      year: 2026,
      piece: "floor",
      options: {},
      hinge: "full",
      min: box,
      max: box,
    };
    const ctx = contextFor("fan", box, input, mats);
    const ins = inspect(runModel(bad, box, {}, ctx), ctx);
    expect(contained(ins, box)).toBe(false);
    expect(ins.foreignMaterials).toBe(1);
    expect(REQUIRED_ANCHORS.fan.every((a) => ins.anchors.has(a))).toBe(false);
    const net: ModelModule = {
      key: "fan",
      build: () => {
        fetch("x");
        return new THREE.Group();
      },
    };
    expect(() => runModel(net, box, {}, ctx)).toThrow(/network/);
  });
});
