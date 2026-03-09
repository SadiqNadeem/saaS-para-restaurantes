export type ImageOptimizationPreset = {
  maxInputBytes: number;
  maxWidth: number;
  maxHeight: number;
  initialQuality: number;
  minQuality: number;
  qualityStep: number;
  targetBytes: number;
};

export type OptimizedImageResult = {
  blob: Blob;
  width: number;
  height: number;
  qualityUsed: number;
  originalBytes: number;
  outputBytes: number;
};

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const IMAGE_PRESETS: Record<"product" | "logo" | "banner", ImageOptimizationPreset> = {
  product: {
    maxInputBytes: 10 * 1024 * 1024,
    maxWidth: 1200,
    maxHeight: 1200,
    initialQuality: 0.82,
    minQuality: 0.58,
    qualityStep: 0.08,
    targetBytes: 360 * 1024,
  },
  logo: {
    maxInputBytes: 8 * 1024 * 1024,
    maxWidth: 640,
    maxHeight: 640,
    initialQuality: 0.9,
    minQuality: 0.68,
    qualityStep: 0.07,
    targetBytes: 180 * 1024,
  },
  banner: {
    maxInputBytes: 12 * 1024 * 1024,
    maxWidth: 1600,
    maxHeight: 900,
    initialQuality: 0.84,
    minQuality: 0.6,
    qualityStep: 0.08,
    targetBytes: 520 * 1024,
  },
};

function isAllowedImageType(type: string) {
  return ALLOWED_IMAGE_TYPES.has(type);
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo procesar la imagen seleccionada."));
    };

    image.src = objectUrl;
  });
}

function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo convertir la imagen a WebP."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

export async function optimizeImageForUpload(
  file: File,
  preset: ImageOptimizationPreset
): Promise<OptimizedImageResult> {
  if (!isAllowedImageType(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WEBP.");
  }

  if (file.size > preset.maxInputBytes) {
    throw new Error(
      `La imagen supera ${(preset.maxInputBytes / (1024 * 1024)).toFixed(0)}MB.`
    );
  }

  const image = await loadImageFromFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("No se pudo leer el tamano de la imagen.");
  }

  const widthScale = preset.maxWidth / sourceWidth;
  const heightScale = preset.maxHeight / sourceHeight;
  const scale = Math.min(1, widthScale, heightScale);

  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas no disponible para procesar la imagen.");
  }
  ctx.drawImage(image, 0, 0, width, height);

  let quality = preset.initialQuality;
  let bestBlob = await encodeWebp(canvas, quality);

  while (bestBlob.size > preset.targetBytes && quality - preset.qualityStep >= preset.minQuality) {
    quality = Math.max(preset.minQuality, quality - preset.qualityStep);
    bestBlob = await encodeWebp(canvas, quality);
  }

  return {
    blob: bestBlob,
    width,
    height,
    qualityUsed: quality,
    originalBytes: file.size,
    outputBytes: bestBlob.size,
  };
}
