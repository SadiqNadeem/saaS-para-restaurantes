import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

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
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import StripeCheckoutReturnPage from "./features/checkout/ui/StripeCheckoutReturnPage";

// ── Providers & context ───────────────────────────────────────────────────────
import { AuthProvider } from "./auth/AuthContext";
import { AdminRestaurantProvider } from "./admin/context/AdminRestaurantContext";
import { RestaurantProvider } from "./restaurant/RestaurantContext";
import { getRestaurantSlug } from "./restaurant/getRestaurantSlug";

import "./index.css";

// Detect subdomain mode once at startup (static, doesn't change during session)
const initialSlug = getRestaurantSlug();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AdminRestaurantProvider>
        <BrowserRouter>
          <Routes>

            {/* ── PUBLIC LANDING ──────────────────────────────────────────────
                In path mode: "/" shows the landing page.
                In subdomain mode: "/" shows the storefront directly. */}
            {initialSlug.usesSubdomain ? (
              <Route element={<RestaurantProvider><Outlet /></RestaurantProvider>}>
                <Route path="/" element={<App />} />
                <Route path="/checkout" element={<App />} />
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
            <Route path="/login" element={<GuestGuard><Login /></GuestGuard>} />
            <Route path="/register" element={<GuestGuard><Register /></GuestGuard>} />
            <Route path="/forgot-password" element={<GuestGuard><ForgotPassword /></GuestGuard>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />

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
              <Route index element={<App />} />
              <Route path="checkout" element={<App />} />
              <Route path="checkout/success" element={<StripeCheckoutReturnPage mode="success" />} />
              <Route path="checkout/cancel" element={<StripeCheckoutReturnPage mode="cancel" />} />
              <Route path="pedido/:orderId" element={<OrderTrackingPage />} />
              <Route path="mesa/:qrToken" element={<TableMenuPage />} />

              {/* Admin panel */}
              <Route
                path="admin"
                element={
                  <AdminGuard>
                    <AdminGate>
                      <AdminLayout />
                    </AdminGate>
                  </AdminGuard>
                }
              >
                <Route index element={<AdminDashboardPage />} />
                <Route path="dashboard" element={<AdminDashboardPage />} />
                <Route path="metrics" element={<FeatureRouteGuard featureKey="metrics"><AdminMetricsPage /></FeatureRouteGuard>} />
                <Route path="orders" element={<FeatureRouteGuard featureKey="online_ordering"><AdminOrdersPage /></FeatureRouteGuard>} />
                <Route path="orders/:id" element={<FeatureRouteGuard featureKey="online_ordering"><AdminOrderDetailPage /></FeatureRouteGuard>} />
                <Route path="caja" element={<FeatureRouteGuard featureKey="pos"><AdminPosPage /></FeatureRouteGuard>} />
                <Route path="pos" element={<FeatureRouteGuard featureKey="pos"><Navigate to="../caja" replace /></FeatureRouteGuard>} />
                <Route path="tpv" element={<FeatureRouteGuard featureKey="pos"><Navigate to="../../pos" replace /></FeatureRouteGuard>} />
                <Route path="categories" element={<AdminCategoriesPage />} />
                <Route path="products" element={<AdminProductsPage />} />
                <Route path="products/:id/modifiers" element={<AdminProductModifiersPage />} />
                <Route path="modifiers" element={<AdminModifiersPage />} />
                <Route path="coupons" element={<FeatureRouteGuard featureKey="coupons"><AdminCouponsPage /></FeatureRouteGuard>} />
                <Route path="loyalty" element={<FeatureRouteGuard featureKey="loyalty"><AdminLoyaltyPage /></FeatureRouteGuard>} />
                <Route path="reviews" element={<AdminReviewsPage />} />
                <Route path="abandoned-carts" element={<AdminAbandonedCartsPage />} />
                <Route path="whatsapp" element={<FeatureRouteGuard featureKey="whatsapp_chatbot"><AdminWhatsAppPage /></FeatureRouteGuard>} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="web-customization" element={<FeatureRouteGuard featureKey="website_customization"><AdminWebCustomizationPage /></FeatureRouteGuard>} />
                <Route path="team" element={<FeatureRouteGuard featureKey="staff_roles"><AdminTeamPage /></FeatureRouteGuard>} />
                <Route path="logs" element={<FeatureRouteGuard featureKey="logs"><AdminLogsPage /></FeatureRouteGuard>} />
                <Route path="import" element={<AdminImportPage />} />
                <Route path="tables" element={<FeatureRouteGuard featureKey="tables"><AdminTablesPage /></FeatureRouteGuard>} />
                <Route path="support" element={<AdminSupportPage />} />
                <Route path="diagnostics" element={<AdminDiagnosticsPage />} />
                <Route path="help" element={<AdminHelpCenterPage />} />
              </Route>

              {/* POS / TPV */}
              <Route
                path="pos"
                element={
                  <FeatureRouteGuard featureKey="pos">
                    <RestaurantGuard>
                      <PosGate>
                        <PosLayout />
                      </PosGate>
                    </RestaurantGuard>
                  </FeatureRouteGuard>
                }
              >
                <Route index element={<PosCajaPage />} />
                <Route path="orders" element={<PosOrdersPage />} />
                <Route path="tables" element={<PosTablesPage />} />
                <Route path="tables/:tableId" element={<PosTableSessionPage />} />
                <Route path="floor-plan" element={<PosFloorPlanPage />} />
              </Route>
            </Route>

            {/* ── 404 ────────────────────────────────────────────────────────*/}
            <Route path="*" element={<NotFoundPage />} />

          </Routes>
        </BrowserRouter>
      </AdminRestaurantProvider>
    </AuthProvider>
  </StrictMode>
);
