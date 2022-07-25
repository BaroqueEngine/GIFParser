import { Gif, ImageBlock } from "../@types/index";

export const decodeLZW = (minCodeSize: number, data: Uint8Array, pixelCount: number): number[] => {
  const maxStackSize = 2 ** 12;
  const nullCode = -1;
  const clearCode = 2 ** minCodeSize;
  const endCode = clearCode + 1;
  const ret = [];
  const prefix = [];
  const suffix = [];
  const pixelStack = [];

  let dataSize = minCodeSize;
  let available = clearCode + 2;
  let oldCode = nullCode;
  let codeSize = dataSize + 1;
  let codeMask = 2 ** codeSize - 1;
  let datum = 0;
  let bits = 0;
  let first = 0;
  let pixelStackPointer = 0;
  let pi = 0;
  let bi = 0;

  for (let i = 0; i < clearCode; i++) {
    prefix[i] = 0;
    suffix[i] = i;
  }

  let i = 0;
  while (i < pixelCount) {
    if (pixelStackPointer === 0) {
      if (bits < codeSize) {
        datum += data[bi++] << bits;
        bits += 8;
        continue;
      }

      let code = datum & codeMask;
      datum >>= codeSize;
      bits -= codeSize;

      if (code > available || code === endCode) {
        break;
      }

      if (code === clearCode) {
        codeSize = dataSize + 1;
        codeMask = 2 ** codeSize - 1;
        available = clearCode + 2;
        oldCode = nullCode;
        continue;
      }

      if (oldCode === nullCode) {
        pixelStack[pixelStackPointer++] = suffix[code];
        oldCode = code;
        first = code;
        continue;
      }

      const inCode = code;

      if (code === available) {
        pixelStack[pixelStackPointer++] = first;
        code = oldCode;
      }

      while (code > clearCode) {
        pixelStack[pixelStackPointer++] = suffix[code];
        code = prefix[code];
      }

      first = suffix[code] & 0xff;
      pixelStack[pixelStackPointer++] = first;

      if (available < maxStackSize) {
        prefix[available] = oldCode;
        suffix[available] = first;
        available++;

        if ((available & codeMask) === 0 && available < maxStackSize) {
          codeSize++;
          codeMask += available;
        }
      }

      oldCode = inCode;
    }

    pixelStackPointer--;
    ret[pi++] = pixelStack[pixelStackPointer];
    i++;
  }

  for (i = pi; i < pixelCount; i++) {
    ret[i] = 0;
  }

  return ret;
};

export const parse = async (fileName: string): Promise<Gif> => {
  const response = await fetch(fileName);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  let pos = 0;
  const readByte = () => {
    return buffer[pos++];
  };
  const readBytes = (n: number) => {
    const ret: number[] = [];
    for (let i = 0; i < n; i++) {
      ret.push(readByte());
    }
    return ret;
  };

  type Color = {
    r: number;
    g: number;
    b: number;
  };
  const readColor = (): Color => {
    const r = readByte();
    const g = readByte();
    const b = readByte();
    return { r, g, b };
  };
  const readBit = (byte: number, pos: number, size: number): number => {
    const v = byte >> (pos - size);
    const mask = 2 ** size - 1;

    return v & mask;
  };
  const readReversed2Byte = () => {
    const [a, b] = [readByte(), readByte()];
    return (b << 8) | a;
  };

  readBytes(3); // signature
  readBytes(3); // version
  const w = readReversed2Byte();
  const h = readReversed2Byte();
  const v = readByte();
  const globalColorTableFlag = readBit(v, 8, 1) === 1;
  readBit(v, 7, 3); // colorResolution
  readBit(v, 4, 1); // sortFlag
  const globalColorTableSize = readBit(v, 3, 3);
  readByte(); // bgColorIndex
  readByte(); // pixelAspectRatio

  const globalColorTable: Color[] = [];
  if (globalColorTableFlag) {
    for (let i = 0; i < 2 ** (globalColorTableSize + 1); i++) {
      globalColorTable.push(readColor());
    }
  }

  const imageBlocks: ImageBlock[] = [];

  const loadImageBlock = () => {
    const left = readReversed2Byte();
    const top = readReversed2Byte();
    const width = readReversed2Byte();
    const height = readReversed2Byte();
    const v = readByte();
    const localColorTableFlag = readBit(v, 8, 1) === 1;
    readBit(v, 7, 1); // interlaceFlag
    readBit(v, 6, 1); // sortFlag
    readBit(v, 5, 2); // reserved
    const localColorTableSize = readBit(v, 3, 3);
    const localColorTable: Color[] = [];
    if (localColorTableFlag) {
      for (let i = 0; i < 2 ** (localColorTableSize + 1); i++) {
        localColorTable.push(readColor());
      }
    }

    const lzwMinCodeSize = readByte();
    let imageData: number[] = [];
    while (true) {
      const blockSize = readByte();
      if (blockSize === 0) {
        break;
      }

      imageData = imageData.concat(readBytes(blockSize));
    }
    const decodedData = decodeLZW(lzwMinCodeSize, new Uint8Array(imageData), width * height);
    const colors: number[] = [];
    for (const d of decodedData) {
      const { r, g, b } = localColorTableFlag ? localColorTable[d] : globalColorTable[d];
      const a = (transparentColorFlag && transparentColorIndex) === d ? 0 : 255;
      colors.push(r, g, b, a);
    }
    imageBlocks.push({ left, top, width, height, colors });
  };

  let transparentColorFlag = false;
  let transparentColorIndex: number;

  const loadGraphicControlExtension = () => {
    readByte(); // blockSize
    const v = readByte();
    transparentColorFlag = readBit(v, 1, 1) === 1;
    readBytes(2); // delayTime
    transparentColorIndex = readByte(); // transparentColorIndex
    readByte(); // blockTerminator
  };

  const loadCommentExtension = () => {
    while (true) {
      const blockSize = readByte();
      if (blockSize === 0) {
        break;
      }
      readBytes(blockSize); // commentData
    }
  };

  const loadPlainTextExtension = () => {
    readByte(); // blockSize
    readBytes(2); // textGridLeftPosition
    readBytes(2); // textGridTopPosition
    readBytes(2); // textGridWidth
    readBytes(2); // textGridHeight
    readByte(); // characterCellWidth
    readByte(); // characterCellHeight
    readByte(); // textForegroundColorIndex
    readByte(); // textBackgroundColorIndex
    while (true) {
      const blockSize = readByte();
      if (blockSize === 0) {
        break;
      }
      readBytes(blockSize); // plainTextData
    }
  };

  const loadApplicationExtension = () => {
    readByte(); // blockSize
    readBytes(8); // applicationIdentifier
    readBytes(3); // applicationAuthenticationCode
    while (true) {
      const blockSize = readByte();
      if (blockSize === 0) {
        break;
      }
      readBytes(blockSize); // applicationData
    }
  };

  const Exit = 0x3b;
  const ImageBlock = 0x2c;
  const ExtensionBlock = 0x21;
  const GraphicControlExtension = 0xf9;
  const CommentExtension = 0xfe;
  const PlainTextExtension = 0x01;
  const ApplicationExtension = 0xff;

  while (true) {
    const type = readByte();
    if (type === Exit) {
      break;
    } else if (type === ImageBlock) {
      loadImageBlock();
    } else if (type === ExtensionBlock) {
      const label = readByte();
      switch (label) {
        case GraphicControlExtension:
          loadGraphicControlExtension();
          break;
        case CommentExtension:
          loadCommentExtension();
          break;
        case PlainTextExtension:
          loadPlainTextExtension();
          break;
        case ApplicationExtension:
          loadApplicationExtension();
          break;
        default:
          break;
      }
    }
  }

  return { width: w, height: h, imageBlocks };
};
