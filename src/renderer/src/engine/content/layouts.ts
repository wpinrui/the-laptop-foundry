import type { Layout, Node, Plan } from "../types";

// Floor trees list children front to rear (split y) and left to right (split x).
// Side port strips pack from the rear (hinge end) toward the front, power
// rearmost; front and rear strips pack left to right, centred.
// Hinge mounts align to their outer side so they always sit at the rear corners,
// whatever else in their row grows or collapses.
// Cross-axis, every child stretches to its parent, so a zone reaches an outer
// edge exactly when it is the first or last child on the way down that axis.

// Layout A, "Battery front": battery row across the full front, fans venting
// rear either side of the board, rear ports between the fans, side ports in
// the rear block beside the hinges.
const floorA: Node = {
  split: "y",
  children: [
    {
      split: "x",
      children: [
        { zone: "spk-l", takes: ["spk"], pack: "y", grow: 1, align: "centre" },
        {
          zone: "drive-bay",
          takes: ["drive"],
          pack: "x",
          grow: 1,
          align: "centre",
          capacity: 2,
        },
        {
          zone: "battery",
          takes: ["battery"],
          pack: "x",
          grow: 1,
          align: "centre",
        },
        { zone: "spk-r", takes: ["spk"], pack: "y", grow: 1, align: "centre" },
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
        {
          zone: "fan-r",
          takes: ["fan", "fin"],
          pack: "x",
          grow: 4,
          edge: "rear",
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

// Layout B, "Battery rear": front port strip; then side columns with the side
// ports running from the front back to the fan (left) and the optical bay
// (right), speakers and drive bay in front of the board between them; then
// hinges either side of the removable battery on the rear edge.
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
              zone: "ports-left",
              takes: ["port:left"],
              pack: "y",
              grow: 1,
              edge: "left",
              align: "end",
              packFrom: "end",
            },
            {
              zone: "fan",
              takes: ["fan", "fin"],
              pack: "y",
              grow: 4,
              edge: "left",
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
          zone: "battery",
          takes: ["battery"],
          pack: "x",
          grow: 1,
          edge: "rear",
          align: "centre",
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
