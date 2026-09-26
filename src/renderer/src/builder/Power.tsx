import {
  type Build,
  CONTENT,
  type Limits,
  PROFILES,
  type Profile,
  type ProfileId,
  profilesOf,
} from "../engine";

type SetBuild = (f: (b: Build) => Build) => void;

export const PROFILE_NAME: Record<ProfileId, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function Watts({
  value,
  range,
  label,
  onChange,
  onBlur,
}: {
  value: number;
  range: [number, number];
  label: string;
  onChange: (v: number) => void;
  onBlur: () => void;
}) {
  return (
    <input
      className="watts"
      type="number"
      min={range[0]}
      max={range[1]}
      step={1}
      value={Math.round(value)}
      aria-label={label}
      onBlur={onBlur}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

/** Power limits and fan cap per profile. Edits store every profile on the build. */
export function Power({ build, set }: { build: Build; set: SetBuild }) {
  const cpu = CONTENT.parts.find(
    (p) => p.id === build.parts.processor?.[0]?.part,
  )?.power;
  if (!cpu) return null;
  const gpu = CONTENT.parts.find(
    (p) => p.id === build.parts.graphics?.[0]?.part,
  )?.power;
  const profiles = profilesOf(build);
  // Inputs show what was typed; the simulation clamps, and leaving a field commits the clamp.
  const shown = build.power ?? profiles;
  const commit = () =>
    set((b) => (b.power ? { ...b, power: profilesOf(b) } : b));
  const enabledCount = PROFILES.filter((id) => profiles[id].enabled).length;

  const edit = (id: ProfileId, f: (p: Profile) => Profile) =>
    set((b) => {
      const all = b.power ?? profilesOf(b);
      return { ...b, power: { ...all, [id]: f(all[id]) } };
    });
  const limit =
    (id: ProfileId, chip: "cpu" | "gpu", key: keyof Limits) => (v: number) =>
      edit(id, (p) => ({ ...p, [chip]: { ...p[chip], [key]: v } }));

  return (
    <div className="power">
      <div className={gpu ? "power-row head gpu" : "power-row head"}>
        <span />
        <span className="span2">CPU W</span>
        {gpu && <span className="span2">GPU W</span>}
        <span>Fan %</span>
      </div>
      <div className={gpu ? "power-row sub gpu" : "power-row sub"}>
        <span />
        <span title="Sustained">Sust.</span>
        <span title="Boost">Boost</span>
        {gpu && <span title="Sustained">Sust.</span>}
        {gpu && <span title="Boost">Boost</span>}
        <span />
      </div>
      {PROFILES.map((id) => {
        const p = shown[id];
        return (
          <div
            key={id}
            className={[
              "power-row",
              gpu ? "gpu" : "",
              profiles[id].enabled ? "" : "off",
            ].join(" ")}
          >
            <label className="profile">
              <input
                type="checkbox"
                checked={profiles[id].enabled}
                disabled={profiles[id].enabled && enabledCount === 1}
                onChange={(e) =>
                  edit(id, (q) => ({ ...q, enabled: e.target.checked }))
                }
              />
              {PROFILE_NAME[id]}
            </label>
            <Watts
              label={`${id} processor sustained`}
              value={p.cpu.sustained}
              range={cpu.range}
              onBlur={commit}
              onChange={limit(id, "cpu", "sustained")}
            />
            <Watts
              label={`${id} processor boost`}
              value={p.cpu.boost}
              range={cpu.range}
              onBlur={commit}
              onChange={limit(id, "cpu", "boost")}
            />
            {gpu && (
              <Watts
                label={`${id} graphics sustained`}
                value={p.gpu.sustained}
                range={gpu.range}
                onBlur={commit}
              onChange={limit(id, "gpu", "sustained")}
              />
            )}
            {gpu && (
              <Watts
                label={`${id} graphics boost`}
                value={p.gpu.boost}
                range={gpu.range}
                onBlur={commit}
              onChange={limit(id, "gpu", "boost")}
              />
            )}
            <Watts
              label={`${id} fan`}
              value={p.fan * 100}
              range={[0, 100]}
              onBlur={commit}
              onChange={(v) => edit(id, (q) => ({ ...q, fan: v / 100 }))}
            />
          </div>
        );
      })}
    </div>
  );
}
