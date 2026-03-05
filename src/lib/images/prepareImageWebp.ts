const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_WIDTH = 900;
const WEBP_QUALITY = 0.75;

export function isAllowedImageType(type: string) {
  return ALLOWED_IMAGE_TYPES.has(type);
}

export function isAllowedImageSize(size: number) {
  return size <= MAX_IMAGE_BYTES;
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

function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
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
      WEBP_QUALITY
    );
  });
}

export async function prepareImageWebp(file: File): Promise<Blob> {
  if (!isAllowedImageType(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WEBP.");
  }

  if (!isAllowedImageSize(file.size)) {
    throw new Error("La imagen supera 3MB.");
  }

  const image = await loadImageFromFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("No se pudo leer el tamaño de la imagen.");
  }

  const scale = sourceWidth > MAX_WIDTH ? MAX_WIDTH / sourceWidth : 1;
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
  return canvasToWebpBlob(canvas);
}
