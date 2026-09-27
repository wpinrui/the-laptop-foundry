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
export const REFLECTANCE = { matte: 0.02, glossy: 0.008 };

/**
 * How much of the modelled black haze the player's own monitor can show: it
 * has a black level and a room of its own, so the full figure would read too grey.
 */
export const HAZE_SHOWN = 0.7;

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
export const BLUR_PER_PIXEL = 0.42;
/** Below this blur, none. */
export const BLUR_MIN = 0.12;

/** Seen head-on in full screen, the edges of the screen are still this far off axis. */
export const FULL_HALF_ANGLE = 11;

/** Viewing angle behaviour per panel family. */
export const ANGLE = {
  tn: {
    /** From below: this many degrees to the full effect. */
    below: 32,
    belowDim: 0.6,
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
