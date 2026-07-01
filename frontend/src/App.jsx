import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Suppliers from './pages/Suppliers'
import Categories from './pages/Categories'
import Products from './pages/Products'
import Warehouses from './pages/Warehouses'
import Stores from './pages/Stores'
import Receiving from './pages/Receiving'
import Inventory from './pages/Inventory'
import StockMovement from './pages/StockMovement'
import Sales from './pages/Sales'
import Users from './pages/Users'
import Profile from './pages/Profile'
import BankAccounts from './pages/BankAccounts'
import SalesReturns from './pages/SalesReturns'
import BulkUpload from './pages/BulkUpload'
import SupplierReturns from './pages/SupplierReturns'
import StockOpname from './pages/StockOpname'
import DamagedStock from './pages/DamagedStock'
import RoleManagement from './pages/RoleManagement'
import InventoryReport from './pages/InventoryReport'
import SalesReport from './pages/SalesReport'

function ProtectedRoute({ children, permission }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  // Fail-open when the key is simply absent (stale frontend/backend during
  // rollout) — only an explicit false blocks access.
  if (permission && user.permissions?.[permission] === false) return <Navigate to="/" replace />
  return <Layout>{children}</Layout>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/suppliers" element={<ProtectedRoute permission="master_data.suppliers"><Suppliers /></ProtectedRoute>} />
          <Route path="/categories" element={<ProtectedRoute permission="master_data.categories"><Categories /></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute permission="master_data.products"><Products /></ProtectedRoute>} />
          <Route path="/warehouses" element={<ProtectedRoute permission="master_data.warehouses"><Warehouses /></ProtectedRoute>} />
          <Route path="/stores" element={<ProtectedRoute permission="master_data.stores"><Stores /></ProtectedRoute>} />
          <Route path="/receiving" element={<ProtectedRoute permission="receiving.view"><Receiving /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute permission="inventory.view"><Inventory /></ProtectedRoute>} />
          <Route path="/stock-movement" element={<ProtectedRoute permission="stock_movement.view"><StockMovement /></ProtectedRoute>} />
          <Route path="/sales" element={<ProtectedRoute permission="sales.view"><Sales /></ProtectedRoute>} />
          <Route path="/bank-accounts" element={<ProtectedRoute permission="master_data.bank_accounts"><BankAccounts /></ProtectedRoute>} />
          <Route path="/sales-returns" element={<ProtectedRoute permission="sales_returns.view"><SalesReturns /></ProtectedRoute>} />
          <Route path="/supplier-returns" element={<ProtectedRoute permission="supplier_returns.view"><SupplierReturns /></ProtectedRoute>} />
          <Route path="/stock-opname" element={<ProtectedRoute permission="stock_opname.view"><StockOpname /></ProtectedRoute>} />
          <Route path="/damaged-stock" element={<ProtectedRoute permission="damaged_stock.view"><DamagedStock /></ProtectedRoute>} />
          <Route path="/bulk-upload" element={<ProtectedRoute permission="bulk_upload.view"><BulkUpload /></ProtectedRoute>} />
          <Route path="/reports/inventory" element={<ProtectedRoute permission="inventory.view"><InventoryReport /></ProtectedRoute>} />
          <Route path="/reports/sales" element={<ProtectedRoute permission="sales.view"><SalesReport /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute permission="users.manage"><Users /></ProtectedRoute>} />
          <Route path="/role-management" element={<ProtectedRoute permission="roles.manage"><RoleManagement /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
