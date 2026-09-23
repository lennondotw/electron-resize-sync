/**
 * Generates a tileable blue-noise threshold map with the void-and-cluster
 * method (Ulichney 1993). Distances wrap around the edges, so the map repeats
 * seamlessly. Returns ranks 0..size²-1 in row-major order.
 */
export function createBlueNoise(size: number, seed = 1): Uint32Array {
  const count = size * size;
  const random = mulberry32(seed);
  const sigma = 1.5;
  const radius = Math.ceil(sigma * 4);

  // Gaussian weights for every wrapped offset within `radius`.
  const kernel: { dx: number; dy: number; weight: number }[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      kernel.push({ dx, dy, weight: Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) });
    }
  }

  const spread = (energy: Float64Array, index: number, sign: number) => {
    const x = index % size;
    const y = (index - x) / size;
    for (const { dx, dy, weight } of kernel) {
      const nx = (x + dx + size) % size;
      const ny = (y + dy + size) % size;
      energy[ny * size + nx] = (energy[ny * size + nx] ?? 0) + sign * weight;
    }
  };

  const find = (pattern: Uint8Array, energy: Float64Array, value: number, pick: "max" | "min") => {
    let best = -1;
    let bestEnergy = pick === "max" ? -Infinity : Infinity;
    for (let i = 0; i < count; i += 1) {
      if (pattern[i] !== value) continue;
      const e = energy[i] ?? 0;
      if (pick === "max" ? e > bestEnergy : e < bestEnergy) {
        best = i;
        bestEnergy = e;
      }
    }
    return best;
  };

  // Initial binary pattern: ~10% random minority pixels, relaxed until evenly spread.
  const initial = new Uint8Array(count);
  const initialEnergy = new Float64Array(count);
  const minority = Math.max(1, Math.floor(count / 10));
  for (let placed = 0; placed < minority;) {
    const i = Math.floor(random() * count);
    if (initial[i]) continue;
    initial[i] = 1;
    spread(initialEnergy, i, 1);
    placed += 1;
  }
  for (;;) {
    const cluster = find(initial, initialEnergy, 1, "max");
    initial[cluster] = 0;
    spread(initialEnergy, cluster, -1);
    const vacancy = find(initial, initialEnergy, 0, "min");
    initial[vacancy] = 1;
    spread(initialEnergy, vacancy, 1);
    if (vacancy === cluster) break;
  }

  const ranks = new Uint32Array(count);

  // Phase 1: rank the initial pattern by repeatedly removing its tightest cluster.
  const pattern = initial.slice();
  const energy = initialEnergy.slice();
  for (let rank = minority - 1; rank >= 0; rank -= 1) {
    const cluster = find(pattern, energy, 1, "max");
    pattern[cluster] = 0;
    spread(energy, cluster, -1);
    ranks[cluster] = rank;
  }

  // Phases 2 and 3: fill the largest remaining void until every pixel is ranked.
  pattern.set(initial);
  energy.set(initialEnergy);
  for (let rank = minority; rank < count; rank += 1) {
    const vacancy = find(pattern, energy, 0, "min");
    pattern[vacancy] = 1;
    spread(energy, vacancy, 1);
    ranks[vacancy] = rank;
  }

  return ranks;
}

/** Small seeded PRNG so the texture is the same on every launch. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
