import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { FeatureKey } from "../features/restaurantFeatures";
import { useRestaurantFeatures } from "../features/useRestaurantFeatures";
import { useRestaurant } from "../../restaurant/RestaurantContext";

export default function FeatureRouteGuard({
  featureKey,
  children,
}: {
  featureKey: FeatureKey;
  children: ReactNode;
}) {
  const { restaurantId, adminPath } = useRestaurant();
  const { loading, isEnabled } = useRestaurantFeatures(restaurantId);

  if (loading) {
    return <div style={{ padding: 16 }}>Cargando...</div>;
  }

  if (!isEnabled(featureKey)) {
    return (
      <div style={{ padding: 20, display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Funcion no disponible</h2>
        <p style={{ margin: 0, color: "#4b5563" }}>
          Esta funcion esta desactivada para este restaurante.
        </p>
        <Link to={adminPath}>Volver al dashboard</Link>
      </div>
    );
  }

  return <>{children}</>;
}
