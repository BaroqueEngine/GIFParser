export declare type ImageBlock = {
  left: number;
  top: number;
  width: number;
  height: number;
  colors: number[];
};

export declare type Gif = {
  width: number;
  height: number;
  imageBlocks: ImageBlock[];
};
