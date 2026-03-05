import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import AdminLayout from "./admin/AdminLayout";
import AdminGate from "./admin/components/AdminGate";
import PosLayout from "./pos/PosLayout";
import PosGate from "./pos/components/PosGate";
import PosCajaPage from "./pos/pages/PosCajaPage";
import PosOrdersPage from "./pos/pages/PosOrdersPage";
import { AdminRestaurantProvider } from "./admin/context/AdminRestaurantContext";
import AdminCategoriesPage from "./admin/pages/AdminCategoriesPage";
import AdminDashboardPage from "./admin/pages/AdminDashboardPage";
import AdminMetricsPage from "./admin/pages/AdminMetricsPage";
import AdminModifiersPage from "./admin/pages/AdminModifiersPage";
import AdminLogsPage from "./admin/pages/AdminLogsPage";
import AdminOrdersPage from "./admin/pages/AdminOrdersPage";
import AdminPosPage from "./admin/pages/AdminPosPage";
import AdminProductModifiersPage from "./admin/pages/AdminProductModifiersPage";
import AdminProductsPage from "./admin/pages/AdminProductsPage";
import AdminSettingsPage from "./admin/pages/AdminSettingsPage";
import AdminCouponsPage from "./admin/pages/AdminCouponsPage";
import AdminImportPage from "./admin/pages/AdminImportPage";
import AdminLoyaltyPage from "./admin/pages/AdminLoyaltyPage";
import AdminReviewsPage from "./admin/pages/AdminReviewsPage";
import AdminAbandonedCartsPage from "./admin/pages/AdminAbandonedCartsPage";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import RequireAuth from "./auth/RequireAuth";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Register from "./pages/Register";
import AdminOrderDetailPage from "./features/admin/pages/AdminOrderDetailPage";
import StripeCheckoutReturnPage from "./features/checkout/ui/StripeCheckoutReturnPage";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import "./index.css";
import { RestaurantProvider } from "./restaurant/RestaurantContext";
import { getRestaurantSlug } from "./restaurant/getRestaurantSlug";
import SuperAdminLayout from "./superadmin/SuperAdminLayout";
import SuperAdminGate from "./superadmin/components/SuperAdminGate";
import SuperAdminLogsPage from "./superadmin/pages/SuperAdminLogsPage";
import SuperAdminMembersPage from "./superadmin/pages/SuperAdminMembersPage";
import SuperAdminMetricsPage from "./superadmin/pages/SuperAdminMetricsPage";
import SuperAdminRestaurantsPage from "./superadmin/pages/SuperAdminRestaurantsPage";

const initialRestaurant = getRestaurantSlug();
const fallbackPath = initialRestaurant.usesSubdomain ? "/" : `/r/${initialRestaurant.slug}`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AdminRestaurantProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

          <Route
            element={
              <RestaurantProvider>
                <Outlet />
              </RestaurantProvider>
            }
          >
            <Route path="/" element={<App />} />
            <Route path="/checkout" element={<App />} />
            <Route path="/checkout/success" element={<StripeCheckoutReturnPage mode="success" />} />
            <Route path="/checkout/cancel" element={<StripeCheckoutReturnPage mode="cancel" />} />
            <Route path="/pedido/:orderId" element={<OrderTrackingPage />} />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminGate>
                    <AdminLayout />
                  </AdminGate>
                </RequireAuth>
              }
            >
              <Route index element={<AdminDashboardPage />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="metrics" element={<AdminMetricsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="orders/:id" element={<AdminOrderDetailPage />} />
              <Route path="pos" element={<AdminPosPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="products/:id/modifiers" element={<AdminProductModifiersPage />} />
              <Route path="modifiers" element={<AdminModifiersPage />} />
              <Route path="coupons" element={<AdminCouponsPage />} />
              <Route path="loyalty" element={<AdminLoyaltyPage />} />
              <Route path="reviews" element={<AdminReviewsPage />} />
              <Route path="abandoned-carts" element={<AdminAbandonedCartsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="logs" element={<AdminLogsPage />} />
              <Route path="import" element={<AdminImportPage />} />
            </Route>

            <Route
              path="/pos"
              element={
                <RequireAuth>
                  <PosGate>
                    <PosLayout />
                  </PosGate>
                </RequireAuth>
              }
            >
              <Route index element={<PosCajaPage />} />
              <Route path="orders" element={<PosOrdersPage />} />
            </Route>
          </Route>

          <Route
            path="/r/:slug"
            element={
              <RestaurantProvider>
                <Outlet />
              </RestaurantProvider>
            }
          >
            <Route index element={<App />} />
            <Route path="checkout" element={<App />} />
            <Route path="checkout/success" element={<StripeCheckoutReturnPage mode="success" />} />
            <Route path="checkout/cancel" element={<StripeCheckoutReturnPage mode="cancel" />} />
            <Route path="pedido/:orderId" element={<OrderTrackingPage />} />
            <Route
              path="admin"
              element={
                <RequireAuth>
                  <AdminGate>
                    <AdminLayout />
                  </AdminGate>
                </RequireAuth>
              }
            >
              <Route index element={<AdminDashboardPage />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="metrics" element={<AdminMetricsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="orders/:id" element={<AdminOrderDetailPage />} />
              <Route path="pos" element={<AdminPosPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="products/:id/modifiers" element={<AdminProductModifiersPage />} />
              <Route path="modifiers" element={<AdminModifiersPage />} />
              <Route path="coupons" element={<AdminCouponsPage />} />
              <Route path="loyalty" element={<AdminLoyaltyPage />} />
              <Route path="reviews" element={<AdminReviewsPage />} />
              <Route path="abandoned-carts" element={<AdminAbandonedCartsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="logs" element={<AdminLogsPage />} />
              <Route path="import" element={<AdminImportPage />} />
            </Route>

            <Route
              path="pos"
              element={
                <RequireAuth>
                  <PosGate>
                    <PosLayout />
                  </PosGate>
                </RequireAuth>
              }
            >
              <Route index element={<PosCajaPage />} />
              <Route path="orders" element={<PosOrdersPage />} />
            </Route>
          </Route>

          <Route
            path="/superadmin"
            element={
              <SuperAdminGate>
                <SuperAdminLayout />
              </SuperAdminGate>
            }
          >
            <Route index element={<Navigate to="restaurants" replace />} />
            <Route path="restaurants" element={<SuperAdminRestaurantsPage />} />
            <Route path="members" element={<SuperAdminMembersPage />} />
            <Route path="metrics" element={<SuperAdminMetricsPage />} />
            <Route path="logs" element={<SuperAdminLogsPage />} />
          </Route>

          <Route path="*" element={<Navigate to={fallbackPath} replace />} />
          </Routes>
        </BrowserRouter>
      </AdminRestaurantProvider>
    </AuthProvider>
  </StrictMode>
);


