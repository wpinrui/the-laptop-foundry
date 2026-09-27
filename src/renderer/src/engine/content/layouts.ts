import type { Layout, Node, Plan } from "../types";

// Floor trees list children front to rear (split y) and left to right (split x).
// Side port strips pack from the rear (hinge end) toward the front, power
// rearmost; front and rear strips pack left to right, centred.
// Hinge mounts align to their outer side so they always sit at the rear corners,
// whatever else in their row grows or collapses.
// Cross-axis, every child stretches to its parent, so a zone reaches an outer
// edge exactly when it is the first or last child on the way down that axis.

// Layout A, "Battery front": battery row across the full front with the optical
// bay at its right end, fans venting rear either side of the board, rear ports
// between the fans, side ports in the rear block beside the hinges.
// The battery and the speakers may also move back under the keyboard, leaving
// the front under the palm rest thin for a taper; the speakers may also move
// to the rear row beside the hinges. Zones sharing a name are one place: a
// part moved there deals its units across them.
const floorA: Node = {
  split: "y",
  children: [
    {
      split: "x",
      children: [
        {
          zone: "spk-l",
          takes: ["spk"],
          pack: "y",
          grow: 1,
          align: "centre",
          name: "Front",
        },
        {
          zone: "drive-bay",
          takes: ["drive"],
          pack: "x",
          grow: 1,
          align: "centre",
          capacity: 2,
          name: "Front",
        },
        {
          zone: "battery",
          takes: ["battery"],
          pack: "x",
          grow: 1,
          align: "centre",
          name: "Front",
        },
        {
          zone: "spk-r",
          takes: ["spk"],
          pack: "y",
          grow: 1,
          align: "centre",
          name: "Front",
        },
        // The optical drive loads from the right side: here at the front
        // corner, or in the rear row ahead of the right side ports.
        {
          zone: "optical-bay",
          takes: ["odd"],
          pack: "x",
          grow: 0,
          edge: "right",
          capacity: 1,
          name: "Front",
        },
      ],
    },
    // Under the keyboard: the battery pushed back against the rear row (it
    // takes the slack in front of it), the speakers at the sides.
    {
      split: "x",
      children: [
        {
          zone: "spk-kb-l",
          takes: [],
          may: ["spk"],
          pack: "x",
          grow: 1,
          align: "start",
          name: "Under keyboard",
        },
        {
          zone: "battery-kb",
          takes: [],
          may: ["battery"],
          pack: "y",
          grow: 100,
          align: "end",
          name: "Under keyboard",
        },
        {
          zone: "spk-kb-r",
          takes: [],
          may: ["spk"],
          pack: "x",
          grow: 1,
          align: "end",
          name: "Under keyboard",
        },
      ],
    },
    {
      split: "x",
      children: [
        {
          split: "y",
          children: [
            {
              zone: "ports-left",
              takes: ["port:left"],
              pack: "y",
              grow: 1,
              edge: "left",
              align: "end",
              packFrom: "end",
            },
            {
              zone: "hinge-l",
              takes: ["hinge"],
              pack: "x",
              grow: 0,
              edge: "rear",
              align: "start",
            },
          ],
        },
        // Speakers moved to the rear row, beside the hinges.
        {
          zone: "spk-rear-l",
          takes: [],
          may: ["spk"],
          pack: "y",
          grow: 0,
          align: "end",
          name: "Rear",
        },
        {
          zone: "fan-l",
          takes: ["fan", "fin"],
          pack: "x",
          grow: 4,
          edge: "rear",
        },
        {
          split: "y",
          children: [
            {
              zone: "board",
              takes: ["board"],
              pack: "x",
              grow: 2,
              align: "centre",
            },
            {
              zone: "ports-rear",
              takes: ["port:rear"],
              pack: "x",
              grow: 0,
              edge: "rear",
              align: "centre",
            },
          ],
        },
        // A drive moved beside the board, into the rear row.
        {
          zone: "drive-board",
          takes: [],
          may: ["drive"],
          pack: "x",
          grow: 0,
          align: "centre",
          capacity: 2,
          name: "Board row",
        },
        {
          zone: "fan-r",
          takes: ["fan", "fin"],
          pack: "x",
          grow: 4,
          edge: "rear",
        },
        {
          zone: "spk-rear-r",
          takes: [],
          may: ["spk"],
          pack: "y",
          grow: 0,
          align: "end",
          name: "Rear",
        },
        {
          split: "y",
          children: [
            {
              zone: "optical-rear",
              takes: [],
              may: ["odd"],
              pack: "x",
              grow: 0,
              edge: "right",
              capacity: 1,
              name: "Board row",
            },
            {
              zone: "ports-right",
              takes: ["port:right"],
              pack: "y",
              grow: 1,
              edge: "right",
              align: "end",
              packFrom: "end",
            },
            {
              zone: "hinge-r",
              takes: ["hinge"],
              pack: "x",
              grow: 0,
              edge: "rear",
              align: "end",
            },
          ],
        },
      ],
    },
  ],
};

// Layout B, "Battery rear": front port strip; then side columns with the fan
// (left) and the optical bay (right) in front and the side ports behind them,
// toward the rear; speakers and drive bay in front of the board between them;
// then hinges either side of the removable battery on the rear edge.
const floorB: Node = {
  split: "y",
  children: [
    {
      zone: "ports-front",
      takes: ["port:front"],
      pack: "x",
      grow: 0,
      edge: "front",
      align: "centre",
    },
    {
      split: "x",
      children: [
        {
          split: "y",
          children: [
            {
              zone: "fan",
              takes: ["fan", "fin"],
              pack: "y",
              grow: 4,
              edge: "left",
            },
            {
              zone: "ports-left",
              takes: ["port:left"],
              pack: "y",
              grow: 1,
              edge: "left",
              align: "end",
              packFrom: "end",
            },
          ],
        },
        {
          split: "y",
          children: [
            {
              split: "x",
              children: [
                {
                  zone: "spk-l",
                  takes: ["spk"],
                  pack: "y",
                  grow: 1,
                  align: "centre",
                },
                {
                  zone: "drive-bay",
                  takes: ["drive"],
                  pack: "x",
                  grow: 1,
                  align: "centre",
                  capacity: 2,
                  name: "Front",
                },
                {
                  zone: "spk-r",
                  takes: ["spk"],
                  pack: "y",
                  grow: 1,
                  align: "centre",
                },
              ],
            },
            {
              split: "x",
              children: [
                {
                  zone: "board",
                  takes: ["board"],
                  pack: "x",
                  grow: 2,
                  align: "centre",
                },
                // A drive moved beside the board.
                {
                  zone: "drive-board",
                  takes: [],
                  may: ["drive"],
                  pack: "x",
                  grow: 0,
                  align: "centre",
                  capacity: 2,
                  name: "Board row",
                },
              ],
            },
          ],
        },
        {
          split: "y",
          children: [
            {
              zone: "optical-bay",
              takes: ["odd"],
              pack: "x",
              grow: 1,
              edge: "right",
              capacity: 1,
            },
            {
              zone: "ports-right",
              takes: ["port:right"],
              pack: "y",
              grow: 1,
              edge: "right",
              align: "end",
              packFrom: "end",
            },
          ],
        },
      ],
    },
    {
      split: "x",
      children: [
        {
          zone: "hinge-l",
          takes: ["hinge"],
          pack: "x",
          grow: 0,
          edge: "rear",
          align: "start",
        },
        {
          zone: "battery",
          takes: ["battery"],
          pack: "x",
          grow: 1,
          edge: "rear",
          align: "centre",
        },
        // A drive moved beside the battery, into the rear row.
        {
          zone: "drive-rear",
          takes: [],
          may: ["drive"],
          pack: "x",
          grow: 0,
          align: "centre",
          capacity: 2,
          name: "Battery row",
        },
        {
          zone: "hinge-r",
          takes: ["hinge"],
          pack: "x",
          grow: 0,
          edge: "rear",
          align: "end",
        },
      ],
    },
  ],
};

// Layout C, "Big bays": for large machines. Drive bay beside the board (left),
// optical bay on the right edge, side ports in front of each bay, speakers
// (side by side) and front ports in front of the board, and the battery on the rear edge between
// two fans venting rear.
const floorC: Node = {
  split: "y",
  children: [
    {
      split: "x",
      children: [
        {
          split: "y",
          children: [
            {
              zone: "ports-left",
              takes: ["port:left"],
              pack: "y",
              grow: 1,
              edge: "left",
              align: "end",
              packFrom: "end",
            },
            {
              zone: "drive-bay",
              takes: ["drive"],
              pack: "y",
              grow: 1,
              align: "centre",
              capacity: 2,
              name: "Side bay",
            },
          ],
        },
        {
          split: "y",
          children: [
            {
              split: "x",
              children: [
                {
                  zone: "spk-l",
                  takes: ["spk"],
                  pack: "x",
                  grow: 1,
                  align: "centre",
                },
                {
                  zone: "ports-front",
                  takes: ["port:front"],
                  pack: "x",
                  grow: 1,
                  edge: "front",
                  align: "centre",
                },
                {
                  zone: "spk-r",
                  takes: ["spk"],
                  pack: "x",
                  grow: 1,
                  align: "centre",
                },
              ],
            },
            {
              zone: "board",
              takes: ["board"],
              pack: "x",
              grow: 2,
              align: "centre",
            },
          ],
        },
        {
          split: "y",
          children: [
            {
              zone: "ports-right",
              takes: ["port:right"],
              pack: "y",
              grow: 1,
              edge: "right",
              align: "end",
              packFrom: "end",
            },
            {
              zone: "optical-bay",
              takes: ["odd"],
              pack: "x",
              grow: 1,
              edge: "right",
              capacity: 1,
            },
          ],
        },
      ],
    },
    {
      split: "x",
      children: [
        {
          zone: "hinge-l",
          takes: ["hinge"],
          pack: "x",
          grow: 0,
          edge: "rear",
          align: "start",
        },
        {
          zone: "fan-l",
          takes: ["fan", "fin"],
          pack: "x",
          grow: 4,
          edge: "rear",
        },
        // A drive moved beside the battery, into the rear row.
        {
          zone: "drive-rear",
          takes: [],
          may: ["drive"],
          pack: "x",
          grow: 0,
          align: "centre",
          capacity: 2,
          name: "Battery row",
        },
        {
          zone: "battery",
          takes: ["battery"],
          pack: "x",
          grow: 1,
          edge: "rear",
          align: "centre",
        },
        {
          zone: "fan-r",
          takes: ["fan", "fin"],
          pack: "x",
          grow: 4,
          edge: "rear",
        },
        {
          zone: "hinge-r",
          takes: ["hinge"],
          pack: "x",
          grow: 0,
          edge: "rear",
          align: "end",
        },
      ],
    },
  ],
};

// Shared by every layout. Deck: palm rest (trackpad centred), keyboard, hinge strip.
export const DECK: Plan = {
  id: "deck",
  root: {
    split: "y",
    children: [
      {
        zone: "palm-rest",
        takes: ["pad"],
        pack: "y",
        grow: 1,
        align: "centre",
        // With no trackpad the palm rest stays, so the keyboard keeps its place by the hinge.
        keep: true,
      },
      {
        zone: "keyboard",
        takes: ["keys"],
        pack: "x",
        grow: 0,
        align: "centre",
      },
      {
        zone: "hinge-strip",
        takes: ["hinge-strip"],
        pack: "x",
        grow: 0,
        edge: "rear",
      },
    ],
  },
};

// Lid, in the lid's own frame: y = 0 at the hinge, so the chin comes first.
export const LID: Plan = {
  id: "lid",
  root: {
    split: "y",
    children: [
      {
        zone: "chin",
        takes: ["bezel-chin", "inverter"],
        pack: "x",
        grow: 2,
        align: "centre",
      },
      {
        split: "x",
        children: [
          {
            zone: "bezel-left",
            takes: ["bezel-side"],
            pack: "x",
            grow: 1,
            edge: "left",
          },
          {
            zone: "panel",
            takes: ["panel"],
            pack: "x",
            grow: 0,
            align: "centre",
          },
          {
            zone: "bezel-right",
            takes: ["bezel-side"],
            pack: "x",
            grow: 1,
            edge: "right",
          },
        ],
      },
      {
        zone: "top-bezel",
        takes: ["bezel-top", "webcam", "kblight"],
        pack: "x",
        grow: 1,
        align: "centre",
      },
    ],
  },
};

export const PLANS: Plan[] = [DECK, LID];

export const LAYOUTS: Layout[] = [
  {
    id: "a",
    name: "Battery front",
    from: 1995,
    until: 2099,
    floor: floorA,
    deck: "deck",
    lid: "lid",
    portSides: ["left", "right", "rear"],
  },
  {
    id: "b",
    name: "Battery rear",
    from: 1995,
    until: 2099,
    floor: floorB,
    deck: "deck",
    lid: "lid",
    portSides: ["left", "right", "front"],
  },
  {
    id: "c",
    name: "Big bays",
    from: 1995,
    until: 2099,
    floor: floorC,
    deck: "deck",
    lid: "lid",
    portSides: ["left", "right", "front"],
  },
];
