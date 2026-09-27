import { describe, expect, it } from "vitest";
import { cardinal, ordinal, speak } from "./speech";

describe("speak", () => {
  const cases: [string, string][] = [
    // Prices.
    ["$1,299", "twelve ninety-nine"],
    ["$1,549", "fifteen forty-nine"],
    ["$999", "nine ninety-nine"],
    ["$1,500", "fifteen hundred dollars"],
    ["$800", "eight hundred dollars"],
    ["$2,000", "two thousand dollars"],
    ["$2,005", "two thousand five dollars"],
    ["$12,999", "twelve thousand nine hundred ninety-nine dollars"],
    ["$49.99", "forty-nine dollars and ninety-nine cents"],
    ["Is it worth $1,549?", "Is it worth fifteen forty-nine?"],
    // Years.
    ["2016", "twenty sixteen"],
    ["2006", "two thousand six"],
    ["2010", "twenty ten"],
    ["1999", "nineteen ninety-nine"],
    ["2000", "two thousand"],
    ["the first quarter of 2016", "the first quarter of twenty sixteen"],
    ["Best Value 2016", "Best Value twenty sixteen"],
    ["Q1 2016", "Q one twenty sixteen"],
    // Model numbers and names.
    ["XPS 13 9350", "X P S thirteen ninety-three fifty"],
    ["i7-6500U", "i seven sixty-five hundred U"],
    ["i5-8250U", "i five eighty-two fifty U"],
    ["i9-13900K", "i nine thirteen nine hundred K"],
    ["ThinkPad T550", "ThinkPad T five fifty"],
    ["Core 2 Duo T7200", "Core two Duo T seventy-two hundred"],
    ["Ryzen 7 5800H", "Ryzen seven fifty-eight hundred H"],
    ["GeForce RTX 3060", "GeForce R T X thirty sixty"],
    ["GeForce GTX 1050 Ti", "GeForce G T X ten fifty tie"],
    ["HD Graphics 520", "H D Graphics five twenty"],
    ["Radeon 680M", "Radeon six eighty M"],
    ["Apple M1 Pro", "Apple M one Pro"],
    ["AMD Turion 64 X2 TL-52", "ay M D Turion sixty-four X two T L fifty-two"],
    ["Mobile Sempron 3200+", "Mobile Sempron thirty-two hundred plus"],
    ["Turion II Ultra M600", "Turion two Ultra M six hundred"],
    ["Core Ultra 7 155H", "Core Ultra seven one fifty-five H"],
    ["Arc 140V", "Arc one forty V"],
    ["a 1080p screen", "a ten eighty P screen"],
    ["a 4K panel", "a four K panel"],
    // Units.
    ["14.2 h", "fourteen point two hours"],
    ["1 h", "one hour"],
    ["1.3 kg", "one point three kilos"],
    ["16GB", "sixteen gigabytes"],
    ["16 GB", "sixteen gigabytes"],
    ["1 TB", "one terabyte"],
    ["144 Hz", "one hundred forty-four hertz"],
    ["400 nits", "four hundred nits"],
    ["1,000 nits", "one thousand nits"],
    ["15.6 mm", "fifteen point six millimetres"],
    ["65W", "sixty-five watts"],
    ["57 Wh", "fifty-seven watt-hours"],
    ["120 fps", "one hundred twenty frames per second"],
    ["32 dB", "thirty-two decibels"],
    ['13.3"', "thirteen point three inches"],
    ["2.4 GHz", "two point four gigahertz"],
    // Percentages, ordinals, ranges.
    ["6.9%", "six point nine percent"],
    ["12%", "twelve percent"],
    ["6.0%", "six percent"],
    ["1st", "first"],
    ["22nd", "twenty-second"],
    ["3rd", "third"],
    ["11th gen", "eleventh gen"],
    ["20th", "twentieth"],
    ["8-16 GB", "eight to sixteen gigabytes"],
    ["2016-2018", "twenty sixteen to twenty eighteen"],
    ["#1 in Q3", "number one in Q three"],
    // Acronyms.
    ["an OLED screen", "an oh-led screen"],
    ["an IPS panel", "an I P S panel"],
    ["a fast SSD", "a fast S S D"],
    ["two SSDs", "two S S D's"],
    ["USB-C charging", "U S B C charging"],
    ["HDMI and USB", "H D M I and U S B"],
    ["8 GB of RAM", "eight gigabytes of ram"],
    ["NVMe storage", "N V M E storage"],
    ["Wi-Fi 6", "wi-fi six"],
    // Plain figures.
    ["782 thousand units sold.", "seven hundred eighty-two thousand units sold."],
    ["Critics gave it 87 out of 100.", "Critics gave it eighty-seven out of one hundred."],
    ["1,234,567", "one million two hundred thirty-four thousand five hundred sixty-seven"],
    ["11.5 hours of browsing", "eleven point five hours of browsing"],
    ["The 2-in-1 sold", "The two in one sold"],
    // Text without figures is left alone.
    ["First, the good stuff.", "First, the good stuff."],
    ["Great keyboard and trackpad", "Great keyboard and trackpad"],
  ];
  it.each(cases)("%s", (input, spoken) => {
    expect(speak(input)).toBe(spoken);
  });

  it("leaves no digits, dollar signs or percent signs", () => {
    const line = "It moved 1.2 million units, 14.5% of the market, at $1,299 with an i7-8550U, 16GB and a 512 GB SSD in 2018.";
    expect(speak(line)).not.toMatch(/[\d$%]/);
  });
});

describe("cardinal and ordinal", () => {
  it.each([
    [0, "zero"],
    [15, "fifteen"],
    [40, "forty"],
    [101, "one hundred one"],
    [1000000, "one million"],
  ] as const)("%d", (n, words) => expect(cardinal(n)).toBe(words));

  it.each([
    [1, "first"],
    [12, "twelfth"],
    [40, "fortieth"],
    [101, "one hundred first"],
  ] as const)("%d", (n, words) => expect(ordinal(n)).toBe(words));
});
