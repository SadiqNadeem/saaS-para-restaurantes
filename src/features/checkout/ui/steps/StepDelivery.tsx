import { useMemo, useState } from "react";

import { supabase } from "../../../../lib/supabase";
import { useCheckoutStore } from "../../checkoutStore";
import { useRestaurant } from "../../../../restaurant/RestaurantContext";

type AddressDetails = {
  road?: string;
  pedestrian?: string;
  residential?: string;
  house_number?: string;
  city?: string;
  town?: string;
  village?: string;
  postcode?: string;
  [key: string]: string | undefined;
};

type AddressSearchResult = {
  label: string;
  lat: number;
  lng: number;
  address?: AddressDetails;
};

type DistanceValidation = {
  km: number | null;
  withinRadius: boolean;
};

type StepDeliveryProps = {
  onContinue?: () => void;
  disabledContinue?: boolean;
  primaryErrors?: string[];
};

type DeliveryFieldErrors = {
  street?: string;
  number?: string;
  addressText?: string;
  portal?: string;
  floor?: string;
  door?: string;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function validateSelectedAddress(sel: AddressSearchResult | null): boolean {
  if (!sel) return false;

  const label = sel.label ?? "";
  const addr = (sel.address ?? {}) as {
    house_number?: string;
    street_number?: string;
    number?: string;
  };

  const hasNumberInLabel = /\b\d+\b/.test(label);
  const hasHouseNumber = !!addr.house_number || !!addr.street_number || !!addr.number;

  return hasNumberInLabel || hasHouseNumber;
}

function validateBuildingFields(params: {
  isHouse?: boolean;
  portal?: string;
  floor?: string;
  door?: string;
}) {
  if (params.isHouse) {
    return true;
  }

  return Boolean(
    params.portal?.trim().length &&
      params.floor?.trim().length &&
      params.door?.trim().length
  );
}

function formatAddressText(street?: string, number?: string, city?: string, postcode?: string) {
  const line = `${street ?? ""} ${number ?? ""}`.trim();
  const cityLine = [postcode ?? "", city ?? ""].filter(Boolean).join(" ").trim();
  return [line, cityLine].filter(Boolean).join(", ").trim();
}

export default function StepDelivery({
  onContinue,
  disabledContinue = false,
  primaryErrors = [],
}: StepDeliveryProps) {
  const { restaurantId } = useRestaurant();
  const delivery = useCheckoutStore((s) => s.draft.delivery);
  const orderType = useCheckoutStore((s) => s.draft.orderType);
  const setDelivery = useCheckoutStore((s) => s.setDelivery);
  const next = useCheckoutStore((s) => s.next);
  const back = useCheckoutStore((s) => s.back);

  const current = delivery ?? {
    addressText: "",
    street: "",
    number: "",
    city: "",
    postcode: "",
    postalCode: "",
    notes: "",
    isHouse: true,
    isBuilding: false,
    portal: "",
    floor: "",
    door: "",
    block: "",
    staircase: "",
    stair: "",
    instructions: "",
    lat: null,
    lng: null,
    distanceKm: null,
    isWithinRadius: null,
    addressConfirmed: false,
    confirmedAt: null,
  };

  const [query, setQuery] = useState(delivery?.addressText ?? "");
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [selected, setSelected] = useState<AddressSearchResult | null>(
    delivery?.lat !== null &&
      delivery?.lat !== undefined &&
      delivery?.lng !== null &&
      delivery?.lng !== undefined &&
      delivery?.addressText
      ? { label: delivery.addressText, lat: delivery.lat, lng: delivery.lng }
      : null
  );

  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [loadingRadius, setLoadingRadius] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DeliveryFieldErrors>({});
  const [distanceInfo, setDistanceInfo] = useState<DistanceValidation | null>(
    typeof delivery?.distanceKm === "number" || delivery?.isWithinRadius === true
      ? { km: delivery?.distanceKm ?? null, withinRadius: delivery?.isWithinRadius === true }
      : null
  );
  const [confirmedValid, setConfirmedValid] = useState(Boolean(delivery?.addressConfirmed));

  const patchAddress = (
    patch: Partial<typeof current>,
    options?: { critical?: boolean; clearError?: boolean }
  ) => {
    const critical = Boolean(options?.critical);
    const clearError = Boolean(options?.clearError);

    const nextDelivery = {
      ...current,
      ...patch,
      isBuilding: !(patch.isHouse ?? current.isHouse ?? true),
      ...(critical
        ? {
            addressConfirmed: false,
            confirmedAt: null,
          }
        : {}),
    };

    setDelivery(nextDelivery);

    if (critical) {
      setConfirmedValid(false);
      setOkMessage(null);
    }

    if (clearError) {
      setError(null);
    }
  };

  const validateAddressFields = () => {
    const nextErrors: DeliveryFieldErrors = {};
    const street = current.street?.trim() ?? "";
    const number = current.number?.trim() ?? "";
    const combined = `${street} ${number}`.trim();

    if (!street) {
      nextErrors.street = "Calle y numero son obligatorios";
    }
    if (!number) {
      nextErrors.number = "Calle y numero son obligatorios";
    }
    if (combined.length > 0 && combined.length < 8) {
      nextErrors.addressText = "La direccion es demasiado corta, anade mas detalle";
    }
    if (!current.isHouse) {
      if (!current.portal?.trim()) nextErrors.portal = "Portal obligatorio";
      if (!current.floor?.trim()) nextErrors.floor = "Piso obligatorio";
      if (!current.door?.trim()) nextErrors.door = "Puerta obligatoria";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const evaluateRadius = async (candidate: AddressSearchResult) => {
    setLoadingRadius(true);

    const byRestaurant = await supabase
      .from("restaurant_settings")
      .select("delivery_radius_km, base_lat, base_lng")
      .eq("restaurant_id", restaurantId)
      .limit(1)
      .maybeSingle();

    const settings = byRestaurant.data ?? null;
    const settingsError = byRestaurant.error ?? null;

    if (settingsError) {
      console.error(settingsError);
      setError(`No se pudieron cargar ajustes de entrega: ${settingsError.message}`);
      setDistanceInfo(null);
      patchAddress(
        {
          lat: candidate.lat,
          lng: candidate.lng,
          distanceKm: null,
          isWithinRadius: null,
        },
        { critical: true }
      );
      setLoadingRadius(false);
      return;
    }

    if (!settings) {
      setError("No se encontraron ajustes del restaurante para calcular distancia.");
      setDistanceInfo(null);
      patchAddress(
        {
          lat: candidate.lat,
          lng: candidate.lng,
          distanceKm: null,
          isWithinRadius: null,
        },
        { critical: true }
      );
      setLoadingRadius(false);
      return;
    }

    const radiusKm = settings?.delivery_radius_km;
    const baseLat = settings?.base_lat;
    const baseLng = settings?.base_lng;

    if (radiusKm === null || radiusKm === undefined) {
      setDistanceInfo({ km: null, withinRadius: true });
      patchAddress(
        {
          lat: candidate.lat,
          lng: candidate.lng,
          distanceKm: null,
          isWithinRadius: true,
        },
        { critical: true, clearError: true }
      );
      setLoadingRadius(false);
      return;
    }

    if (baseLat === null || baseLat === undefined || baseLng === null || baseLng === undefined) {
      setError("Faltan coordenadas para calcular distancia");
      setDistanceInfo({ km: null, withinRadius: false });
      patchAddress(
        {
          lat: candidate.lat,
          lng: candidate.lng,
          distanceKm: null,
          isWithinRadius: false,
        },
        { critical: true }
      );
      setLoadingRadius(false);
      return;
    }

    const distanceKm = haversineKm(baseLat, baseLng, candidate.lat, candidate.lng);
    const withinRadius = distanceKm <= radiusKm;

    setDistanceInfo({ km: distanceKm, withinRadius });
    patchAddress(
      {
        lat: candidate.lat,
        lng: candidate.lng,
        distanceKm,
        isWithinRadius: withinRadius,
      },
      { critical: true, clearError: withinRadius }
    );

    if (!withinRadius) {
      setError(`Fuera del radio de entrega: ${distanceKm.toFixed(2)} km > ${radiusKm} km`);
    }

    setLoadingRadius(false);
  };

  const applySelection = async (result: AddressSearchResult) => {
    setSelected(result);
    setQuery(result.label);
    setResults([]);
    setDistanceInfo(null);
    setOkMessage(null);

    const street = result.address?.road || result.address?.pedestrian || result.address?.residential || "";
    const number = result.address?.house_number || "";
    const city = result.address?.city || result.address?.town || result.address?.village || "";
    const postcode = result.address?.postcode || "";

    patchAddress(
      {
        addressText: result.label,
        street,
        number,
        city,
        postcode,
        postalCode: postcode,
        lat: result.lat,
        lng: result.lng,
      },
      { critical: true, clearError: true }
    );
    setFieldErrors({});

    const ok = validateSelectedAddress(result);
    if (!ok) {
      setError("Direccion incompleta: anade numero (ej: Calle X 12)");
      return;
    }

    await evaluateRadius(result);
  };

  const runSearch = async (text: string, signal?: AbortSignal) => {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }

    setLoadingSearch(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        format: "json",
        addressdetails: "1",
        limit: "5",
        q: trimmed,
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { signal }
      );

      if (!response.ok) {
        throw new Error(`Busqueda de direccion fallida (${response.status})`);
      }

      const data = (await response.json()) as Array<{
        display_name: string;
        lat: string;
        lon: string;
        address?: AddressDetails;
      }>;

      const parsed = data
        .map((item) => ({
          label: item.display_name,
          lat: Number(item.lat),
          lng: Number(item.lon),
          address: item.address,
        }))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

      setResults(parsed);
    } catch (searchError) {
      if (signal?.aborted) {
        return;
      }
      const msg = String((searchError as { message?: unknown }).message ?? "No se pudo buscar direccion");
      setError(msg);
    } finally {
      setLoadingSearch(false);
    }
  };

  const onUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalizacion.");
      return;
    }

    setLoadingGeo(true);
    setError(null);
    setOkMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        let label = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        let address: AddressDetails | undefined;

        try {
          const params = new URLSearchParams({
            format: "json",
            addressdetails: "1",
            lat: String(lat),
            lon: String(lng),
          });

          const reverseResponse = await fetch(
            `https://nominatim.openstreetmap.org/reverse?${params.toString()}`
          );

          if (reverseResponse.ok) {
            const reverseData = (await reverseResponse.json()) as {
              display_name?: string;
              address?: AddressDetails;
            };

            if (reverseData.display_name) {
              label = reverseData.display_name;
            }

            address = reverseData.address;
          }
        } catch (reverseError) {
          console.error(reverseError);
        }

        await applySelection({ label, lat, lng, address });
        setLoadingGeo(false);
      },
      (geoError) => {
        setError(`No se pudo obtener tu ubicacion: ${geoError.message}`);
        setLoadingGeo(false);
      }
    );
  };

  const onConfirmAddress = async (): Promise<boolean> => {
    const candidate: AddressSearchResult | null = selected
      ? selected
      : hasCoords && current.addressText?.trim()
        ? {
            label: current.addressText,
            lat: Number(current.lat),
            lng: Number(current.lng),
          }
        : null;

    if (!candidate) {
      setError("Selecciona una direccion antes de confirmar.");
      return false;
    }

    if (!validateSelectedAddress(candidate)) {
      setError("Direccion incompleta: anade numero (ej: Calle X 12)");
      setConfirmedValid(false);
      return false;
    }

    if (!validateAddressFields()) {
      setError("Te falta completar la direccion.");
      setConfirmedValid(false);
      return false;
    }

    if (!validateBuildingFields(current)) {
      setError("Faltan datos del edificio: portal, piso y puerta");
      setConfirmedValid(false);
      return false;
    }

    if (distanceInfo?.withinRadius !== true) {
      setError("Fuera del radio de entrega");
      setConfirmedValid(false);
      return false;
    }

    setConfirming(true);
    const mergedAddress = formatAddressText(
      current.street,
      current.number,
      current.city,
      current.postcode ?? current.postalCode
    );

    patchAddress(
      {
        addressText: mergedAddress || candidate.label,
        lat: candidate.lat,
        lng: candidate.lng,
        distanceKm: distanceInfo.km,
        isWithinRadius: true,
        addressConfirmed: true,
        confirmedAt: new Date().toISOString(),
      },
      { clearError: true }
    );

    setConfirmedValid(true);
    setOkMessage("Direccion confirmada dentro del radio.");
    setConfirming(false);
    return true;
  };

  const selectedIsValid = useMemo(() => validateSelectedAddress(selected), [selected]);
  const buildingIsValid = useMemo(() => validateBuildingFields(current), [current]);
  const hasCoords =
    Number.isFinite(current.lat) &&
    Number.isFinite(current.lng);
  const withinRadius = current.isWithinRadius === true;
  const isConfirmed = current.addressConfirmed === true && confirmedValid;
  const missingFields: string[] = [];

  if (!current.addressText?.trim()) {
    missingFields.push("direccion");
  }
  if (!current.street?.trim() || !current.number?.trim()) {
    missingFields.push("calle y numero");
  }
  if (`${current.street ?? ""} ${current.number ?? ""}`.trim().length > 0 &&
      `${current.street ?? ""} ${current.number ?? ""}`.trim().length < 8) {
    missingFields.push("direccion con mas detalle");
  }

  if (!hasCoords) {
    missingFields.push("coordenadas");
  }

  if (!current.isHouse) {
    if (!current.portal?.trim()) missingFields.push("portal");
    if (!current.floor?.trim()) missingFields.push("piso");
    if (!current.door?.trim()) missingFields.push("puerta");
  }

  const blockReasons: string[] = [];
  if (!isConfirmed) {
    blockReasons.push("Direccion no confirmada");
  }
  if (current.isWithinRadius === false || !withinRadius) {
    blockReasons.push("Fuera del radio");
  }
  if (missingFields.length > 0) {
    blockReasons.push(`Faltan campos obligatorios: ${missingFields.join(", ")}`);
  }
  if (error) {
    blockReasons.push(error);
  }

  const canContinue = blockReasons.length === 0 && buildingIsValid;
  const isBlocked = disabledContinue || !canContinue;
  const visibleBlockReasons = Array.from(
    new Set([...blockReasons, ...primaryErrors].filter((message) => Boolean(message?.trim())))
  ).slice(0, 2);

  const handleContinue = async () => {
    if (orderType === "delivery" && (!current.street?.trim() || !current.number?.trim())) {
      setFieldErrors((prev) => ({
        ...prev,
        street: "Calle y numero son obligatorios",
        number: "Calle y numero son obligatorios",
      }));
      setError("Calle y numero son obligatorios");
      return;
    }
    if (
      orderType === "delivery" &&
      (!Number.isFinite(current.lat) || !Number.isFinite(current.lng))
    ) {
      setError("Selecciona una direccion valida");
      return;
    }

    if (!canContinue) {
      const ok = await onConfirmAddress();
      if (!ok) {
        return;
      }
    }

    if (onContinue) {
      onContinue();
      return;
    }

    next();
  };

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h3>Agrega tu direccion</h3>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-address-query">Direccion</label>
        <input
          id="checkout-address-query"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setSelected(null);
            setResults([]);
            setDistanceInfo(null);
            patchAddress(
              {
                addressText: nextQuery,
                street: "",
                number: "",
                city: "",
                postcode: "",
                postalCode: "",
                lat: null,
                lng: null,
                distanceKm: null,
                isWithinRadius: null,
              },
              { critical: true, clearError: true }
            );
          }}
        />
      </div>
      <small>Busca una direccion y luego completa/ajusta los campos.</small>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => runSearch(query)}
          disabled={loadingSearch || query.trim().length < 3}
        >
          {loadingSearch ? "Buscando..." : "Buscar"}
        </button>
        <button type="button" onClick={onUseCurrentLocation} disabled={loadingGeo}>
          {loadingGeo ? "Obteniendo ubicacion..." : "Usar mi ubicacion actual"}
        </button>
      </div>

      {results.length > 0 && (
        <ul>
          {results.map((result, index) => (
            <li key={`${result.lat}-${result.lng}-${index}`}>
              <button type="button" onClick={() => void applySelection(result)}>
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div>
          Seleccionada: {selected.label} ({selected.lat.toFixed(6)}, {selected.lng.toFixed(6)})
        </div>
      )}

      {selected && !selectedIsValid && (
        <p style={{ color: "crimson" }}>Direccion incompleta: anade numero (ej: Calle X 12)</p>
      )}

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-street">Calle</label>
        <input
          id="checkout-street"
          value={current.street ?? ""}
          onChange={(event) => {
            const street = event.target.value;
            patchAddress(
              {
                street,
                addressText: formatAddressText(
                  street,
                  current.number,
                  current.city,
                  current.postcode ?? current.postalCode
                ),
              },
              { critical: true, clearError: true }
            );
            setFieldErrors((prev) => ({ ...prev, street: undefined, addressText: undefined }));
          }}
        />
        {fieldErrors.street && <small style={{ color: "crimson" }}>{fieldErrors.street}</small>}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-number">Numero</label>
        <input
          id="checkout-number"
          value={current.number ?? ""}
          onChange={(event) => {
            const number = event.target.value;
            patchAddress(
              {
                number,
                addressText: formatAddressText(
                  current.street,
                  number,
                  current.city,
                  current.postcode ?? current.postalCode
                ),
              },
              { critical: true, clearError: true }
            );
            setFieldErrors((prev) => ({ ...prev, number: undefined, addressText: undefined }));
          }}
        />
        {fieldErrors.number && <small style={{ color: "crimson" }}>{fieldErrors.number}</small>}
        {fieldErrors.addressText && (
          <small style={{ color: "crimson" }}>{fieldErrors.addressText}</small>
        )}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-city">Ciudad (opcional)</label>
        <input
          id="checkout-city"
          value={current.city ?? ""}
          onChange={(event) =>
            patchAddress(
              {
                city: event.target.value,
                addressText: formatAddressText(
                  current.street,
                  current.number,
                  event.target.value,
                  current.postcode ?? current.postalCode
                ),
              },
              { critical: true, clearError: true }
            )
          }
        />
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-postal">Codigo postal (opcional)</label>
        <input
          id="checkout-postal"
          value={current.postcode ?? current.postalCode ?? ""}
          onChange={(event) =>
            patchAddress(
              {
                postcode: event.target.value,
                postalCode: event.target.value,
                addressText: formatAddressText(
                  current.street,
                  current.number,
                  current.city,
                  event.target.value
                ),
              },
              { critical: true, clearError: true }
            )
          }
        />
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-delivery-notes">Notas (opcional)</label>
        <textarea
          id="checkout-delivery-notes"
          value={current.notes ?? ""}
          onChange={(event) => patchAddress({ notes: event.target.value })}
        />
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={Boolean(current.isHouse)}
            onChange={(event) => {
              const checked = event.target.checked;
              patchAddress(
                {
                  isHouse: checked,
                  isBuilding: !checked,
                  portal: checked ? "" : current.portal,
                  floor: checked ? "" : current.floor,
                  door: checked ? "" : current.door,
                },
                { critical: true, clearError: true }
              );
            }}
          />
          Es casa/unifamiliar
        </label>
      </div>

      {!current.isHouse && (
        <>
          <div style={{ display: "grid", gap: 4 }}>
            <label htmlFor="checkout-portal">Portal</label>
            <input
              id="checkout-portal"
              value={current.portal ?? ""}
              onChange={(event) => patchAddress({ portal: event.target.value }, { critical: true })}
            />
            {fieldErrors.portal && <small style={{ color: "crimson" }}>{fieldErrors.portal}</small>}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label htmlFor="checkout-floor">Piso</label>
            <input
              id="checkout-floor"
              value={current.floor ?? ""}
              onChange={(event) => patchAddress({ floor: event.target.value }, { critical: true })}
            />
            {fieldErrors.floor && <small style={{ color: "crimson" }}>{fieldErrors.floor}</small>}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label htmlFor="checkout-door">Puerta</label>
            <input
              id="checkout-door"
              value={current.door ?? ""}
              onChange={(event) => patchAddress({ door: event.target.value }, { critical: true })}
            />
            {fieldErrors.door && <small style={{ color: "crimson" }}>{fieldErrors.door}</small>}
          </div>
        </>
      )}

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-block">Bloque (opcional)</label>
        <input
          id="checkout-block"
          value={current.block ?? ""}
          onChange={(event) => patchAddress({ block: event.target.value })}
        />
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-stair">Escalera (opcional)</label>
        <input
          id="checkout-stair"
          value={current.staircase ?? current.stair ?? ""}
          onChange={(event) =>
            patchAddress({ staircase: event.target.value, stair: event.target.value })
          }
        />
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-instructions">Instrucciones (opcional)</label>
        <input
          id="checkout-instructions"
          value={current.instructions ?? ""}
          onChange={(event) => patchAddress({ instructions: event.target.value })}
        />
      </div>

      {!current.isHouse && !buildingIsValid && (
        <p style={{ color: "crimson" }}>Faltan datos del edificio: portal, piso y puerta</p>
      )}

      <button
        type="button"
        onClick={() => void onConfirmAddress()}
        disabled={!hasCoords || withinRadius !== true || confirming || loadingRadius}
      >
        {confirming ? "Confirmando..." : "Confirmar direccion"}
      </button>

      {loadingRadius && <p>Calculando radio de entrega...</p>}

      {distanceInfo && (
        <p style={{ color: distanceInfo.withinRadius ? "inherit" : "crimson" }}>
          {distanceInfo.km === null
            ? "Radio no configurado: direccion apta para entrega."
            : `Distancia: ${distanceInfo.km.toFixed(2)} km${
                distanceInfo.withinRadius ? "" : " (fuera de radio)"
              }`}
        </p>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {okMessage && <p style={{ color: "var(--brand-hover)" }}>{okMessage}</p>}

      {isBlocked && visibleBlockReasons.length > 0 && (
        <div style={{ color: "crimson" }}>
          {visibleBlockReasons.map((reason, index) => (
            <div key={`${reason}-${index}`}>{reason}</div>
          ))}
        </div>
      )}

      <div
        style={{
          position: "sticky",
          bottom: 0,
          display: "flex",
          gap: 8,
          padding: "10px 0",
          background: "rgba(15,15,15,0.92)",
        }}
      >
        <button onClick={back}>Atras</button>
        <button onClick={() => void handleContinue()} disabled={isBlocked}>
          Continuar
        </button>
      </div>
    </section>
  );
}
