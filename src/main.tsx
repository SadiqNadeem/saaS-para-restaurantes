import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";

// ── Layouts ──────────────────────────────────────────────────────────────────
import AdminLayout from "./admin/AdminLayout";
import PosLayout from "./pos/PosLayout";
import SuperAdminLayout from "./superadmin/SuperAdminLayout";

// ── Guards (new) ──────────────────────────────────────────────────────────────
import GuestGuard from "./auth/guards/GuestGuard";
import AuthGuard from "./auth/guards/AuthGuard";
import AdminGuard from "./auth/guards/AdminGuard";
import RestaurantGuard from "./auth/guards/RestaurantGuard";
import SuperadminGuard from "./auth/guards/SuperadminGuard";

// ── Gate components (per-restaurant access checks) ───────────────────────────
import AdminGate from "./admin/components/AdminGate";
import AdminRoleGuard from "./admin/components/AdminRoleGuard";
import SubscriptionGuard from "./admin/components/SubscriptionGuard";
import FeatureRouteGuard from "./admin/components/FeatureRouteGuard";
import PosGate from "./pos/components/PosGate";

// ── Slug resolver ─────────────────────────────────────────────────────────────
import AdminSlugResolver from "./admin/AdminSlugResolver";

// ── Admin pages ───────────────────────────────────────────────────────────────
import AdminCategoriesPage from "./admin/pages/AdminCategoriesPage";
import AdminCouponsPage from "./admin/pages/AdminCouponsPage";
import AdminDashboardPage from "./admin/pages/AdminDashboardPage";
import AdminImportPage from "./admin/pages/AdminImportPage";
import AdminLogsPage from "./admin/pages/AdminLogsPage";
import AdminLoyaltyPage from "./admin/pages/AdminLoyaltyPage";
import AdminMetricsPage from "./admin/pages/AdminMetricsPage";
import AdminModifiersPage from "./admin/pages/AdminModifiersPage";
import AdminOrdersPage from "./admin/pages/AdminOrdersPage";
import AdminPosPage from "./admin/pages/AdminPosPage";
import AdminProductModifiersPage from "./admin/pages/AdminProductModifiersPage";
import AdminProductsPage from "./admin/pages/AdminProductsPage";
import AdminReviewsPage from "./admin/pages/AdminReviewsPage";
import AdminAbandonedCartsPage from "./admin/pages/AdminAbandonedCartsPage";
import AdminSettingsPage from "./admin/pages/AdminSettingsPage";
import AdminTablesPage from "./admin/pages/AdminTablesPage";
import AdminTeamPage from "./admin/pages/AdminTeamPage";
import AdminWebCustomizationPage from "./admin/pages/AdminWebCustomizationPage";
import AdminWhatsAppPage from "./admin/pages/AdminWhatsAppPage";
import AdminOrderDetailPage from "./features/admin/pages/AdminOrderDetailPage";
import AdminSupportPage from "./admin/pages/AdminSupportPage";
import AdminBillingPage from "./admin/pages/AdminBillingPage";
import AdminDiagnosticsPage from "./admin/pages/AdminDiagnosticsPage";
import AdminHelpCenterPage from "./admin/pages/AdminHelpCenterPage";

// ── POS pages ─────────────────────────────────────────────────────────────────
import PosCajaPage from "./pos/pages/PosCajaPage";
import PosFloorPlanPage from "./pos/pages/PosFloorPlanPage";
import PosOrdersPage from "./pos/pages/PosOrdersPage";
import PosTableSessionPage from "./pos/pages/PosTableSessionPage";
import PosTablesPage from "./pos/pages/PosTablesPage";

// ── Superadmin pages ──────────────────────────────────────────────────────────
import SuperAdminLogsPage from "./superadmin/pages/SuperAdminLogsPage";
import SuperAdminSupportPage from "./superadmin/pages/SuperAdminSupportPage";
import SuperAdminMembersPage from "./superadmin/pages/SuperAdminMembersPage";
import SuperAdminMetricsPage from "./superadmin/pages/SuperAdminMetricsPage";
import SuperAdminRestaurantsPage from "./superadmin/pages/SuperAdminRestaurantsPage";

// ── Storefront & shared pages ─────────────────────────────────────────────────
import App from "./App";
import TableMenuPage from "./pages/TableMenuPage";
import LandingPage from "./pages/LandingPage";
import NotFoundPage from "./pages/NotFoundPage";
import LoginPage from "./pages/LoginPage";
import Onboarding from "./pages/Onboarding";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import StripeCheckoutReturnPage from "./features/checkout/ui/StripeCheckoutReturnPage";
import InviteAcceptPage from "./pages/InviteAcceptPage";

// ── Providers & context ───────────────────────────────────────────────────────
import { AuthProvider } from "./auth/AuthContext";
import { AdminRestaurantProvider } from "./admin/context/AdminRestaurantContext";
import { RestaurantProvider } from "./restaurant/RestaurantContext";
import { getRestaurantSlug } from "./restaurant/getRestaurantSlug";

// @ts-ignore — archivo JS sin tipos (intencional)
import GestionApp from "./gestion/GestionApp";
import "./index.css";

// ── Handler global: promesas rechazadas sin capturar ─────────────────────────
// Evita que un `.catch()` olvidado rompa silenciosamente la app.
// En producción: punto de enganche para Sentry u otro servicio de logging.
window.addEventListener("unhandledrejection", (event) => {
  if (import.meta.env.DEV) {
    console.error("[Unhandled Promise Rejection]", event.reason);
  }
  // Sentry.captureException(event.reason)  ← añadir aquí cuando se integre
  event.preventDefault(); // evita el log de error en consola de producción
});

// Detect subdomain mode once at startup (static, doesn't change during session)
const initialSlug = getRestaurantSlug();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary context="root">
    <AuthProvider>
      <AdminRestaurantProvider>
        <BrowserRouter>
          <Routes>

            {/* ── PUBLIC LANDING ──────────────────────────────────────────────
                In path mode: "/" shows the landing page.
                In subdomain mode: "/" shows the storefront directly. */}
            {initialSlug.usesSubdomain ? (
              <Route element={<RestaurantProvider><Outlet /></RestaurantProvider>}>
                <Route path="/" element={<ErrorBoundary context="checkout"><App /></ErrorBoundary>} />
                <Route path="/checkout" element={<ErrorBoundary context="checkout"><App /></ErrorBoundary>} />
                <Route path="/checkout/success" element={<StripeCheckoutReturnPage mode="success" />} />
                <Route path="/checkout/cancel" element={<StripeCheckoutReturnPage mode="cancel" />} />
                <Route path="/pedido/:orderId" element={<OrderTrackingPage />} />
                <Route path="/mesa/:qrToken" element={<TableMenuPage />} />
              </Route>
            ) : (
              <Route path="/" element={<LandingPage />} />
            )}

            {/* ── AUTH ROUTES ─────────────────────────────────────────────────
                GuestGuard redirects already-logged-in users to their dashboard. */}
            <Route path="/login" element={<GuestGuard><LoginPage /></GuestGuard>} />
            <Route path="/register" element={<GuestGuard><Register /></GuestGuard>} />
            <Route path="/forgot-password" element={<GuestGuard><ForgotPassword /></GuestGuard>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />
            <Route path="/invite/:token" element={<InviteAcceptPage />} />

            {/* ── SUPERADMIN ──────────────────────────────────────────────────*/}
            <Route
              path="/superadmin"
              element={<SuperadminGuard><SuperAdminLayout /></SuperadminGuard>}
            >
              <Route index element={<Navigate to="restaurants" replace />} />
              <Route path="restaurants" element={<SuperAdminRestaurantsPage />} />
              <Route path="members" element={<SuperAdminMembersPage />} />
              <Route path="metrics" element={<SuperAdminMetricsPage />} />
              <Route path="logs" element={<SuperAdminLogsPage />} />
              <Route path="support" element={<SuperAdminSupportPage />} />
            </Route>

            {/* ── /admin SHORTCUT → resolve slug and redirect ──────────────────
                Works in both path mode and subdomain mode.
                /admin → /r/:slug/admin
                /admin/orders → /r/:slug/admin/orders */}
            <Route path="/admin" element={<AdminGuard><AdminSlugResolver /></AdminGuard>} />
            <Route path="/admin/*" element={<AdminGuard><AdminSlugResolver /></AdminGuard>} />

            {/* ── RESTAURANT ROUTES (/r/:slug) ─────────────────────────────────
                RestaurantProvider reads :slug from useParams(). */}
            <Route
              path="/r/:slug"
              element={<RestaurantProvider><Outlet /></RestaurantProvider>}
            >
              {/* Storefront (public) */}
              <Route index element={<ErrorBoundary context="checkout"><App /></ErrorBoundary>} />
              <Route path="checkout" element={<ErrorBoundary context="checkout"><App /></ErrorBoundary>} />
              <Route path="checkout/success" element={<StripeCheckoutReturnPage mode="success" />} />
              <Route path="checkout/cancel" element={<StripeCheckoutReturnPage mode="cancel" />} />
              <Route path="pedido/:orderId" element={<OrderTrackingPage />} />
              <Route path="mesa/:qrToken" element={<TableMenuPage />} />

              {/* Admin panel */}
              <Route
                path="admin"
                element={
                  <ErrorBoundary context="admin">
                  <AdminGuard>
                    <AdminGate>
                      <SubscriptionGuard>
                        <AdminLayout />
                      </SubscriptionGuard>
                    </AdminGate>
                  </AdminGuard>
                  </ErrorBoundary>
                }
              >
                <Route index element={<AdminDashboardPage />} />
                <Route path="dashboard" element={<AdminDashboardPage />} />
                {/* ── Rutas accesibles por todos los miembros activos ── */}
                <Route path="orders" element={<FeatureRouteGuard featureKey="online_ordering"><AdminOrdersPage /></FeatureRouteGuard>} />
                <Route path="orders/:id" element={<FeatureRouteGuard featureKey="online_ordering"><AdminOrderDetailPage /></FeatureRouteGuard>} />
                <Route path="caja" element={<FeatureRouteGuard featureKey="pos"><AdminPosPage /></FeatureRouteGuard>} />
                <Route path="pos" element={<FeatureRouteGuard featureKey="pos"><Navigate to="../caja" replace /></FeatureRouteGuard>} />
                <Route path="tpv" element={<FeatureRouteGuard featureKey="pos"><Navigate to="../../pos" replace /></FeatureRouteGuard>} />
                <Route path="tables" element={<FeatureRouteGuard featureKey="tables"><AdminTablesPage /></FeatureRouteGuard>} />
                <Route path="support" element={<AdminSupportPage />} />
                <Route path="help" element={<AdminHelpCenterPage />} />

                {/* ── Rutas que requieren rol admin (owner o admin, no staff) ── */}
                <Route path="metrics" element={<AdminRoleGuard required="admin"><FeatureRouteGuard featureKey="metrics"><AdminMetricsPage /></FeatureRouteGuard></AdminRoleGuard>} />
                <Route path="categories" element={<AdminRoleGuard required="admin"><AdminCategoriesPage /></AdminRoleGuard>} />
                <Route path="products" element={<AdminRoleGuard required="admin"><AdminProductsPage /></AdminRoleGuard>} />
                <Route path="products/:id/modifiers" element={<AdminRoleGuard required="admin"><AdminProductModifiersPage /></AdminRoleGuard>} />
                <Route path="modifiers" element={<AdminRoleGuard required="admin"><AdminModifiersPage /></AdminRoleGuard>} />
                <Route path="import" element={<AdminRoleGuard required="admin"><AdminImportPage /></AdminRoleGuard>} />
                <Route path="coupons" element={<AdminRoleGuard required="admin"><FeatureRouteGuard featureKey="coupons"><AdminCouponsPage /></FeatureRouteGuard></AdminRoleGuard>} />
                <Route path="loyalty" element={<AdminRoleGuard required="admin"><FeatureRouteGuard featureKey="loyalty"><AdminLoyaltyPage /></FeatureRouteGuard></AdminRoleGuard>} />
                <Route path="reviews" element={<AdminRoleGuard required="admin"><AdminReviewsPage /></AdminRoleGuard>} />
                <Route path="abandoned-carts" element={<AdminRoleGuard required="admin"><AdminAbandonedCartsPage /></AdminRoleGuard>} />
                <Route path="whatsapp" element={<AdminRoleGuard required="admin"><FeatureRouteGuard featureKey="whatsapp_chatbot"><AdminWhatsAppPage /></FeatureRouteGuard></AdminRoleGuard>} />
                <Route path="settings" element={<AdminRoleGuard required="admin"><AdminSettingsPage /></AdminRoleGuard>} />
                <Route path="web-customization" element={<AdminRoleGuard required="admin"><FeatureRouteGuard featureKey="website_customization"><AdminWebCustomizationPage /></FeatureRouteGuard></AdminRoleGuard>} />
                <Route path="logs" element={<AdminRoleGuard required="admin"><FeatureRouteGuard featureKey="logs"><AdminLogsPage /></FeatureRouteGuard></AdminRoleGuard>} />
                <Route path="diagnostics" element={<AdminRoleGuard required="admin"><AdminDiagnosticsPage /></AdminRoleGuard>} />

                {/* ── Rutas que requieren rol owner (solo propietario) ── */}
                <Route path="team" element={<AdminRoleGuard required="owner"><FeatureRouteGuard featureKey="staff_roles"><AdminTeamPage /></FeatureRouteGuard></AdminRoleGuard>} />
                <Route path="billing" element={<AdminRoleGuard required="owner"><AdminBillingPage /></AdminRoleGuard>} />
              </Route>

              {/* POS / TPV */}
              <Route
                path="pos"
                element={
                  <ErrorBoundary context="pos">
                  <FeatureRouteGuard featureKey="pos">
                    <RestaurantGuard>
                      <PosGate>
                        <PosLayout />
                      </PosGate>
                    </RestaurantGuard>
                  </FeatureRouteGuard>
                  </ErrorBoundary>
                }
              >
                <Route index element={<PosCajaPage />} />
                <Route path="orders" element={<PosOrdersPage />} />
                <Route path="tables" element={<PosTablesPage />} />
                <Route path="tables/:tableId" element={<PosTableSessionPage />} />
                <Route path="floor-plan" element={<PosFloorPlanPage />} />
              </Route>
            </Route>

            {/* ── GESTIÓN APP ─────────────────────────────────────────────────
                App independiente de gestión de productos, clientes y pedidos.
                Acceso: /gestion/login (usuario: admin, contraseña: 1234)       */}
            <Route path="/gestion/*" element={<GestionApp />} />

            {/* ── 404 ────────────────────────────────────────────────────────*/}
            <Route path="*" element={<NotFoundPage />} />

          </Routes>
        </BrowserRouter>
      </AdminRestaurantProvider>
    </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);

// Register service worker for POS offline support (production only)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js");
}
