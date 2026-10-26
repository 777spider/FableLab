import manifest from './preset-art.json';

type Art = {url: string; width: number; height: number};
const images: Record<string, Art> = manifest;
const sizes = new Map(Object.values(images).map(image => [image.url, {width: image.width, height: image.height}]));
const props = (image: Art) => ({src: image.url, width: image.width, height: image.height});

export const forestArt = props(images.forest);
export const lighthouseArt = props(images.lighthouse);
export const presetArtURL = (source: string) => images[source].url;
export const presetArtSize = (url: string) => sizes.get(url);
