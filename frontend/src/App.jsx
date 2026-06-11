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

function ProtectedRoute({ children, adminOnly }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'Admin') return <Navigate to="/" replace />
  return <Layout>{children}</Layout>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
          <Route path="/categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
          <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
          <Route path="/warehouses" element={<ProtectedRoute><Warehouses /></ProtectedRoute>} />
          <Route path="/stores" element={<ProtectedRoute><Stores /></ProtectedRoute>} />
          <Route path="/receiving" element={<ProtectedRoute><Receiving /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
          <Route path="/stock-movement" element={<ProtectedRoute><StockMovement /></ProtectedRoute>} />
          <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
          <Route path="/bank-accounts" element={<ProtectedRoute><BankAccounts /></ProtectedRoute>} />
          <Route path="/sales-returns" element={<ProtectedRoute><SalesReturns /></ProtectedRoute>} />
          <Route path="/supplier-returns" element={<ProtectedRoute><SupplierReturns /></ProtectedRoute>} />
          <Route path="/stock-opname" element={<ProtectedRoute><StockOpname /></ProtectedRoute>} />
          <Route path="/damaged-stock" element={<ProtectedRoute><DamagedStock /></ProtectedRoute>} />
          <Route path="/bulk-upload" element={<ProtectedRoute><BulkUpload /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
