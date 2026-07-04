import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Button from './components/common/Button'; // Add this import
// Purchase pages
import Suppliers from './pages/purchases/Suppliers';
import PurchaseOrders from './pages/purchases/PurchaseOrders';
import PurchaseOrderDetail from './pages/purchases/PurchaseOrderDetail';
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
                    <h3 className="text-sm text-neutral-500">Suppliers</h3>
                    <p className="text-3xl font-bold text-neutral-900 mt-2">-</p>
                  </div>
                  <div className="card p-6">
                    <h3 className="text-sm text-neutral-500">Outstanding</h3>
                    <p className="text-3xl font-bold text-neutral-900 mt-2">-</p>
                  </div>
                  <div className="card p-6">
                    <h3 className="text-sm text-neutral-500">Revenue</h3>
                    <p className="text-3xl font-bold text-neutral-900 mt-2">-</p>
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

        {/* Purchase Routes - Order matters! More specific routes first */}
        <Route path="/purchases/suppliers" element={
          <ProtectedRoute>
            <Layout>
              <Suppliers />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Create order route - before the dynamic :id route */}
        <Route path="/purchases/orders/create" element={
          <ProtectedRoute>
            <Layout>
              <div className="text-center py-12">
                <h1 className="text-2xl font-bold text-neutral-900">Create Purchase Order</h1>
                <p className="text-neutral-500 mt-2">Coming soon...</p>
                <Button variant="secondary" className="mt-4" onClick={() => window.history.back()}>
                  Go Back
                </Button>
              </div>
            </Layout>
          </ProtectedRoute>
        } />

        {/* Dynamic route for order details - must come after static routes */}
        <Route path="/purchases/orders/:id" element={
          <ProtectedRoute>
            <Layout>
              <PurchaseOrderDetail />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Main orders list - keep as fallback */}
        <Route path="/purchases/orders" element={
          <ProtectedRoute>
            <Layout>
              <PurchaseOrders />
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