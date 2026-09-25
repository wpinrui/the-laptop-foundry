// @vitest-environment node
// The viewer never mirrors the laptop: a port on "left" opens on the user's
// left seen from the front (the default camera), front faces the camera, up is up.
import { describe, expect, it } from "vitest";
import { available, type Build, CONTENT, type Side, solve } from "../engine";
import { CAMERA_POSITION, engineToWorld } from "./space";

const PORTS: Record<number, string[]> = {
  2006: ["dc-jack", "usb-a-2.0", "vga"],
  2026: ["usb-c-10g", "usb-a-5g", "hdmi-2.1"],
};

describe("engine to world", () => {
  it("left is the user's left, front faces the camera, for every year, body, layout and size", () => {
    expect(CAMERA_POSITION[2]).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const year of [2006, 2026])
      for (const body of CONTENT.bodies)
        for (const layout of CONTENT.layouts)
          for (const x of [body.limits.x[0], body.limits.x[1]])
            for (const y of [body.limits.y[0], body.limits.y[1]])
              for (const z of [body.limits.z[0], body.limits.z[1]]) {
                const mat =
                  CONTENT.materials.find((m) => available(m, year))?.id ??
                  "plastic";
                const b: Build = {
                  year,
                  body: body.id,
                  layout: layout.id,
                  size: { x, y, z },
                  parts: {},
                  ports: layout.portSides.flatMap((side: Side) =>
                    PORTS[year].map((part) => ({ part, side })),
                  ),
                  materials: { floor: mat, deck: mat, lid: mat },
                  finish: {
                    floor: { colour: "black", texture: "matte" },
                    deck: { colour: "black", texture: "matte" },
                    lid: { colour: "black", texture: "matte" },
                  },
                  spend: {},
                };
                const fit = solve(b);
                for (const a of fit.anchors) {
                  if (a.kind !== "opening" || a.opening.kind !== "port")
                    continue;
                  const w = engineToWorld(a.at, fit.shell.outer);
                  const ok = {
                    left: w.x < 0,
                    right: w.x > 0,
                    front: w.z > 0,
                    rear: w.z < 0,
                  }[a.opening.side];
                  if (!ok)
                    bad.push(
                      `${year} ${body.id} ${layout.id} ${x}x${y}x${z}: ${a.opening.side} port lands at ${w.x.toFixed(0)}, ${w.z.toFixed(0)}`,
                    );
                }
                const top = engineToWorld(
                  { x: 0, y: 0, z: fit.frame.z },
                  fit.shell.outer,
                );
                const bottom = engineToWorld(
                  { x: 0, y: 0, z: 0 },
                  fit.shell.outer,
                );
                if (!(top.y > bottom.y))
                  bad.push(`${year} ${body.id} ${layout.id}: up is not up`);
              }
    expect(bad).toEqual([]);
  });
});
