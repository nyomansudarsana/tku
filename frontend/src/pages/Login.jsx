import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import CompanyLogo from '../components/CompanyLogo'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' }}>
      <div style={{ width: '100%', maxWidth: '26rem', padding: '1rem' }}>
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.125rem' }}>
            <CompanyLogo height={36} dark />
          </div>
          <h1 style={{ color: 'white', fontSize: '1.375rem', fontWeight: 700, marginBottom: '0.375rem', letterSpacing: '-0.01em' }}>
            Tech Kiosk Ubud
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8125rem' }}>
            Inventory &amp; Sales Management System
          </p>
        </div>

        {/* Card */}
        <div style={{ background: 'white', borderRadius: '1rem', padding: '2rem', boxShadow: '0 20px 25px rgba(0,0,0,0.15)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '1.5rem' }}>Sign In to your account</h2>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: '0.5rem', justifyContent: 'center', width: '100%', padding: '0.625rem' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
            Default: admin / admin
          </p>
        </div>
      </div>
    </div>
  )
}
