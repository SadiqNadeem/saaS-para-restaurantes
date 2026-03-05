export const DELIVERY_BASE = {
  lat: 38.39706887411827,
  lng: -0.5234438654338988,
};

export const DELIVERY_RADIUS_KM = 5;

type Point = {
  lat: number;
  lng: number;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

export function distanceKm(base: Point, customer: Point): number {
  const earthRadiusKm = 6371;

  const dLat = toRadians(customer.lat - base.lat);
  const dLng = toRadians(customer.lng - base.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(base.lat)) *
      Math.cos(toRadians(customer.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function validateRadius({
  base,
  customer,
  radiusKm,
}: {
  base: Point;
  customer: Point;
  radiusKm: number;
}): { distanceKm: number; isWithinRadius: boolean } {
  const km = distanceKm(base, customer);

  return {
    distanceKm: km,
    isWithinRadius: km <= radiusKm,
  };
}
