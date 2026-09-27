// Every constant the screen and speaker simulation is tuned by, in one place.
// Angles in degrees, luminance in cd/m2, illuminance in lux.

export type Room = "cafe" | "workshop";

/** Light falling on the screen, lux: the cafe is a bright day room, the workshop medium. */
export const ROOM_LUX: Record<Room, number> = { cafe: 600, workshop: 250 };

/** The white the eye is adapted to in each room: a panel this bright looks as bright as the player's own screen. */
export const ROOM_WHITE: Record<Room, number> = { cafe: 360, workshop: 260 };

/** Brightness can dim a panel this far, and brighten it a touch, never more. */
export const BRIGHTNESS_RANGE: [number, number] = [0.45, 1.04];

/** Share of the room's light a screen surface sends back as a haze. */
export const REFLECTANCE = { matte: 0.015, glossy: 0.008 };

/**
 * How much of the modelled black haze the player's own monitor can show: it
 * has a black level and a room of its own, so the full figure would read too grey.
 */
export const HAZE_SHOWN = 0.55;

/** Haze colour per panel family, over the page: cheap TN blacks are bluish grey. */
export const HAZE_COLOUR: Record<string, string> = {
  tn: "150, 165, 200",
  ips: "175, 172, 168",
  oled: "160, 160, 160",
  "mini-led": "175, 172, 168",
};

/** Glossy glare streak strength, per lux: a bright cafe shows more of itself in the glass. */
export const GLARE_PER_LUX = 0.00028;

/** Saturation from gamut: sRGB coverage to saturate(); a DCI-P3 panel shows sRGB colour oversaturated. */
export const SAT_FLOOR = 0.3;
export const SAT_P3 = 1.16;

/** A cool white point cast on panels this far off in colour (DeltaE), per unit of DeltaE over 4. */
export const CAST_PER_DE = 0.006;
export const CAST_COLOUR = "150, 180, 255";

/** Softness: blur radius per panel pixel, in the page's CSS pixels. */
export const BLUR_PER_PIXEL = 0.5;
/** Below this blur, none. */
export const BLUR_MIN = 0.12;

/** Seen head-on in full screen, the edges of the screen are still this far off axis. */
export const FULL_HALF_ANGLE = 11;

/** Viewing angle behaviour per panel family. */
export const ANGLE = {
  tn: {
    /** From below: this many degrees to the full effect. */
    below: 32,
    belowDim: 0.5,
    belowContrast: 0.55,
    belowInvert: 0.42,
    /** From above: washes out. */
    above: 40,
    aboveWash: 0.38,
    aboveContrast: 0.45,
    aboveSat: 0.5,
    /** From the side: colour shift and contrast loss. */
    side: 60,
    sideContrast: 0.35,
    sideSat: 0.35,
    sideHue: 10,
  },
  ips: {
    /** Degrees to the full effect, any direction. */
    reach: 70,
    contrast: 0.22,
    glow: 0.22,
    sat: 0.1,
  },
  /** Early wide-angle panels before LED backlights: weaker than IPS proper. */
  ipsType: { contrast: 0.32, glow: 0.3, sat: 0.18 },
  oled: {
    /** Tint shows past this angle. */
    from: 30,
    reach: 70,
    dim: 0.12,
    hue: -8,
    tint: 0.05,
  },
  mini: {
    /** Local dimming haloes: a faint lift seen head-on, more off axis. */
    bloom: 0.012,
    bloomAngle: 0.05,
  },
};

/** Changes in view smaller than this (degrees) are not redrawn. */
export const VIEW_STEP = 0.25;

// ------------------------------------------------------------------ glow

/** How often the page's average colour is guessed, ms. */
export const GLOW_MS = 500;

/** A cross-origin frame cannot be read: it counts as this light a grey, linear. */
export const IFRAME_GUESS = 0.75;

/**
 * Spot light intensity per cd/m2 of average screen luminance per square metre
 * of screen, in the scene's mm units (irradiance falls with distance squared).
 */
export const GLOW_PER_CANDELA = 1400;

/**
 * The rooms' lights are not in the same units: the workshop's fill is far
 * stronger in the scene's numbers than the cafe's, so the screen's light is
 * scaled to match each room's own.
 */
export const GLOW_ROOM: Record<Room, number> = { cafe: 1.5, workshop: 6 };

/** The screen's light reaches no further than this, mm. */
export const GLOW_REACH = 2500;

/** Seconds for the glow to follow the page. */
export const GLOW_EASE = 0.35;

/** The faint halo around the screen, per room: only a dim room shows it. Opacity per 100 cd/m2 of average luminance. */
export const HALO: Record<Room, number> = { cafe: 0.015, workshop: 0.05 };

/** The halo spreads this far past the screen's edge, mm. */
export const HALO_SPREAD = 22;

// ------------------------------------------------------------------ speakers

/** Total amplifier watts per speaker part. */
export const SPEAKER_WATTS: Record<string, number> = {
  "spk-mono": 1,
  "spk-stereo-2006": 2,
  "spk-stereo-sub": 4,
  "spk-stereo-2016": 4,
  "spk-stereo-2016-sub": 6,
  "spk-stereo-2026": 4,
  "spk-quad": 8,
  "spk-six": 12,
};
export const SPEAKER_WATTS_DEFAULT = 2;

/** Watts that play at full scale; fewer are quieter by their power ratio. */
export const LOUD_WATTS = 12;

/** Bass cutoff, Hz: this over the square root of the drivers' total area in mm2, within the range. */
export const BASS_K = 8500;
export const BASS_RANGE: [number, number] = [90, 520];

/** Makers' tuning from 2018: bass a little lower, and a limiter in place of hard clipping. */
export const DSP_FROM = 2018;
export const DSP_BASS = 0.85;
export const DSP_DRIVE = 0.55;

/** Resonance at the bass cutoff: a tiny driver peaks, a big one rolls off smoothly. */
export const BASS_Q: [number, number] = [0.75, 1.3];

/** The thin, forward upper midrange of small speakers: a peak at this frequency, dB for the smallest and the largest. */
export const PRESENCE_HZ = 2800;
export const PRESENCE_DB: [number, number] = [1, 5];

/** Treble past the grill: open on the deck, muffled through the front wall or off the table from below. */
export const GRILL_TREBLE: Record<"deck" | "front" | "none", number> = { deck: 16000, front: 9500, none: 5200 };
/** Level lost firing away from the listener, dB. */
export const GRILL_LOSS: Record<"deck" | "front" | "none", number> = { deck: 0, front: -1, none: -3 };

/** Pushing into distortion: gain into the soft clip at full volume for 1 W, less for more watts. */
export const DRIVE_1W = 1.6;

/** Distance at which the laptop plays at its full level, mm; farther falls as sound does, inversely. */
export const HEAR_AT = 650;

/** Stereo is heard at full width this close, mm, narrowing farther away. */
export const STEREO_AT = 800;

/** Live speaker values go to the tabs this often, per second. */
export const SPEAKER_HZ = 15;
