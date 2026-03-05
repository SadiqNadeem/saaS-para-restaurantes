type SupabaseLike = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        fileBody: Blob,
        options: { upsert: boolean; contentType?: string }
      ) => Promise<{ error: { message?: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

export async function uploadProductImage(
  supabase: SupabaseLike,
  productId: string,
  blob: Blob
): Promise<string> {
  const path = `${productId}/${Date.now()}.webp`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, blob, { upsert: true, contentType: "image/webp" });

  if (error) {
    throw new Error(error.message ?? "No se pudo subir la imagen.");
  }

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}
