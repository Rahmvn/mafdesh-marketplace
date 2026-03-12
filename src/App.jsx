import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import LandingPage from './pages/LandingPage';
import Navbar from './components/Navbar';
import PublicProducts from './pages/PublicProducts';
import SignUp from './pages/SignUp';
import Login from './pages/Login';
import EmailVerified from './pages/EmailVerified';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import BuyerDashboard from './pages/BuyerDashboard';
import Profile from './pages/Profile';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Support from './pages/Support';
import SellerDashboard from './pages/SellerDashboard';
import SellerProducts from './pages/SellerProducts';
import SellerOrders from './pages/SellerOrders';
import SellerPayments from './pages/SellerPayments';
import SellerAnalytics from './pages/SellerAnalytics';
import AddProduct from './pages/AddProduct';
import EditProduct from './pages/EditProduct';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminUsers from './pages/AdminUsers';
import VerificationSubscription from './pages/VerificationSubscription';
import Checkout from './pages/Checkout';
import BuyerOrders from './pages/BuyerOrders';
import Payment from './pages/Payment';
import SellerOrderDetails from './pages/SellerOrderDetails';
import BuyerOrderDetails from './pages/BuyerOrderDetails';
import AdminOrders from './pages/AdminOrders.jsx';
import AdminOrderDetails from "./pages/AdminOrderDetails";
import AdminDisputes from "./pages/AdminDisputes"
import BuyerDispute from "./pages/BuyerDispute.jsx"
import { runOrderAutomation } from "./utils/orderAutomation";
import { useEffect } from 'react';
import AdminConstitution from "./pages/AdminConstitution";
import AdminRoute from "./components/AdminRoute";
import Policies from './pages/policies.jsx';
import Terms from "./pages/Terms";

export default function App() {
  useEffect(() => {
    runOrderAutomation();
  }, []);
  return (
    <Router>

      <Routes>
        {/* Smart Home Route - Redirects to role-specific dashboard if signed in, shows landing page if not */}
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<PublicProducts />} />
        <Route path="/product/:id" element={<ProductDetail />} />

        {/* Auth Routes */}
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/email-verified" element={<EmailVerified />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Authenticated Buyer Routes */}
        <Route path="/marketplace" element={
          <ProtectedRoute allowedRoles={['buyer']}>
            <BuyerDashboard />
          </ProtectedRoute>
        } />

        <Route path="/cart" element={
          <ProtectedRoute allowedRoles={['buyer']}>
            <Cart />
          </ProtectedRoute>
        } />
        <Route path="/support" element={
          <ProtectedRoute>
            <Support />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />


        {/* Seller Routes */}
        <Route path="/seller/dashboard" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <SellerDashboard />
          </ProtectedRoute>
        } />
        <Route path="/seller/products" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <SellerProducts />
          </ProtectedRoute>
        } />
        <Route path="/seller/orders" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <SellerOrders />
          </ProtectedRoute>
        } />
        <Route path="/seller/payments" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <SellerPayments />
          </ProtectedRoute>
        } />
        <Route path="/seller/analytics" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <SellerAnalytics />
          </ProtectedRoute>
        } />
        <Route path="/seller/products/new" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <AddProduct />
          </ProtectedRoute>
        } />
        <Route path="/seller/products/:id/edit" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <EditProduct />
          </ProtectedRoute>
        } />
        <Route path="/seller/verification" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <VerificationSubscription />
          </ProtectedRoute>
        } />

        {/* Admin Routes */}
        <Route path="/admin/dashboard" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/admin/products" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminProducts />
          </ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminUsers />
          </ProtectedRoute>
        } />
        <Route path="/admin/approvals" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminProducts />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/checkout/:id" element={
          <ProtectedRoute allowedRoles={['buyer']}>
            <Checkout />
          </ProtectedRoute>
        } />
        <Route path="/orders" element={
          <ProtectedRoute allowedRoles={['buyer']}>
            <BuyerOrders />
          </ProtectedRoute>
        } />
        <Route path="/pay/:id" element={
          <ProtectedRoute allowedRoles={['buyer']}>
            <Payment />
          </ProtectedRoute>
        } />
        <Route path="/seller/orders/:id" element={
          <ProtectedRoute allowedRoles={['seller']}>
            <SellerOrderDetails />
          </ProtectedRoute>
        } />
        <Route path="/buyer/orders/:id" element={
          <ProtectedRoute allowedRoles={['buyer']}>
            <BuyerOrderDetails />
          </ProtectedRoute>
        } />
        <Route path="/admin/orders" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminOrders />
          </ProtectedRoute>
        } />
        <Route path="/admin/order/:id" element={
          <ProtectedRoute allowedRoles={['admin']}><AdminOrderDetails />
          </ProtectedRoute>
        } />

        <Route path="/admin/disputes" element={
          <ProtectedRoute allowedRoles={['admin']}><AdminDisputes />
          </ProtectedRoute>
        } />
        <Route path="/orders/:id/dispute" element={
          <ProtectedRoute allowedRoles={['buyer']}><BuyerDispute />
          </ProtectedRoute>
        } />
        <Route
          path="/admin/constitution"
          element={
            <AdminRoute>
              <AdminConstitution />
            </AdminRoute>
          }
        />
        <Route path="/policies" element={
          <Policies />} />

          <Route path="/terms" element={<Terms />} />



      </Routes>

    </Router>
  );
}
