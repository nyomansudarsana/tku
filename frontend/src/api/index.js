import api from './client'

export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  me:             ()     => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
}

export const usersAPI = {
  list:          (params)     => api.get('/users', { params }),
  create:        (data)       => api.post('/users', data),
  get:           (id)         => api.get(`/users/${id}`),
  update:        (id, data)   => api.put(`/users/${id}`, data),
  delete:        (id)         => api.delete(`/users/${id}`),
  resetPassword: (id, data)   => api.post(`/users/${id}/reset-password`, data),
  exportXlsx:    (params = {}) => api.get('/users/export', { params, responseType: 'blob' }),
}

export const suppliersAPI = {
  list:         (params)             => api.get('/suppliers', { params }),
  create:       (data)               => api.post('/suppliers', data),
  get:          (id)                 => api.get(`/suppliers/${id}`),
  update:       (id, data)           => api.put(`/suppliers/${id}`, data),
  delete:       (id)                 => api.delete(`/suppliers/${id}`),
  listProducts: (supplierId)         => api.get(`/suppliers/${supplierId}/products`),
  linkProduct:  (supplierId, data)   => api.post(`/suppliers/${supplierId}/products`, data),
  unlinkProduct:(supplierId, prodId) => api.delete(`/suppliers/${supplierId}/products/${prodId}`),
  exportXlsx:   (params = {})        => api.get('/suppliers/export', { params, responseType: 'blob' }),
}

export const categoriesAPI = {
  list:   (params)   => api.get('/categories', { params }),
  create: (data)     => api.post('/categories', data),
  get:    (id)       => api.get(`/categories/${id}`),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id)       => api.delete(`/categories/${id}`),
  exportXlsx: (params = {}) => api.get('/categories/export', { params, responseType: 'blob' }),
}

export const productsAPI = {
  list:              (params)          => api.get('/products', { params }),
  create:            (data)            => api.post('/products', data),
  get:               (id)              => api.get(`/products/${id}`),
  update:            (id, data)        => api.put(`/products/${id}`, data),
  delete:            (id)              => api.delete(`/products/${id}`),
  getAvailableStock: (id, params = {}) => api.get(`/products/${id}/available-stock`, { params }),
  exportXlsx:        (params = {})     => api.get('/products/export', { params, responseType: 'blob' }),
}

export const warehousesAPI = {
  list:   (params)   => api.get('/warehouses', { params }),
  create: (data)     => api.post('/warehouses', data),
  get:    (id)       => api.get(`/warehouses/${id}`),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
  delete: (id)       => api.delete(`/warehouses/${id}`),
  exportXlsx: (params = {}) => api.get('/warehouses/export', { params, responseType: 'blob' }),
}

export const storesAPI = {
  list:   (params)   => api.get('/stores', { params }),
  create: (data)     => api.post('/stores', data),
  get:    (id)       => api.get(`/stores/${id}`),
  update: (id, data) => api.put(`/stores/${id}`, data),
  delete: (id)       => api.delete(`/stores/${id}`),
  exportXlsx: (params = {}) => api.get('/stores/export', { params, responseType: 'blob' }),
}

export const receivingsAPI = {
  list:   (params)   => api.get('/receivings', { params }),
  create: (data)     => api.post('/receivings', data),
  get:    (id)       => api.get(`/receivings/${id}`),
  update: (id, data) => api.put(`/receivings/${id}`, data),
  delete: (id)       => api.delete(`/receivings/${id}`),
  exportXlsx: (params = {}) => api.get('/receivings/export', { params, responseType: 'blob' }),
}

// Inventory is read-only in the UI — quantity/avg_cost only change through
// an audited business transaction (Receiving, Sales, Returns, Damaged Stock,
// Stock Opname, Stock Movement). See backend/app/routers/inventory.py.
export const inventoriesAPI = {
  list: (params) => api.get('/inventories', { params }),
  get:  (id)     => api.get(`/inventories/${id}`),
  exportXlsx: (params = {}) => api.get('/inventories/export', { params, responseType: 'blob' }),
}

export const stockMovementsAPI = {
  list:   (params)   => api.get('/stock-movements', { params }),
  create: (data)     => api.post('/stock-movements', data),
  get:    (id)       => api.get(`/stock-movements/${id}`),
  update: (id, data) => api.put(`/stock-movements/${id}`, data),
  delete: (id)       => api.delete(`/stock-movements/${id}`),
  exportXlsx: (params = {}) => api.get('/stock-movements/export', { params, responseType: 'blob' }),
}

export const salesAPI = {
  list:               (params) => api.get('/sales', { params }),
  create:             (data)   => api.post('/sales', data),
  get:                (id)     => api.get(`/sales/${id}`),
  update:             (id, data) => api.put(`/sales/${id}`, data),
  delete:             (id)     => api.delete(`/sales/${id}`),
  togglePaymentStatus:(id)     => api.patch(`/sales/${id}/payment-status`),
  exportXlsx:         (params = {}) => api.get('/sales/export', { params, responseType: 'blob' }),
}

export const salesReturnsAPI = {
  list:   (params)   => api.get('/sales-returns', { params }),
  create: (data)     => api.post('/sales-returns', data),
  get:    (id)       => api.get(`/sales-returns/${id}`),
  update: (id, data) => api.put(`/sales-returns/${id}`, data),
  delete: (id)       => api.delete(`/sales-returns/${id}`),
  exportXlsx: (params = {}) => api.get('/sales-returns/export', { params, responseType: 'blob' }),
}

export const supplierReturnsAPI = {
  list:   (params)   => api.get('/supplier-returns', { params }),
  create: (data)     => api.post('/supplier-returns', data),
  get:    (id)       => api.get(`/supplier-returns/${id}`),
  update: (id, data) => api.put(`/supplier-returns/${id}`, data),
  delete: (id)       => api.delete(`/supplier-returns/${id}`),
  exportXlsx: (params = {}) => api.get('/supplier-returns/export', { params, responseType: 'blob' }),
}

export const damagedStocksAPI = {
  list:   (params)   => api.get('/damaged-stocks', { params }),
  create: (data)     => api.post('/damaged-stocks', data),
  get:    (id)       => api.get(`/damaged-stocks/${id}`),
  update: (id, data) => api.put(`/damaged-stocks/${id}`, data),
  delete: (id)       => api.delete(`/damaged-stocks/${id}`),
  exportXlsx: (params = {}) => api.get('/damaged-stocks/export', { params, responseType: 'blob' }),
}

export const stockOpnamesAPI = {
  list:                  (params)         => api.get('/stock-opnames', { params }),
  create:                (data)           => api.post('/stock-opnames', data),
  get:                   (id)             => api.get(`/stock-opnames/${id}`),
  update:                (id, data)       => api.put(`/stock-opnames/${id}`, data),
  delete:                (id)             => api.delete(`/stock-opnames/${id}`),
  approve:               (id)             => api.post(`/stock-opnames/${id}/approve`),
  reject:                (id)             => api.post(`/stock-opnames/${id}/reject`),
  populateFromInventory: (id)             => api.post(`/stock-opnames/${id}/populate-from-inventory`),
  addDetail:             (id, data)       => api.post(`/stock-opnames/${id}/details`, data),
  updateDetail:          (id, detId, data)=> api.put(`/stock-opnames/${id}/details/${detId}`, data),
  deleteDetail:          (id, detId)      => api.delete(`/stock-opnames/${id}/details/${detId}`),
  exportXlsx:            (params = {})    => api.get('/stock-opnames/export', { params, responseType: 'blob' }),
}

export const bankAccountsAPI = {
  list:   (params)   => api.get('/bank-accounts', { params }),
  create: (data)     => api.post('/bank-accounts', data),
  get:    (id)       => api.get(`/bank-accounts/${id}`),
  update: (id, data) => api.put(`/bank-accounts/${id}`, data),
  delete: (id)       => api.delete(`/bank-accounts/${id}`),
  exportXlsx: (params = {}) => api.get('/bank-accounts/export', { params, responseType: 'blob' }),
}

export const bulkUploadAPI = {
  getTemplate: (importType, format = 'csv') => api.get(`/bulk-upload/templates/${importType}`, { params: { format }, responseType: 'blob' }),
  validate: (importType, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/bulk-upload/validate/${importType}`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  import: (importType, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/bulk-upload/import/${importType}`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  history: (params) => api.get('/bulk-upload/history', { params }),
}

export const permissionsAPI = {
  listCatalog:          ()             => api.get('/permissions'),
  getUserPermissions:   (userId)       => api.get(`/users/${userId}/permissions`),
  updateUserPermissions:(userId, data) => api.put(`/users/${userId}/permissions`, data),
}

export const notificationsAPI = {
  summary: () => api.get('/notifications/summary'),
}

export const reportsAPI = {
  inventory:     (params = {}) => api.get('/reports/inventory', { params }),
  inventoryXlsx: (params = {}) => api.get('/reports/inventory', { params: { ...params, format: 'xlsx' }, responseType: 'blob' }),
  sales:         (params = {}) => api.get('/reports/sales', { params }),
  salesXlsx:     (params = {}) => api.get('/reports/sales', { params: { ...params, format: 'xlsx' }, responseType: 'blob' }),
}

export const adminAPI = {
  listBackups:       () => api.get('/admin/backups'),
  createBackup:      () => api.post('/admin/backup'),
  resetTransactions: (confirmPhrase) => api.post('/admin/reset-transactions', { confirm_phrase: confirmPhrase }),
  loadDemoData:      () => api.post('/admin/load-demo-data'),
}

export const dashboardAPI = {
  salesSummary:           (params) => api.get('/dashboard/sales-summary', { params }),
  topProducts:            (params) => api.get('/dashboard/top-products', { params }),
  salesByCategory:        (params) => api.get('/dashboard/sales-by-category', { params }),
  salesByStore:           (params) => api.get('/dashboard/sales-by-store', { params }),
  salesTrend:             (params) => api.get('/dashboard/sales-trend', { params }),
  stockSummary:           (params) => api.get('/dashboard/stock-summary', { params }),
  lowStock:               (params) => api.get('/dashboard/low-stock', { params }),
  salesByPaymentMethod:   (params) => api.get('/dashboard/sales-by-payment-method', { params }),
  outstandingSales:       ()       => api.get('/dashboard/outstanding-sales'),
  stockByLocation:        ()       => api.get('/dashboard/stock-by-location'),
  pendingCustomerReturns:    ()     => api.get('/dashboard/pending-customer-returns'),
  pendingSupplierReturns:    ()     => api.get('/dashboard/pending-supplier-returns'),
  supplierReturnsInTransit:  ()     => api.get('/dashboard/supplier-returns-in-transit'),
  stockOpnameSummary:        ()     => api.get('/dashboard/stock-opname-summary'),
  damagedStockSummary:       ()     => api.get('/dashboard/damaged-stock-summary'),
}
