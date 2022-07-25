import { parse } from "./gifparser/parse";

const gif = await parse("sample.gif");
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = gif.width;
canvas.height = gif.height;
const ctx = canvas.getContext("2d");
const scale = 1;
let frameIndex = 0;

const update = () => {
  if (ctx && frameIndex < gif.imageBlocks.length) {
    const block = gif.imageBlocks[frameIndex];
    frameIndex = (frameIndex + 1) % gif.imageBlocks.length;

    let i = 0;
    for (let y = block.top; y < block.top + block.height; y++) {
      for (let x = block.left; x < block.left + block.width; x++) {
        const r = block.colors[i];
        const g = block.colors[i + 1];
        const b = block.colors[i + 2];
        const a = block.colors[i + 3];
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fillRect(x * scale, y * scale, scale, scale);
        i += 4;
      }
    }
  }

  requestAnimationFrame(update);
};
update();
