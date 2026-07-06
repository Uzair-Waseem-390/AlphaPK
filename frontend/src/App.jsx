import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Users from './pages/Users';
import Profile from './pages/Profile';

// Purchases pages
import CategoriesPage from './pages/purchases/CategoriesPage';
import ShelvesPage from './pages/purchases/ShelvesPage';
import SuppliersPage from './pages/purchases/SuppliersPage';
import ProductsPage from './pages/purchases/ProductsPage';
import PurchaseOrdersPage from './pages/purchases/PurchaseOrdersPage';
import PaymentsPage from './pages/purchases/PaymentsPage';
import ReturnsPage from './pages/purchases/ReturnsPage';
import SuppliersOutstandingPage from './pages/purchases/SuppliersOutstandingPage';
import InventoryPage from './pages/purchases/InventoryPage';
import GlobalPaymentsPage from './pages/purchases/GlobalPaymentsPage';

import './App.css';

const AppContent = () => {
  const { isAuthenticated } = useAuth();

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/dashboard" /> : <Login />
        } />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout>
              <Navigate to="/dashboard" />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout>
              <div className="space-y-6">
                <h1 className="text-3xl font-bold text-neutral-900">Dashboard</h1>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="card p-6">
                    <h3 className="text-sm text-neutral-500">Total Orders</h3>
                    <p className="text-3xl font-bold text-neutral-900 mt-2">-</p>
                  </div>
                  <div className="card p-6">
                    <h3 className="text-sm text-neutral-500">Total Suppliers</h3>
                    <p className="text-3xl font-bold text-neutral-900 mt-2">-</p>
                  </div>
                  <div className="card p-6">
                    <h3 className="text-sm text-neutral-500">Total Products</h3>
                    <p className="text-3xl font-bold text-neutral-900 mt-2">-</p>
                  </div>
                  <div className="card p-6">
                    <h3 className="text-sm text-neutral-500">Outstanding</h3>
                    <p className="text-3xl font-bold text-error-600 mt-2">-</p>
                  </div>
                </div>
              </div>
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/users" element={
          <ProtectedRoute>
            <Layout>
              <Users />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/profile" element={
          <ProtectedRoute>
            <Layout>
              <Profile />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Purchases Routes */}
        <Route path="/purchases/categories" element={
          <ProtectedRoute>
            <Layout>
              <CategoriesPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/shelves" element={
          <ProtectedRoute>
            <Layout>
              <ShelvesPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/suppliers" element={
          <ProtectedRoute>
            <Layout>
              <SuppliersPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/products" element={
          <ProtectedRoute>
            <Layout>
              <ProductsPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/orders" element={
          <ProtectedRoute>
            <Layout>
              <PurchaseOrdersPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/payments" element={
          <ProtectedRoute>
            <Layout>
              <GlobalPaymentsPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/orders/:orderId/payments" element={
          <ProtectedRoute>
            <Layout>
              <PaymentsPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/returns" element={
          <ProtectedRoute>
            <Layout>
              <ReturnsPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/orders/:orderId/returns" element={
          <ProtectedRoute>
            <Layout>
              <ReturnsPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/suppliers/outstanding" element={
          <ProtectedRoute>
            <Layout>
              <SuppliersOutstandingPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/purchases/inventory" element={
          <ProtectedRoute>
            <Layout>
              <InventoryPage />
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;