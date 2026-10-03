import { byYear } from "../quality";

// The review score's tuning, all in one place (GDD, Version 0.2, "Review
// score"). Every category is scored on an absolute scale for its year: the
// measurement is placed between a low and a high reference, and a curve turns
// that place into a percentage. No other laptop is ever compared.
//
// The references were drafted from what the game's own parts give in each
// year: the 10th and 90th percentile of that year's hand-built rivals, run
// through the same simulation, then held so a scale never loosens as the
// years pass (review/scales.gen.test.ts prints the draft; run it with
// GEN_SCALES=1). Edit the numbers here to tune.
//
// Three scales are set by hand. The rivals all run cool and fairly quiet, so
// their spread says nothing about how hot or loud is too much: temperature
// and noise follow what reviewers call comfortable. The rivals barely vary
// their webcams, so the camera follows the parts: the low reference is the
// weakest webcam still sold that year (none at all until 2009), the high one
// the best with some quality spend.
//
// The keyboard scale is loose: laptop keys got shallower, not better, so it
// follows the years' rivals rather than holding the deepest era's bar.

export type CategoryKey =
  | "chassis"
  | "keyboard"
  | "pointing"
  | "connectivity"
  | "weight"
  | "battery"
  | "display"
  | "games"
  | "app"
  | "temperature"
  | "noise"
  | "audio"
  | "camera";

export interface Scale {
  /** Lower measurements are better: weight, temperature, noise. */
  lower?: boolean;
  /** Placed on a log scale, for figures that grow by multiples. */
  log?: boolean;
  /** Drafted as a running mean rather than held, for figures that did not keep improving. */
  loose?: boolean;
  /** Set by hand rather than drafted from the rivals; the draft script keeps it. */
  hand?: boolean;
  /** [year, low reference, high reference], interpolated between years. */
  refs: [number, number, number][];
}

/** The curve: the low reference scores LOW_SCORE, the high one HIGH_SCORE. */
export const CURVE = {
  LOW_SCORE: 65,
  HIGH_SCORE: 92,
  /** Just below the low reference the slope is this many times steeper; it then decays toward 0, never reaching it. */
  HARSH: 1.5,
  /** Above the high reference the score closes on this, never passing it. */
  CEILING: 100,
};

/** Log scales floor a measurement here, so a zero is very bad rather than undefined. */
export const LOG_FLOOR = 1e-3;

export const SCALES: Record<CategoryKey, Scale> = {
  // GENERATED-SCALES-START
  chassis: { refs: [[2006, 0.35, 0.796], [2007, 0.35, 0.796], [2008, 0.35, 0.796], [2009, 0.35, 0.796], [2010, 0.35, 0.798], [2011, 0.35, 0.798], [2012, 0.35, 0.802], [2013, 0.35, 0.82], [2014, 0.35, 0.82], [2015, 0.35, 0.82], [2016, 0.35, 0.82], [2017, 0.35, 0.82], [2018, 0.35, 0.82], [2019, 0.35, 0.82], [2020, 0.35, 0.82], [2021, 0.35, 0.82], [2022, 0.35, 0.82], [2023, 0.35, 0.82], [2024, 0.35, 0.82], [2025, 0.35, 0.82], [2026, 0.35, 0.82]] },
  keyboard: { log: true, loose: true, refs: [[2006, 0.772, 1.35], [2007, 0.777, 1.37], [2008, 0.775, 1.37], [2009, 0.77, 1.37], [2010, 0.766, 1.36], [2011, 0.755, 1.34], [2012, 0.745, 1.32], [2013, 0.741, 1.31], [2014, 0.723, 1.29], [2015, 0.705, 1.29], [2016, 0.687, 1.28], [2017, 0.669, 1.27], [2018, 0.651, 1.24], [2019, 0.653, 1.22], [2020, 0.654, 1.2], [2021, 0.656, 1.17], [2022, 0.657, 1.16], [2023, 0.659, 1.15], [2024, 0.661, 1.16], [2025, 0.661, 1.17], [2026, 0.662, 1.17]] },
  pointing: { log: true, refs: [[2006, 3.63, 5.45], [2007, 4.09, 6.13], [2008, 4.09, 6.13], [2009, 4.09, 6.13], [2010, 4.09, 6.13], [2011, 4.53, 7.03], [2012, 5.18, 8.09], [2013, 5.49, 8.89], [2014, 5.49, 8.89], [2015, 6.02, 9.72], [2016, 6.02, 9.72], [2017, 6.48, 9.72], [2018, 6.62, 11.5], [2019, 6.62, 11.5], [2020, 9.35, 14], [2021, 9.35, 14], [2022, 9.35, 14], [2023, 9.4, 16], [2024, 9.4, 16], [2025, 9.4, 16], [2026, 10.7, 16]] },
  connectivity: { refs: [[2006, 3.4, 6.46], [2007, 3.4, 8.51], [2008, 3.4, 9.03], [2009, 4.13, 9.22], [2010, 5.82, 9.22], [2011, 5.82, 9.22], [2012, 5.82, 9.22], [2013, 5.82, 9.22], [2014, 5.82, 9.22], [2015, 7.3, 10.8], [2016, 7.3, 11.4], [2017, 7.3, 11.4], [2018, 7.3, 11.4], [2019, 7.3, 11.5], [2020, 7.97, 11.5], [2021, 7.97, 11.5], [2022, 7.97, 11.5], [2023, 7.97, 11.5], [2024, 7.97, 11.5], [2025, 7.97, 11.5], [2026, 7.97, 11.5]] },
  weight: { lower: true, log: true, refs: [[2006, 3.71, 1.78], [2007, 3.71, 1.78], [2008, 3.71, 1.65], [2009, 3.71, 1.61], [2010, 3.71, 1.61], [2011, 3.53, 1.58], [2012, 3.53, 1.5], [2013, 3.52, 1.5], [2014, 3.17, 1.5], [2015, 2.65, 1.31], [2016, 2.44, 1.31], [2017, 2.32, 1.31], [2018, 2.27, 1.31], [2019, 2.22, 1.31], [2020, 2.22, 1.31], [2021, 2.1, 1.31], [2022, 2.1, 1.31], [2023, 2.1, 1.3], [2024, 2.1, 1.3], [2025, 2.1, 1.29], [2026, 2.1, 1.26]] },
  battery: { log: true, refs: [[2006, 1.93, 3.16], [2007, 2.03, 3.9], [2008, 2.23, 3.9], [2009, 2.47, 3.9], [2010, 3.4, 5.1], [2011, 3.8, 5.8], [2012, 4.64, 8.07], [2013, 4.64, 8.35], [2014, 4.64, 8.62], [2015, 4.64, 10.1], [2016, 4.64, 10.1], [2017, 4.64, 10.2], [2018, 4.64, 10.2], [2019, 4.64, 10.2], [2020, 7.21, 12.3], [2021, 7.74, 12.3], [2022, 7.74, 12.3], [2023, 7.74, 12.8], [2024, 7.74, 12.8], [2025, 7.74, 12.8], [2026, 7.74, 13]] },
  display: { log: true, refs: [[2006, 0.0866, 0.159], [2007, 0.0866, 0.166], [2008, 0.0866, 0.166], [2009, 0.0866, 0.166], [2010, 0.0866, 0.166], [2011, 0.119, 0.267], [2012, 0.119, 0.267], [2013, 0.12, 0.704], [2014, 0.123, 0.704], [2015, 0.124, 0.909], [2016, 0.134, 1.25], [2017, 0.134, 1.25], [2018, 0.342, 1.31], [2019, 0.365, 1.31], [2020, 0.365, 1.31], [2021, 0.541, 1.72], [2022, 0.541, 1.76], [2023, 0.587, 2.18], [2024, 0.634, 2.2], [2025, 0.634, 2.2], [2026, 0.733, 2.51]] },
  games: { log: true, refs: [[2006, 5.91, 100], [2007, 13.6, 103], [2008, 13.6, 103], [2009, 13.6, 103], [2010, 13.6, 103], [2011, 13.6, 103], [2012, 13.6, 103], [2013, 18, 103], [2014, 18, 103], [2015, 18, 103], [2016, 18, 103], [2017, 18, 103], [2018, 18, 103], [2019, 18, 103], [2020, 18, 103], [2021, 18, 107], [2022, 20.4, 111], [2023, 20.4, 113], [2024, 23.9, 116], [2025, 23.9, 119], [2026, 36, 119]] },
  app: { log: true, refs: [[2006, 262, 580], [2007, 327, 594], [2008, 360, 722], [2009, 463, 851], [2010, 466, 1140], [2011, 766, 1580], [2012, 843, 1900], [2013, 948, 2120], [2014, 948, 2190], [2015, 948, 2350], [2016, 1380, 2350], [2017, 1380, 2590], [2018, 1380, 3070], [2019, 1910, 3410], [2020, 1910, 3830], [2021, 2860, 4750], [2022, 3260, 5270], [2023, 3260, 6910], [2024, 3660, 6930], [2025, 3830, 7960], [2026, 3960, 8830]] },
  temperature: { lower: true, hand: true, refs: [[2006, 48, 35], [2016, 48, 34], [2026, 47, 33]] },
  noise: { lower: true, hand: true, refs: [[2006, 46, 31], [2016, 45, 29], [2026, 44, 27]] },
  audio: { log: true, refs: [[2006, 0.248, 1.95], [2007, 0.248, 1.95], [2008, 0.248, 1.95], [2009, 0.248, 1.95], [2010, 0.248, 1.95], [2011, 0.647, 2.37], [2012, 0.647, 2.37], [2013, 0.647, 2.37], [2014, 0.647, 2.37], [2015, 0.647, 2.37], [2016, 0.647, 2.37], [2017, 0.647, 2.37], [2018, 0.647, 2.37], [2019, 0.647, 2.37], [2020, 0.842, 3.4], [2021, 0.842, 3.4], [2022, 0.842, 3.4], [2023, 0.842, 3.47], [2024, 0.842, 3.53], [2025, 0.842, 3.53], [2026, 0.842, 3.53]] },
  camera: { hand: true, refs: [[2006, 0, 0.85], [2009, 0.4, 0.9], [2013, 0.6, 0.95], [2020, 0.7, 1.5], [2023, 0.75, 2], [2026, 0.8, 2.4]] },
  // GENERATED-SCALES-END
};

/**
 * Degrees a gaming machine's case may run past the temperature scale: reviewers
 * expect 45 to 55 °C on a gaming laptop under load, against 40 to 48 °C on a
 * thin and light one.
 */
export const GAMING_HEAT = 5;

/** The peak skin temperature past which a case of this class counts as hot, °C. */
export function hotSkin(year: number, gaming: boolean): number {
  return refsAt(SCALES.temperature, year).low + (gaming ? GAMING_HEAT : 0);
}

/** The low and high references of a scale in a year. */
export function refsAt(scale: Scale, year: number): { low: number; high: number } {
  return {
    low: byYear(year, scale.refs.map(([y, lo]) => [y, lo])),
    high: byYear(year, scale.refs.map(([y, , hi]) => [y, hi])),
  };
}

/**
 * Where a measurement sits between the references: 0 at the low one, 1 at the
 * high one, beyond either end past them. Lower-is-better scales are flipped.
 */
export function placeOn(value: number, scale: Scale, year: number): number {
  const { low, high } = refsAt(scale, year);
  const f = (v: number) => (scale.log ? Math.log(Math.max(LOG_FLOOR, v)) : v);
  const span = f(high) - f(low);
  if (span === 0) return value === high ? 1 : 0;
  return (f(value) - f(low)) / span;
}

/**
 * Place to percentage. Straight from LOW_SCORE to HIGH_SCORE between the
 * references; below, HARSH times as steep at first, decaying toward 0; above, easing toward
 * CEILING with the same slope where it starts, so exceptional builds still
 * gain but can never reach it.
 */
export function curve(t: number): number {
  const { LOW_SCORE, HIGH_SCORE, HARSH, CEILING } = CURVE;
  const slope = HIGH_SCORE - LOW_SCORE;
  if (t < 0) return LOW_SCORE * Math.exp((t * slope * HARSH) / LOW_SCORE);
  if (t <= 1) return LOW_SCORE + t * slope;
  const room = CEILING - HIGH_SCORE;
  return HIGH_SCORE + room * (1 - Math.exp((-(t - 1) * slope) / room));
}

/** A measurement's category score in its year, 0 to 100. */
export function scoreOn(value: number, scale: Scale, year: number): number {
  return curve(placeOn(value, scale, year));
}
