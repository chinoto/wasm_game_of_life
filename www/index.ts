import { memory } from "wasm-game-of-life/wasm_game_of_life_bg.wasm";
import { Universe, Cell } from "wasm-game-of-life";

const CELL_SIZE = 5; // px
const GRID_COLOR = "#CCCCCC";
const DEAD_COLOR = "#FFFFFF";
const ALIVE_COLOR = "#000000";

// Construct the universe, and get its width and height.
const universe = Universe.new();
const width = universe.width();
const height = universe.height();
function throwError(msg: string): never {
  throw new Error(msg);
}

// Give the canvas room for all of our cells and a 1px border
// around each of them.
const canvas =
  document.getElementById("game-of-life-canvas") ??
  throwError("Element not found");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw Error("Element is not Canvas");
}
canvas.height = (CELL_SIZE + 1) * height + 1;
canvas.width = (CELL_SIZE + 1) * width + 1;

const ctx =
  canvas.getContext("2d") ?? throwError("Failed to acquire canvas context");

const getIndex = (row: number, column: number) => row * width + column;

const drawCells = () => {
  const cellsPtr = universe.cells();
  const cells = new Uint8Array(memory.buffer, cellsPtr, width * height);

  ctx.beginPath();

  for (let [filter, color] of <[number, string][]>[
    [Cell.Alive, ALIVE_COLOR],
    [Cell.Dead, DEAD_COLOR],
  ]) {
    ctx.fillStyle = color;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = getIndex(row, col);
        if (cells[idx] != filter) {
          continue;
        }
        ctx.fillRect(
          col * (CELL_SIZE + 1) + 1,
          row * (CELL_SIZE + 1) + 1,
          CELL_SIZE,
          CELL_SIZE
        );
      }
    }
  }

  ctx.stroke();
};

(function drawGrid() {
  ctx.beginPath();
  ctx.strokeStyle = GRID_COLOR;

  // Vertical lines.
  for (let i = 0; i <= width; i++) {
    ctx.moveTo(i * (CELL_SIZE + 1) + 1, 0);
    ctx.lineTo(i * (CELL_SIZE + 1) + 1, (CELL_SIZE + 1) * height + 1);
  }

  // Horizontal lines.
  for (let j = 0; j <= height; j++) {
    ctx.moveTo(0, j * (CELL_SIZE + 1) + 1);
    ctx.lineTo((CELL_SIZE + 1) * width + 1, j * (CELL_SIZE + 1) + 1);
  }

  ctx.stroke();
})();

let paused = false;
const playPauseButton =
  document.getElementById("play-pause") ?? throwError("Element not found");

playPauseButton.addEventListener("click", (event) => {
  paused = !paused;
  playPauseButton.textContent = paused ? "⏸" : "▶";
});

playPauseButton.click(); // Run once to get play/pause indicator

canvas.addEventListener("click", (event) => {
  const boundingRect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / boundingRect.width;
  const scaleY = canvas.height / boundingRect.height;

  const canvasLeft = (event.clientX - boundingRect.left) * scaleX;
  const canvasTop = (event.clientY - boundingRect.top) * scaleY;

  const row = Math.min(Math.floor(canvasTop / (CELL_SIZE + 1)), height - 1);
  const col = Math.min(Math.floor(canvasLeft / (CELL_SIZE + 1)), width - 1);

  universe.toggle_cell(row, col);

  drawCells();
});

const fps = new (class {
  fps;
  frames: number[];
  lastFrameTimeStamp;
  constructor() {
    this.fps = document.getElementById("fps");
    this.frames = [];
    this.lastFrameTimeStamp = performance.now();
  }

  render() {
    // Convert the delta time since the last frame render into a measure
    // of frames per second.
    const now = performance.now();
    const fps = 1000 / (now - this.lastFrameTimeStamp);
    this.lastFrameTimeStamp = now;

    // Save only the latest 100 timings.
    this.frames.unshift(fps);
    this.frames.splice(100);
    const frames = this.frames;

    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    const roundTenth = (x: number) => Math.round(x * 10) / 10;
    // Render the statistics.
    this.fps.textContent = `
Frames per Second:
         latest = ${roundTenth(fps)}
avg of last 100 = ${roundTenth(mean)}
min of last 100 = ${roundTenth(Math.min(...frames))}
max of last 100 = ${roundTenth(Math.max(...frames))}
`.trim();
  }
})();

(async function renderLoop() {
  let lastTime = performance.now();
  const interval = 1000 / 30;
  let delta = 0;
  drawCells();
  while (true) {
    // setTimeout looks janky
    // await new Promise((res) => setTimeout(res, 1000 / 30));
    let time = await new Promise(requestAnimationFrame);
    if (paused || time - lastTime < interval - delta) {
      continue;
    }
    fps.render();
    delta = Math.min(interval, delta + time - lastTime - interval);
    lastTime = time;

    universe.tick();
    drawCells();
  }
})();
