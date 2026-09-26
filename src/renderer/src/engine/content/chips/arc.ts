import type { GpuRow } from "./rows";

// Intel Arc Alchemist laptop GPUs. Shaders are Xe cores x 128.
export const ARC: GpuRow[] = [
  { id: "arc-a350m", name: "Intel Arc A350M", gen: "arc-alchemist", launch: [2022, 1], shaders: 768, base: 1150, boost: 2200, memGb: 4, memType: "GDDR6", busBits: 64, tgp: [25, 35], mount: "soldered", dx: "dx12u", rt: true, upscaling: true, gflops: 3379.2, timeSpy: 3050, process: "TSMC N6" },
  { id: "arc-a370m", name: "Intel Arc A370M", gen: "arc-alchemist", launch: [2022, 1], shaders: 1024, base: 1550, boost: 2050, memGb: 4, memType: "GDDR6", busBits: 64, tgp: [35, 50], mount: "soldered", dx: "dx12u", rt: true, upscaling: true, gflops: 4198.4, timeSpy: 3885, process: "TSMC N6" },
  { id: "arc-a530m", name: "Intel Arc A530M", gen: "arc-alchemist", launch: [2023, 3], shaders: 1536, boost: 1300, memGb: 8, memType: "GDDR6", busBits: 128, tgp: [65, 95], mount: "soldered", dx: "dx12u", rt: true, upscaling: true, gflops: 3993.6, process: "TSMC N6" },
  { id: "arc-a550m", name: "Intel Arc A550M", gen: "arc-alchemist", launch: [2022, 2], shaders: 2048, base: 900, boost: 1700, memGb: 8, memType: "GDDR6", busBits: 128, tgp: [60, 80], mount: "soldered", dx: "dx12u", rt: true, upscaling: true, gflops: 6963.2, timeSpy: 5830, process: "TSMC N6" },
  { id: "arc-a570m", name: "Intel Arc A570M", gen: "arc-alchemist", launch: [2023, 3], shaders: 2048, boost: 1300, memGb: 8, memType: "GDDR6", busBits: 128, tgp: [75, 95], mount: "soldered", dx: "dx12u", rt: true, upscaling: true, gflops: 5324.8, process: "TSMC N6" },
  { id: "arc-a730m", name: "Intel Arc A730M", gen: "arc-alchemist", launch: [2022, 2], shaders: 3072, base: 1100, boost: 2050, memGb: 12, memType: "GDDR6", busBits: 192, tgp: [80, 120], mount: "soldered", dx: "dx12u", rt: true, upscaling: true, gflops: 12595.2, timeSpy: 8813, process: "TSMC N6" },
  { id: "arc-a770m", name: "Intel Arc A770M", gen: "arc-alchemist", launch: [2022, 2], shaders: 4096, base: 1650, boost: 2050, memGb: 16, memType: "GDDR6", busBits: 256, tgp: [120, 150], mount: "soldered", dx: "dx12u", rt: true, upscaling: true, gflops: 16793.6, timeSpy: 10783, process: "TSMC N6" },
];
