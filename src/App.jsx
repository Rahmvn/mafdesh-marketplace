import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MarketplaceRouteLoader } from './components/MarketplaceLoading';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import GlobalModalHost from './components/ui/GlobalModalHost';

const Home = lazy(() => import('./pages/Home'));
const PublicProducts = lazy(() => import('./pages/PublicProducts'));
const SignUp = lazy(() => import('./pages/SignUp'));
const Login = lazy(() => import('./pages/Login'));
const EmailVerified = lazy(() => import('./pages/EmailVerified'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const BuyerDashboard = lazy(() => import('./pages/BuyerDashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Cart = lazy(() => import('./pages/Cart'));
const Support = lazy(() => import('./pages/Support'));
const SellerDashboard = lazy(() => import('./pages/SellerDashboard'));
const SellerProducts = lazy(() => import('./pages/SellerProducts'));
const SellerOrders = lazy(() => import('./pages/SellerOrders'));
const SellerPayments = lazy(() => import('./pages/SellerPayments'));
const SellerAnalytics = lazy(() => import('./pages/SellerAnalytics'));
const SellerDeliverySettings = lazy(() => import('./pages/SellerDeliverySettings'));
const AddProduct = lazy(() => import('./pages/AddProduct'));
const EditProduct = lazy(() => import('./pages/EditProduct'));
const SellerProductReviews = lazy(() => import('./pages/SellerProductReviews'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/AdminProducts'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const VerificationSubscription = lazy(() => import('./pages/VerificationSubscription'));
const Checkout = lazy(() => import('./pages/Checkout'));
const BuyerOrders = lazy(() => import('./pages/BuyerOrders'));
const Payment = lazy(() => import('./pages/Payment'));
const SellerOrderDetails = lazy(() => import('./pages/SellerOrderDetails'));
const BuyerOrderDetails = lazy(() => import('./pages/BuyerOrderDetails'));
const AdminOrders = lazy(() => import('./pages/AdminOrders.jsx'));
const AdminOrderDetails = lazy(() => import('./pages/AdminOrderDetails'));
const AdminDisputes = lazy(() => import('./pages/AdminDisputes'));
const BuyerDispute = lazy(() => import('./pages/BuyerDispute.jsx'));
const AdminConstitution = lazy(() => import('./pages/AdminConstitution'));
const Policies = lazy(() => import('./pages/policies.jsx'));
const Terms = lazy(() => import('./pages/Terms'));
const AdminUserDetails = lazy(() => import('./pages/AdminUserDetails'));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess.jsx'));
const MultiCheckout = lazy(() => import('./pages/MultiCheckout'));
const AdminBankApprovals = lazy(() => import('./pages/AdminBankApprovals'));
const OrderSuccessMultiple = lazy(() => import('./pages/OrderSuccessMultiple'));
const AdminSupport = lazy(() => import('./pages/AdminSupport'));
const AdminAuditLog = lazy(() => import('./pages/AdminAuditLog'));

function RouteFallback() {
  return <MarketplaceRouteLoader />;
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<PublicProducts />} />
          <Route path="/product/:id" element={<ProductDetail />} />

          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />
          <Route path="/email-verified" element={<EmailVerified />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/marketplace"
            element={
              <ProtectedRoute allowedRoles={['buyer']}>
                <BuyerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cart"
            element={
              <ProtectedRoute allowedRoles={['buyer']}>
                <Cart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/support"
            element={
              <ProtectedRoute>
                <Support />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/seller/dashboard"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <SellerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/products"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <SellerProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/orders"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <SellerOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/payments"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <SellerPayments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/delivery"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <SellerDeliverySettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/analytics"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <SellerAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/products/new"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <AddProduct />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/products/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <EditProduct />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/products/:id/reviews"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <SellerProductReviews />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/verification"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <VerificationSubscription />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/order/:id"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminOrderDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/disputes"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDisputes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/constitution"
            element={
              <AdminRoute>
                <AdminConstitution />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users/:id"
            element={
              <AdminRoute>
                <AdminUserDetails />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/bank-approvals"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminBankApprovals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/support"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminSupport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/actions"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminAuditLog />
              </ProtectedRoute>
            }
          />

          <Route
            path="/checkout/:id"
            element={
              <ProtectedRoute allowedRoles={['buyer']}>
                <Checkout />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checkout/multi"
            element={<MultiCheckout />}
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute allowedRoles={['buyer']}>
                <BuyerOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pay/:id"
            element={
              <ProtectedRoute allowedRoles={['buyer']}>
                <Payment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/orders/:id"
            element={
              <ProtectedRoute allowedRoles={['seller']}>
                <SellerOrderDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/buyer/orders/:id"
            element={
              <ProtectedRoute allowedRoles={['buyer']}>
                <BuyerOrderDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id/dispute"
            element={
              <ProtectedRoute allowedRoles={['buyer']}>
                <BuyerDispute />
              </ProtectedRoute>
            }
          />

          <Route path="/policies" element={<Policies />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/order-success/:id" element={<OrderSuccess />} />
          <Route path="/order-success/multiple" element={<OrderSuccessMultiple />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <GlobalModalHost />
    </Router>
  );
}
