// Plain ES module data: shared by the no-build browser and Node without fetch/import assertions.
export const SURVIVAL_WAVES = {
  waves: [
    { counts: { walker: 4, runner: 0, tank: 0, exploder: 0 }, spawnInterval: 1.2, maxAlive: 3, breakSeconds: 6 },
    { counts: { walker: 4, runner: 2, tank: 0, exploder: 0 }, spawnInterval: 1, maxAlive: 4, breakSeconds: 7 },
    { counts: { walker: 5, runner: 2, tank: 1, exploder: 1 }, spawnInterval: 0.9, maxAlive: 6, breakSeconds: 8 },
    { counts: { walker: 6, runner: 3, tank: 1, exploder: 2 }, spawnInterval: 0.75, maxAlive: 8, breakSeconds: 9 },
    { counts: { walker: 8, runner: 4, tank: 2, exploder: 2 }, spawnInterval: 0.65, maxAlive: 10, breakSeconds: 10 },
  ],
  // Every wave after the table adds these counts to the last row per extra wave.
  // Timing, maxAlive and breakSeconds stay at the last row's values.
  overflow: { addPerWave: { walker: 2, runner: 1, tank: 0, exploder: 1 } },
};
