export async function geocodeAddress(
  addressText: string
): Promise<{ lat: number; lng: number } | null> {
  const query = addressText.trim();

  if (!query) {
    return null;
  }

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{ lat: string; lon: string }>;
  const first = data[0];

  if (!first) {
    return null;
  }

  const lat = Number(first.lat);
  const lng = Number(first.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}
