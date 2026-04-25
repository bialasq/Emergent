// Per-floor visual biome palette.
export const BIOMES = {
  stone: {
    name: "Stone Crypt",
    wallA: "#1c1815", wallB: "#322821", wallHi: "#433427",
    floorA: "#0f0d0b", floorB: "#181513", floorSpec: "#22201c",
    bg: "#050404",
    vignette: "rgba(255,170,80,0.02)",
  },
  catacombs: {
    name: "Catacombs",
    wallA: "#1a1c1f", wallB: "#272a30", wallHi: "#3a3f4a",
    floorA: "#0c0d0f", floorB: "#171a1f", floorSpec: "#3a4458",
    bg: "#040506",
    vignette: "rgba(120,200,220,0.03)",
  },
  infernal: {
    name: "Infernal Depths",
    wallA: "#1f0f0a", wallB: "#341811", wallHi: "#5a2110",
    floorA: "#0f0606", floorB: "#1c0a08", floorSpec: "#7a2a14",
    bg: "#0c0303",
    vignette: "rgba(255,80,30,0.06)",
  },
};

export function biomeForDepth(depth) {
  if (depth <= 2) return "stone";
  if (depth <= 4) return "catacombs";
  return "infernal";
}
