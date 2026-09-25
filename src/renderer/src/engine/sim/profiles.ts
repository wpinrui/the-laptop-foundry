import { type Content, CONTENT } from "../content";
import {
  type Build,
  type Limits,
  type Part,
  PROFILES,
  type Profile,
  type ProfileId,
  type PowerSpec,
} from "../types";

// High runs the part defaults with fans free. Medium and Low scale the limits
// down and cap the fans. The player may edit or disable any of them.

const SCALE: Record<ProfileId, { sustained: number; boost: number; gpu: number; fan: number }> = {
  high: { sustained: 1, boost: 1, gpu: 1, fan: 1 },
  medium: { sustained: 0.7, boost: 0.8, gpu: 0.8, fan: 0.75 },
  low: { sustained: 0.45, boost: 0.55, gpu: 0.6, fan: 0.5 },
};

const NONE: Limits = { sustained: 0, boost: 0 };

export function partOf(
  build: Build,
  cat: "processor" | "graphics",
  content: Content = CONTENT,
): Part | undefined {
  const id = build.parts[cat]?.[0]?.part;
  return id ? content.parts.find((p) => p.id === id) : undefined;
}

function clampLimits(spec: PowerSpec | undefined, l: Limits): Limits {
  if (!spec) return NONE;
  const [lo, hi] = spec.range;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  const sustained = clamp(l.sustained);
  return { sustained, boost: Math.max(sustained, clamp(l.boost)) };
}

function scaled(spec: PowerSpec | undefined, sustained: number, boost: number): Limits {
  if (!spec) return NONE;
  return clampLimits(spec, {
    sustained: spec.sustained * sustained,
    boost: spec.boost * boost,
  });
}

/** Default profiles for the build's processor and graphics. */
export function defaultProfiles(
  build: Build,
  content: Content = CONTENT,
): Record<ProfileId, Profile> {
  const cpu = partOf(build, "processor", content)?.power;
  const gpu = partOf(build, "graphics", content)?.power;
  const out = {} as Record<ProfileId, Profile>;
  for (const id of PROFILES) {
    const s = SCALE[id];
    out[id] = {
      enabled: true,
      cpu: scaled(cpu, s.sustained, s.boost),
      gpu: scaled(gpu, s.gpu, s.gpu),
      fan: s.fan,
    };
  }
  return out;
}

/** The build's profiles, defaults filled in and limits clamped to the parts. */
export function profilesOf(
  build: Build,
  content: Content = CONTENT,
): Record<ProfileId, Profile> {
  const defaults = defaultProfiles(build, content);
  if (!build.power) return defaults;
  const cpu = partOf(build, "processor", content)?.power;
  const gpu = partOf(build, "graphics", content)?.power;
  const out = {} as Record<ProfileId, Profile>;
  for (const id of PROFILES) {
    const set = build.power[id] ?? defaults[id];
    out[id] = {
      enabled: set.enabled,
      cpu: clampLimits(cpu, set.cpu),
      gpu: clampLimits(gpu, set.gpu),
      fan: Math.min(1, Math.max(0, set.fan)),
    };
  }
  // At least one profile always runs.
  if (!PROFILES.some((id) => out[id].enabled)) out.high.enabled = true;
  return out;
}

/** The highest enabled profile runs the performance tests. */
export function topProfile(p: Record<ProfileId, Profile>): ProfileId {
  return PROFILES.find((id) => p[id].enabled) ?? "high";
}

/** The balanced profile runs the battery test: Medium, else the nearest enabled. */
export function balancedProfile(p: Record<ProfileId, Profile>): ProfileId {
  for (const id of ["medium", "low", "high"] as ProfileId[])
    if (p[id].enabled) return id;
  return "high";
}
