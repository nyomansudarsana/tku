import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'

// ── SVG icon components ──────────────────────────────────────────────────────
const Icon = ({ d, size = 18, stroke = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
)

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  masterData: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></>,
  suppliers: <><rect x="1" y="3" width="15" height="13" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
  categories: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>,
  products: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  warehouses: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  stores: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  bankAccounts: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
  receiving: <><polyline points="8 17 12 21 16 17" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" /></>,
  inventory: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  movement: <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  sales: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
  returns:         <><path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 0 1 0 8h-1" /></>,
  supplierReturns: <><path d="M9 14l-4-4 4-4" /><path d="M5 10h7" /><path d="M17 10h1a4 4 0 0 1 0 8h-1" /><path d="M17 14l2 2-2 2" /></>,
  stockOpname:     <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  damagedStock:    <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  bulkUpload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  reports: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  roles: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
  chevron: <polyline points="9 18 15 12 9 6" />,
  collapse: <polyline points="15 18 9 12 15 6" />,
  menu: <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
}

// ── Navigation config ────────────────────────────────────────────────────────
// Each leaf item's `permission` key is checked against user.permissions
// (from the login/me response) — see NavItem below. Parent groups auto-hide
// when every child is hidden.
const NAV = [
  { label: 'Dashboard', path: '/', iconKey: 'dashboard' },
  {
    label: 'Master Data', iconKey: 'masterData',
    children: [
      { label: 'Suppliers', path: '/suppliers', iconKey: 'suppliers', permission: 'master_data.suppliers' },
      { label: 'Categories', path: '/categories', iconKey: 'categories', permission: 'master_data.categories' },
      { label: 'Products', path: '/products', iconKey: 'products', permission: 'master_data.products' },
      { label: 'Warehouses', path: '/warehouses', iconKey: 'warehouses', permission: 'master_data.warehouses' },
      { label: 'Stores', path: '/stores', iconKey: 'stores', permission: 'master_data.stores' },
      { label: 'Bank Accounts', path: '/bank-accounts', iconKey: 'bankAccounts', permission: 'master_data.bank_accounts' },
    ],
  },
  {
    label: 'Receiving', iconKey: 'receiving',
    children: [
      { label: 'Receiving',        path: '/receiving',         iconKey: 'receiving', permission: 'receiving.view' },
      { label: 'Supplier Returns', path: '/supplier-returns',  iconKey: 'supplierReturns', permission: 'supplier_returns.view' },
    ],
  },
  {
    label: 'Inventory', iconKey: 'inventory',
    children: [
      { label: 'Inventory',      path: '/inventory',       iconKey: 'inventory', permission: 'inventory.view' },
      { label: 'Damaged Stock',  path: '/damaged-stock',   iconKey: 'damagedStock', permission: 'damaged_stock.view' },
      { label: 'Stock Movement', path: '/stock-movement',  iconKey: 'movement', permission: 'stock_movement.view' },
      { label: 'Stock Opname',   path: '/stock-opname',    iconKey: 'stockOpname', permission: 'stock_opname.view' },
    ],
  },
  {
    label: 'Sales', iconKey: 'sales',
    children: [
      { label: 'Sales', path: '/sales', iconKey: 'sales', permission: 'sales.view' },
      { label: 'Sales Returns', path: '/sales-returns', iconKey: 'returns', permission: 'sales_returns.view' },
    ],
  },
  { label: 'Bulk Upload', path: '/bulk-upload', iconKey: 'bulkUpload', permission: 'bulk_upload.view' },
  {
    label: 'Reports', iconKey: 'reports',
    children: [
      { label: 'Inventory Report', path: '/reports/inventory', iconKey: 'inventory', permission: 'inventory.view' },
      { label: 'Sales Report', path: '/reports/sales', iconKey: 'reports', permission: 'sales.view' },
    ],
  },
  { label: 'User Management', path: '/users', iconKey: 'users', permission: 'users.manage' },
  { label: 'Role Management', path: '/role-management', iconKey: 'roles', permission: 'roles.manage' },
]

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  sidebar:      '#ffffff',               // white — logo circle pops clearly against bright bg
  sidebarBorder:'#e5e7eb',               // light gray dividers
  navHover:     '#f3f4f6',               // very light hover
  navActive:    '#f09500',               // Kopernik orange accent
  navActiveBg:  'rgba(240,149,0,0.10)',  // subtle orange tint
  navText:      '#4b5563',               // dark gray — readable on white
  navTextActive:'#1a1a1a',              // near-black for active items
  subActive:    '#f09500',               // Kopernik orange for sub-items
  subHover:     '#f3f4f6',               // light hover
  logo:         '#f09500',
  accent:       '#f09500',
}

// ── Sidebar nav item ─────────────────────────────────────────────────────────
// A key absent from user.permissions fails open (treated as visible) so a
// stale frontend/backend pairing during rollout doesn't hide everything —
// only an explicit false hides an item.
const isVisible = (user, permission) => !permission || user?.permissions?.[permission] !== false

function NavItem({ item, collapsed }) {
  const location = useLocation()
  const { user } = useAuth()
  const visibleChildren = item.children?.filter(c => isVisible(user, c.permission)) ?? []
  const hasChildren = item.children?.length > 0
  const childPaths = visibleChildren.map(c => c.path)

  const isActive = item.path
    ? location.pathname === item.path
    : childPaths.includes(location.pathname)

  // Hooks must run unconditionally on every render — the visibility checks
  // that can return null happen further below, after all hooks are called.
  const [open, setOpen] = useState(isActive)

  useEffect(() => {
    if (childPaths.includes(location.pathname)) setOpen(true)
  }, [location.pathname])

  if (!isVisible(user, item.permission)) return null
  if (hasChildren && visibleChildren.length === 0) return null

  const iconEl = (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.25rem', flexShrink: 0 }}>
      <Icon d={ICONS[item.iconKey]} size={16} stroke={isActive ? C.navTextActive : C.navText} />
    </span>
  )

  const baseItem = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    padding: collapsed ? '0.625rem' : '0.625rem 0.875rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
    textDecoration: 'none',
    userSelect: 'none',
    justifyContent: collapsed ? 'center' : 'flex-start',
  }

  if (hasChildren) {
    return (
      <li style={{ listStyle: 'none' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            ...baseItem,
            width: '100%',
            border: 'none',
            background: isActive ? C.navActiveBg : 'transparent',
            color: isActive ? C.navTextActive : C.navText,
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.navHover }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          title={collapsed ? item.label : undefined}
        >
          {iconEl}
          {!collapsed && (
            <>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.8125rem', fontWeight: 500 }}>{item.label}</span>
              <span style={{
                fontSize: '0.625rem',
                transition: 'transform 0.2s',
                transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                opacity: 0.6,
              }}>
                <Icon d={ICONS.chevron} size={14} stroke="currentColor" />
              </span>
            </>
          )}
        </button>

        {/* Animated submenu */}
        {!collapsed && (
          <ul style={{
            listStyle: 'none',
            overflow: 'hidden',
            maxHeight: open ? `${visibleChildren.length * 3}rem` : '0',
            opacity: open ? 1 : 0,
            transition: 'max-height 0.25s ease, opacity 0.2s ease',
            paddingLeft: '0.75rem',
            marginTop: open ? '0.25rem' : 0,
          }}>
            {visibleChildren.map(child => {
              const childActive = location.pathname === child.path
              return (
                <li key={child.path} style={{ listStyle: 'none', marginBottom: '0.125rem' }}>
                  <Link
                    to={child.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.8rem',
                      fontWeight: childActive ? 600 : 400,
                      color: childActive ? C.subActive : C.navText,
                      background: childActive ? 'rgba(245,165,35,0.14)' : 'transparent',
                      textDecoration: 'none',
                      transition: 'all 0.15s',
                      borderLeft: childActive ? `2px solid ${C.subActive}` : '2px solid transparent',
                    }}
                    onMouseEnter={e => { if (!childActive) e.currentTarget.style.background = C.subHover }}
                    onMouseLeave={e => { if (!childActive) e.currentTarget.style.background = childActive ? 'rgba(245,165,35,0.14)' : 'transparent' }}
                  >
                    <span style={{ display: 'flex' }}>
                      <Icon d={ICONS[child.iconKey]} size={13} stroke={childActive ? C.subActive : '#64748b'} />
                    </span>
                    {child.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li style={{ listStyle: 'none' }}>
      <Link
        to={item.path}
        style={{
          ...baseItem,
          background: isActive ? C.navActiveBg : 'transparent',
          color: isActive ? C.navTextActive : C.navText,
          borderLeft: isActive ? `3px solid ${C.navActive}` : '3px solid transparent',
          paddingLeft: collapsed ? baseItem.padding : `calc(0.875rem - 3px)`,
          fontWeight: isActive ? 600 : 400,
          fontSize: '0.8125rem',
        }}
        title={collapsed ? item.label : undefined}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = C.navHover; e.currentTarget.style.color = C.navTextActive } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.navText } }}
      >
        {iconEl}
        {!collapsed && <span>{item.label}</span>}
      </Link>
    </li>
  )
}

// ── Main Layout ──────────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => { logout(); navigate('/login') }

  const breadcrumb = location.pathname === '/'
    ? ['Dashboard']
    : location.pathname.slice(1).split('/').map(s => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '))

  const sidebarWidth = collapsed ? '4rem' : '15rem'

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '1rem 0.5rem' : '1.125rem 1rem 1rem',
        borderBottom: `1px solid ${C.sidebarBorder}`,
        borderTop: `3px solid ${C.navActive}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: collapsed ? 'center' : 'flex-start',
        gap: '0.5rem',
        flexShrink: 0,
        background: `linear-gradient(180deg, rgba(240,149,0,0.07) 0%, transparent 100%)`,
      }}>
        {collapsed ? (
          /* Collapsed: circular Kopernik icon */
          <img
            src="/assets/logo/kopernik-icon.png"
            alt="Kopernik"
            style={{ height: '2.5rem', width: 'auto', objectFit: 'contain', maxWidth: '3rem', flexShrink: 0, display: 'block' }}
          />
        ) : (
          /* Expanded: circular icon + app name */
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <img
              src="/assets/logo/kopernik-icon.png"
              alt="Kopernik"
              style={{ height: '2.75rem', width: 'auto', objectFit: 'contain', maxWidth: '4rem', flexShrink: 0, display: 'block' }}
            />
            <div>
              <div style={{ color: '#1e293b', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '0.01em' }}>
                Tech Kiosk Ubud
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.625rem', marginTop: '1px', letterSpacing: '0.02em' }}>
                Inventory &amp; Sales
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.625rem 0.5rem', scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.125rem', padding: 0, margin: 0 }}>
          {NAV.map(item => (
            <NavItem key={item.label} item={item} collapsed={collapsed} />
          ))}
        </ul>
      </nav>

      {/* User section (bottom) */}
      <div style={{
        padding: collapsed ? '0.75rem 0.5rem' : '0.75rem 1rem',
        borderTop: `1px solid ${C.sidebarBorder}`,
        flexShrink: 0,
      }}>
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: '2rem', height: '2rem', borderRadius: '50%', flexShrink: 0,
              background: 'rgba(240,149,0,0.12)', border: '1px solid rgba(240,149,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, color: '#c07800',
            }}>
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name}</div>
              <div style={{ fontSize: '0.6rem', color: '#6b7280' }}>{user?.role}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: '1.75rem', height: '1.75rem', borderRadius: '50%',
              background: 'rgba(240,149,0,0.12)', border: '1px solid rgba(240,149,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 700, color: '#c07800',
            }}>
              {user?.full_name?.charAt(0) || 'U'}
            </div>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: '0.625rem',
          borderTop: `1px solid ${C.sidebarBorder}`,
          textAlign: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9ca3af',
          fontSize: '0.75rem',
          transition: 'color 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#4b5563' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af' }}
      >
        <Icon d={collapsed ? ICONS.chevron : ICONS.collapse} size={14} />
        {!collapsed && <span>Collapse</span>}
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40, display: 'none' }}
          className="mobile-overlay"
        />
      )}

      {/* Sidebar — desktop */}
      <aside style={{
        width: sidebarWidth,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        background: C.sidebar,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: '1px 0 0 0 #e5e7eb, 2px 0 8px rgba(0,0,0,0.06)',
      }}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <header style={{
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 1.5rem',
          height: '3.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
            {collapsed && (
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Tech Kiosk Ubud
              </span>
            )}
            <nav style={{ fontSize: '0.8125rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ color: '#cbd5e1', flexShrink: 0 }}>Home</span>
              {breadcrumb.map((b, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: i < breadcrumb.length - 1 ? 1 : 0, overflow: 'hidden' }}>
                  <span style={{ color: '#d1d5db', fontSize: '0.65rem', flexShrink: 0 }}>›</span>
                  <span style={{
                    color: i === breadcrumb.length - 1 ? '#1e293b' : '#94a3b8',
                    fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{b}</span>
                </span>
              ))}
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <NotificationBell />

          {/* Profile dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setProfileOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: profileOpen ? '#f1f5f9' : 'none',
                border: '1px solid transparent',
                borderColor: profileOpen ? '#e2e8f0' : 'transparent',
                cursor: 'pointer', padding: '0.375rem 0.625rem', borderRadius: '0.5rem',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = '#e2e8f0' }}
              onMouseLeave={e => { if (!profileOpen) { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent' } }}
            >
              <div style={{
                width: '1.875rem', height: '1.875rem', background: '#dbeafe',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', flexShrink: 0,
              }}>
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b', lineHeight: 1.2 }}>{user?.full_name}</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{user?.role}</div>
              </div>
              <Icon d={ICONS.chevron} size={14} stroke="#94a3b8" />
            </button>

            {profileOpen && (
              <>
                <div onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 0.5rem)',
                  background: 'white', border: '1px solid #e2e8f0',
                  borderRadius: '0.625rem', boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  minWidth: '13rem', zIndex: 100, overflow: 'hidden',
                }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b' }}>{user?.full_name}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.125rem' }}>{user?.role} · {user?.username}</div>
                  </div>
                  <Link to="/profile" onClick={() => setProfileOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 1rem', fontSize: '0.8125rem', color: '#374151', textDecoration: 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" size={14} /> My Profile
                  </Link>
                  <div style={{ borderTop: '1px solid #f1f5f9' }} />
                  <button onClick={handleLogout}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', width: '100%', padding: '0.625rem 1rem', fontSize: '0.8125rem', color: '#dc2626', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" size={14} stroke="#dc2626" /> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
