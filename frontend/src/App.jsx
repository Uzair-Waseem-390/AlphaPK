import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Users from './pages/Users';
import Profile from './pages/Profile';
import DashboardPage from './pages/DashboardPage';

// Purchases pages
import CategoriesPage from './pages/purchases/CategoriesPage';
import ShelvesPage from './pages/purchases/ShelvesPage';
import SuppliersPage from './pages/purchases/SuppliersPage';
import ProductsPage from './pages/purchases/ProductsPage';
import PurchaseOrdersPage from './pages/purchases/PurchaseOrdersPage';
import PaymentsPage from './pages/purchases/PaymentsPage';
import ReturnsPage from './pages/purchases/ReturnsPage';
import AllReturnsPage from './pages/purchases/AllReturnsPage';
import SuppliersOutstandingPage from './pages/purchases/SuppliersOutstandingPage';
import InventoryPage from './pages/purchases/InventoryPage';
import GlobalPaymentsPage from './pages/purchases/GlobalPaymentsPage';

// Rates pages
import RatesPage from './pages/rates/RatesPage';
import PriceHistoryPage from './pages/rates/PriceHistoryPage';

// Billing pages
import CustomersPage from './pages/billing/CustomersPage';
import CustomerDetailPage from './pages/billing/CustomerDetailPage';
import CustomerOutstandingPage from './pages/billing/CustomerOutstandingPage';
import InvoicesPage from './pages/billing/InvoicesPage';
import CreateInvoicePage from './pages/billing/CreateInvoicePage';
import EditInvoicePage from './pages/billing/EditInvoicePage';
import InvoiceDetailPage from './pages/billing/InvoiceDetailPage';
import BillingPaymentsPage from "./pages/billing/PaymentsPage";
import PaymentDetailPage from './pages/billing/PaymentDetailPage';
import OutstandingInvoicesPage from './pages/billing/OutstandingInvoicesPage';
import BillingReturnsPage from './pages/billing/ReturnsPage';
import ReturnDetailPage from './pages/billing/ReturnDetailPage';

// Expenses pages
import ExpenseCategoriesPage from './pages/expenses/ExpenseCategoriesPage';
import ExpensesPage from './pages/expenses/ExpensesPage';
import ExpenseDetailPage from './pages/expenses/ExpenseDetailPage'; // Add this import
import EditExpensePage from './pages/expenses/EditExpensePage'; // Add this import

import './App.css';

const AppContent = () => {
  const { isAuthenticated } = useAuth();

  return (
    <AnimatePresence mode="wait">
      <Routes>
        {/* Auth Routes */}
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

        {/* Dashboard */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        } />

        {/* User Management */}
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
              <AllReturnsPage />
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

        {/* Rates Routes */}
        <Route path="/rates" element={
          <ProtectedRoute>
            <Layout>
              <RatesPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/rates/history/:productId" element={
          <ProtectedRoute>
            <Layout>
              <PriceHistoryPage />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Billing Routes */}
        <Route path="/billing/customers" element={
          <ProtectedRoute>
            <Layout>
              <CustomersPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/customers/:id" element={
          <ProtectedRoute>
            <Layout>
              <CustomerDetailPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/customers/outstanding" element={
          <ProtectedRoute>
            <Layout>
              <CustomerOutstandingPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/invoices" element={
          <ProtectedRoute>
            <Layout>
              <InvoicesPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/invoices/create" element={
          <ProtectedRoute>
            <Layout>
              <CreateInvoicePage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/invoices/:id" element={
          <ProtectedRoute>
            <Layout>
              <InvoiceDetailPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/invoices/:id/edit" element={
          <ProtectedRoute>
            <Layout>
              <EditInvoicePage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/payments" element={
          <ProtectedRoute>
            <Layout>
              <BillingPaymentsPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/payments/:paymentId" element={
          <ProtectedRoute>
            <Layout>
              <PaymentDetailPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/returns" element={
          <ProtectedRoute>
            <Layout>
              <BillingReturnsPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/returns/:returnId" element={
          <ProtectedRoute>
            <Layout>
              <ReturnDetailPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/billing/invoices/outstanding" element={
          <ProtectedRoute>
            <Layout>
              <OutstandingInvoicesPage />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Expenses Routes */}
        <Route path="/expenses/categories" element={
          <ProtectedRoute>
            <Layout>
              <ExpenseCategoriesPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/expenses" element={
          <ProtectedRoute>
            <Layout>
              <ExpensesPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/expenses/:id" element={
          <ProtectedRoute>
            <Layout>
              <ExpenseDetailPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/expenses/:id/edit" element={
          <ProtectedRoute>
            <Layout>
              <EditExpensePage />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Catch all route - redirect to dashboard */}
        <Route path="*" element={
          <ProtectedRoute>
            <Layout>
              <Navigate to="/dashboard" />
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