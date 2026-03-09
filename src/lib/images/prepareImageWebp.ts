import { IMAGE_PRESETS, optimizeImageForUpload } from "./optimizeImageUpload";

export async function prepareImageWebp(file: File): Promise<Blob> {
  const result = await optimizeImageForUpload(file, IMAGE_PRESETS.product);
  return result.blob;
}
