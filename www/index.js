import { Universe } from "wasm-game-of-life";

const pre = document.getElementById("game-of-life-canvas");
const universe = Universe.new();

(async () => {
  while (true) {
    pre.textContent = universe.render();
    universe.tick();

    await new Promise(requestAnimationFrame);
  }
})();
