import manifest from './forenseia-assets.json';

export type ForenseIAAsset = (typeof manifest.assets)[number];

export const forenseiaAssets = manifest.assets;

export function getForenseIAAsset(id: string): ForenseIAAsset | undefined {
  return forenseiaAssets.find((asset) => asset.id === id);
}

export function getForenseIAAssetsByCategory(category: string): ForenseIAAsset[] {
  return forenseiaAssets.filter((asset) => asset.category === category);
}
