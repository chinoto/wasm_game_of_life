import init, { Universe, Cell } from "wasm-game-of-life";
let { memory } = await init();

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
function getElementByIdOrThrow(id: string): HTMLElement {
  return document.getElementById(id) ?? throwError("Element not found");
}
const roundTenth = (x: number) => Math.round(x * 10) / 10;

// Give the canvas room for all of our cells and a 1px border
// around each of them.
const canvas = getElementByIdOrThrow("game-of-life-canvas");
if (!(canvas instanceof HTMLCanvasElement)) {
  throwError("Element is not Canvas");
}
canvas.height = (CELL_SIZE + 1) * height + 1;
canvas.width = (CELL_SIZE + 1) * width + 1;

const ctx =
  canvas.getContext("2d") ?? throwError("Failed to acquire canvas context");

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

const grid = ctx.getImageData(0, 0, canvas.width, canvas.height);
ctx.fillStyle = ALIVE_COLOR;

const getIndex = (row: number, column: number) => row * width + column;

const drawCells = () => {
  const cellsPtr = universe.cells();
  const cells = new Uint8Array(memory.buffer, cellsPtr, width * height);

  ctx.putImageData(grid, 0, 0);
  ctx.beginPath();

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = getIndex(row, col);
      if (cells[idx] != Cell.Alive) {
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

  ctx.stroke();
};

let paused = false;
let interval = 1;
const playPauseButton = getElementByIdOrThrow("play-pause");
const rateSlider = getElementByIdOrThrow("rate");
if (!(rateSlider instanceof HTMLInputElement)) {
  throwError("rateSlider is not an input");
}
const rateDisplay = getElementByIdOrThrow("rate_display");
const clearButton = getElementByIdOrThrow("clear");

playPauseButton.addEventListener("click", (event) => {
  paused = !paused;
  playPauseButton.textContent = paused ? "⏸" : "▶";
});
playPauseButton.click(); // Run once to get play/pause indicator

rateSlider.addEventListener("input", (event) => {
  let rate = rateSlider.valueAsNumber;
  // Convert 0-25-100 to 0.2-1-1000
  if (rate < 25) {
    rate = 0.2 + (rate / 25) * 0.8;
  } else {
    // pow to make smaller values easier to select
    rate = 1 + Math.pow((rate - 25) / 75, 2) * 999;
  }
  interval = 1000 / rate;
  rateDisplay.textContent = `${roundTenth(rate)}`;
});
rateSlider.dispatchEvent(new Event("input"));

clearButton.addEventListener("click", (event) => {
  universe.reset_cells();
  drawCells();
});

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
    const frameTime = now - this.lastFrameTimeStamp;
    this.lastFrameTimeStamp = now;

    // Save only the latest 100 timings.
    this.frames.unshift(frameTime);
    this.frames.splice(100);
    const frames = this.frames;

    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    // Render the statistics.
    this.fps.textContent = `
Frames per Second:
         latest = ${roundTenth(1000 / frameTime)}
avg of last 100 = ${roundTenth(1000 / mean)}
min of last 100 = ${roundTenth(1000 / Math.max(...frames))}
max of last 100 = ${roundTenth(1000 / Math.min(...frames))}
`.trim();
  }
})();

(async function renderLoop() {
  let lastFrameStart = performance.now();
  let delta = 0;
  drawCells();
  let tickTimes: number[] = [];
  let lastFrameEnd = 0;
  while (true) {
    // setTimeout looks janky
    // await new Promise((res) => setTimeout(res, 1000 / 30));
    let thisFrameStart = await new Promise(requestAnimationFrame);
    const timeDiff = thisFrameStart - lastFrameStart;
    if (paused || timeDiff < interval - delta) {
      continue;
    }
    delta += timeDiff;
    lastFrameStart = thisFrameStart;
    const idleTime = thisFrameStart - lastFrameEnd;
    // When the target fps is higher than the refresh rate, this threshold should
    // allow extra work to be done (80% of the time) without missing a frame.
    const maxFrameTime = Math.min(100, idleTime * 4);

    fps.render();
    fps.fps.textContent += `\ntps=${roundTenth(
      (1000 * tickTimes.length) /
        (thisFrameStart - tickTimes[tickTimes.length - 1])
    )}`;

    while (delta > interval) {
      universe.tick();
      delta -= interval;
      let now = performance.now();
      tickTimes.unshift(now);
      tickTimes.splice(100);
      if (now - thisFrameStart > maxFrameTime) {
        break;
      }
    }
    delta = Math.min(interval, delta);

    drawCells();
    lastFrameEnd = performance.now();
  }
})();
