
import { useEffect, useState } from 'react'
import './App.css'

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong')
    error.status = response.status
    throw error
  }

  return data
}

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)

  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [services, setServices] = useState([])
  const [serviceName, setServiceName] = useState('')
  const [serviceUrl, setServiceUrl] = useState('')
  const [serviceSubmitting, setServiceSubmitting] = useState(false)
  const [serviceFormError, setServiceFormError] = useState('')
  const [serviceFormMessage, setServiceFormMessage] = useState('')
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [incidentsLoading, setIncidentsLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState('')

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [monitoringHistory, setMonitoringHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const [checkingService, setCheckingService] = useState(null)
  const [actionMessage, setActionMessage] = useState('')
  const [logoutLoading, setLogoutLoading] = useState(false)

  // Check whether a valid login session already exists.
  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      try {
        const data = await apiRequest('/api/auth/me')

        if (!cancelled && data.authenticated) {
          setUser(data.user)
        }
      } catch (error) {
        if (!cancelled && error.status !== 401) {
          setAuthError(error.message)
        }
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }

    checkSession()

    return () => {
      cancelled = true
    }
  }, [])

  // Login and registration.
  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError('')
    setAuthSubmitting(true)

    try {
      const isRegister = authMode === 'register'

      const payload = isRegister
        ? { name, email, password, organizationName }
        : { email, password }

      const data = await apiRequest(
        isRegister ? '/api/auth/register' : '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      )

      setUser(data.user)
      setPassword('')
      setAuthError('')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthSubmitting(false)
    }
  }

  // Logout and revoke the session.
  async function handleLogout() {
    setLogoutLoading(true)

    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
      setUser(null)
      setServices([])
      setIncidents([])
      setMonitoringHistory([])
      setSelectedServiceId('')
      setAuthMode('login')
      setPassword('')
      setAuthError('')
    } catch (error) {
      setActionMessage(error.message)
    } finally {
      setLogoutLoading(false)
    }
  }

  // Load organization-specific dashboard data.
  async function loadDashboard() {
    setLoading(true)
    setIncidentsLoading(true)
    setDashboardError('')

    try {
      const [serviceData, incidentData] = await Promise.all([
        apiRequest('/api/services'),
        apiRequest('/api/incidents'),
      ])

      setServices(serviceData.services || [])
      setIncidents(incidentData.incidents || [])
    } catch (error) {
      if (error.status === 401) {
        setUser(null)
      } else {
        setDashboardError(error.message)
      }
    } finally {
      setLoading(false)
      setIncidentsLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadDashboard()
  }, [user?.id])

  // Select the first available service automatically.
  useEffect(() => {
    if (services.length > 0) {
      const currentExists = services.some(
        service => String(service.id) === String(selectedServiceId)
      )

      if (!currentExists) {
        setSelectedServiceId(String(services[0].id))
      }
    } else {
      setSelectedServiceId('')
    }
  }, [services, selectedServiceId])

  // Retrieve history for the selected service.
  useEffect(() => {
    if (!user || !selectedServiceId) {
      setMonitoringHistory([])
      return
    }

    let cancelled = false
    let firstLoad = true

    async function fetchHistory() {
      if (firstLoad) setHistoryLoading(true)

      try {
        const data = await apiRequest(
          `/api/monitoring-history?id=${encodeURIComponent(selectedServiceId)}`
        )

        if (!cancelled) {
          setMonitoringHistory(data.history || [])
          setHistoryError('')
        }
      } catch (error) {
        if (!cancelled) {
          if (error.status === 401) {
            setUser(null)
          } else {
            setHistoryError(error.message)
          }
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false)
          firstLoad = false
        }
      }
    }

    fetchHistory()

    const intervalId = setInterval(fetchHistory, 30000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [user?.id, selectedServiceId])

  // Run an immediate monitoring check.
  async function handleMonitor(serviceId) {
    setCheckingService(serviceId)
    setActionMessage('')

    try {
      const result = await apiRequest(`/api/monitor?id=${serviceId}`)

      setActionMessage(
        `${result.service}: ${result.status} Â· ${
          result.responseTime ?? 'N/A'
        } ms`
      )

      await loadDashboard()

      const history = await apiRequest(
        `/api/monitoring-history?id=${serviceId}`
      )

      if (String(selectedServiceId) === String(serviceId)) {
        setMonitoringHistory(history.history || [])
      }
    } catch (error) {
      setActionMessage(error.message)
    } finally {
      setCheckingService(null)
    }
  }


  // Add a new monitored service.
  async function handleAddService(event) {
    event.preventDefault()
    setServiceFormError('')
    setServiceFormMessage('')
    setServiceSubmitting(true)

    try {
      const data = await apiRequest('/api/services', {
        method: 'POST',
        body: JSON.stringify({
          name: serviceName,
          url: serviceUrl,
        }),
      })

      setServiceName('')
      setServiceUrl('')
      setServiceFormMessage(data.message || 'Service added successfully')

      await loadDashboard()
    } catch (error) {
      setServiceFormError(error.message)
    } finally {
      setServiceSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand auth-brand">
            <div className="brand-icon">O</div>
            <span>Ops<span className="brand-highlight">Pulse</span></span>
          </div>
          <p>Checking your session...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    const registering = authMode === 'register'

    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand auth-brand">
            <div className="brand-icon">O</div>
            <span>Ops<span className="brand-highlight">Pulse</span></span>
          </div>

          <h1>{registering ? 'Create your workspace' : 'Welcome back'}</h1>
          <p className="auth-subtitle">
            {registering
              ? 'Create your account to start monitoring your services.'
              : 'Sign in to monitor your infrastructure.'}
          </p>

          {authError && <div className="auth-error">{authError}</div>}

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {registering && (
              <>
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="Your name"
                  minLength={2}
                  maxLength={100}
                  required
                />

                <label htmlFor="organization">Workspace name</label>
                <input
                  id="organization"
                  type="text"
                  value={organizationName}
                  onChange={event => setOrganizationName(event.target.value)}
                  placeholder="Your company or workspace"
                  minLength={2}
                  maxLength={100}
                />
              </>
            )}

            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder={registering ? 'At least 12 characters' : 'Your password'}
              minLength={registering ? 12 : undefined}
              maxLength={128}
              required
            />

            <button
              className="primary-button auth-submit"
              type="submit"
              disabled={authSubmitting}
            >
              {authSubmitting
                ? 'Please wait...'
                : registering
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          <div className="auth-switch">
            {registering
              ? 'Already have an account?'
              : "Don't have an account?"}

            <button
              type="button"
              onClick={() => {
                setAuthMode(registering ? 'login' : 'register')
                setAuthError('')
              }}
            >
              {registering ? 'Sign in' : 'Create account'}
            </button>
          </div>

          <p className="auth-footer">
            OpsPulse Â· Infrastructure Monitoring Platform
          </p>
        </div>
      </div>
    )
  }

  const totalServices = services.length

  const operationalCount = services.filter(
    service => service.status === 'operational'
  ).length

  const degradedCount = services.filter(
    service => service.status === 'degraded'
  ).length

  const downCount = services.filter(
    service => service.status === 'down'
  ).length

  const unknownCount = services.filter(
    service => !['operational', 'degraded', 'down'].includes(service.status)
  ).length

  const activeIncidents = incidents.filter(
    incident => incident.status !== 'resolved'
  ).length

  const uptimeValues = services
    .map(service => service.uptime)
    .filter(value => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite)

  const averageUptime = uptimeValues.length
    ? (
        uptimeValues.reduce((sum, value) => sum + value, 0) /
        uptimeValues.length
      ).toFixed(2)
    : null

  const validResponseTimes = monitoringHistory
    .map(check => check.response_time_ms)
    .filter(value => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite)

  const averageResponseTime = validResponseTimes.length
    ? Math.round(
        validResponseTimes.reduce((sum, value) => sum + value, 0) /
        validResponseTimes.length
      )
    : null

  const chartMax = Math.max(
    100,
    Math.ceil(Math.max(...validResponseTimes, 100) / 100) * 100
  )

  const overallStatus =
    downCount > 0
      ? 'Some services are down'
      : degradedCount > 0
        ? 'Some services need attention'
        : unknownCount === totalServices && totalServices > 0
          ? 'Waiting for monitoring checks'
          : 'Systems are operational'

  function statusLabel(status) {
    if (status === 'operational') return 'Operational'
    if (status === 'degraded') return 'Degraded'
    if (status === 'down') return 'Down'
    return 'Unknown'
  }

  function statusClass(status) {
    if (status === 'operational') return 'healthy'
    if (status === 'down') return 'down'
    return 'degraded'
  }

  const userInitials = (user.name || 'User')
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">O</div>
          <span>Ops<span className="brand-highlight">Pulse</span></span>
        </div>

        <div className="workspace">
          <div className="workspace-avatar">O</div>
          <div className="workspace-details">
            <strong>{user.organization_name || 'My Workspace'}</strong>
            <small>Free Plan</small>
          </div>
          <span className="workspace-arrow">âŒ„</span>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="navigation">
          <a href="#overview" className="nav-item active">
            <span>â–¦</span> Overview
          </a>
          <a href="#services" className="nav-item">
            <span>â—‰</span> Monitored Services
          </a>
          <a href="#incidents" className="nav-item">
            <span>âš </span> Incidents
            {activeIncidents > 0 && (
              <span className="nav-count">{activeIncidents}</span>
            )}
          </a>
          <a href="#analytics" className="nav-item">
            <span>â–¥</span> Analytics
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <strong>Need help?</strong>
            <p>Explore Cloudflare documentation and learn how to monitor your services.</p>
            <a href="https://developers.cloudflare.com/workers/" target="_blank" rel="noreferrer">
              View documentation â†—
            </a>
          </div>

          <div className="user-profile">
            <div className="user-avatar">{userInitials}</div>
            <div className="profile-details">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <button
              className="logout-button"
              onClick={handleLogout}
              disabled={logoutLoading}
              title="Sign out"
            >
              {logoutLoading ? '...' : 'â†ª'}
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Overview</strong>
          </div>

          <div className="topbar-actions">
            <span className="environment-label">â— production</span>
            <button
              className="refresh-button"
              onClick={loadDashboard}
              disabled={loading}
            >
              â†» Refresh
            </button>
            <div className="topbar-avatar">{userInitials}</div>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="page-heading">
            <div>
              <h1>Overview</h1>
              <p>Monitor your infrastructure and service health in one place.</p>
            </div>
            <button
              className="primary-button"
              onClick={loadDashboard}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'â†» Refresh Data'}
            </button>
          </section>

          <section className={`system-banner ${
            downCount > 0 ? 'system-banner-danger' :
            degradedCount > 0 ? 'system-banner-warning' : ''
          }`}>
            <div className="system-indicator"></div>
            <div>
              <strong>{overallStatus}</strong>
              <p>
                {totalServices === 0
                  ? 'No services are registered in this workspace yet.'
                  : `${operationalCount} operational Â· ${degradedCount} degraded Â· ${downCount} down Â· ${unknownCount} unknown`}
              </p>
            </div>
            <span className="banner-time">Live workspace data</span>
          </section>

          {dashboardError && (
            <div className="dashboard-error">{dashboardError}</div>
          )}

          {actionMessage && (
            <div className="action-message">{actionMessage}</div>
          )}

          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-heading">
                <span>Monitored Services</span>
                <span className="stat-icon blue">â—‰</span>
              </div>
              <div className="stat-value">
                {loading ? '...' : totalServices}
              </div>
              <div className="stat-description">Registered in this workspace</div>
            </div>

            <div className="stat-card">
              <div className="stat-heading">
                <span>Operational</span>
                <span className="stat-icon green">âœ“</span>
              </div>
              <div className="stat-value">
                {loading ? '...' : operationalCount}
              </div>
              <div className="stat-description">Services running normally</div>
            </div>

            <div className="stat-card">
              <div className="stat-heading">
                <span>Average Uptime</span>
                <span className="stat-icon purple">â†—</span>
              </div>
              <div className="stat-value">
                {loading ? '...' : averageUptime === null ? 'â€”' : `${averageUptime}%`}
              </div>
              <div className="stat-description">
                Based on recorded monitoring checks
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-heading">
                <span>Active Incidents</span>
                <span className="stat-icon orange">!</span>
              </div>
              <div className="stat-value">
                {incidentsLoading ? '...' : activeIncidents}
              </div>
              <div className="stat-description warning">
                Unresolved incidents
              </div>
            </div>
          </section>

          <section className="content-grid" id="analytics">
            <div className="panel uptime-panel">
              <div className="panel-heading">
                <div>
                  <h2>Response Time</h2>
                  <p>Recorded monitoring checks for the selected service</p>
                </div>

                <select
                  value={selectedServiceId}
                  onChange={event => setSelectedServiceId(event.target.value)}
                  disabled={services.length === 0}
                  aria-label="Select service for response time"
                >
                  {services.length === 0 && <option value="">No services</option>}
                  {services.map(service => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="chart-summary">
                <strong>
                  {historyLoading
                    ? '...'
                    : historyError
                      ? 'â€”'
                      : averageResponseTime ?? 'â€”'}
                  <span> ms</span>
                </strong>

                <span className="chart-positive">
                  {historyLoading
                    ? 'Loading history...'
                    : historyError
                      ? historyError
                      : `${validResponseTimes.length} recorded check(s)`}
                </span>
              </div>

              <div className="chart-area">
                {historyLoading ? (
                  <p>Loading monitoring history...</p>
                ) : historyError ? (
                  <p>{historyError}</p>
                ) : validResponseTimes.length === 0 ? (
                  <p>No monitoring checks recorded yet.</p>
                ) : (
                  <>
                    <div className="chart-y-axis">
                      <span>{chartMax} ms</span>
                      <span>{Math.round(chartMax * 2 / 3)} ms</span>
                      <span>{Math.round(chartMax / 3)} ms</span>
                      <span>0 ms</span>
                    </div>

                    <div className="chart-bars">
                      {monitoringHistory
                       .slice(0, 10)
                        .filter(check => check.response_time_ms !== null &&
                          check.response_time_ms !== undefined)
                        .slice()
                        .reverse()
                        .map(check => (
                          <div
                            className="chart-bar"
                            key={check.id}
                            style={{
                              height: `${Math.max(
                                3,
                                (Number(check.response_time_ms) / chartMax) * 100
                              )}%`,
                            }}
                            title={`${check.response_time_ms} ms | HTTP ${check.http_status ?? 'N/A'} | ${check.status}`}
                          />
                        ))}
                    </div>
                  </>
                )}
              </div>

              <div className="chart-x-axis">
                <span>Older checks</span>
                <span>Newer checks</span>
              </div>
            </div>

<div className="history-table">
  <h3>Recent Monitoring Checks</h3>

  {monitoringHistory.length === 0 ? (
    <p>No monitoring history available.</p>
  ) : (
    <div className="history-table-scroll">
      <table>
        <thead>
          <tr>
            <th>Date &amp; Time</th>
            <th>Status</th>
            <th>Response</th>
            <th>HTTP</th>
          </tr>
        </thead>
        <tbody>
          {monitoringHistory.slice(0, 10).map(check => (
            <tr key={check.id}>
              <td>
                {check.checked_at
                  ? new Date(
                      check.checked_at.includes('Z') ||
                      /[+-]\d{2}:\d{2}$/.test(check.checked_at)
                        ? check.checked_at
                        : `${check.checked_at.replace(' ', 'T')}Z`
                    ).toLocaleString()
                  : 'Time unavailable'}
              </td>
              <td>{check.status}</td>
              <td>
                {check.response_time_ms != null
                  ? `${check.response_time_ms} ms`
                  : 'â€”'}
              </td>
              <td>{check.http_status ?? 'â€”'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>

            <div className="panel availability-panel">
              <div className="panel-heading">
                <div>
                  <h2>Service Availability</h2>
                  <p>Current health distribution</p>
                </div>
              </div>

              <div className="availability-number">
                {loading || totalServices === 0
                  ? 'â€”'
                  : `${((operationalCount / totalServices) * 100).toFixed(1)}%`}
              </div>

              <p className="availability-caption">
                {loading ? 'Loading...' : `${operationalCount} of ${totalServices} operational`}
              </p>

              <div className="availability-track">
                {totalServices > 0 && (
                  <>
                    <div
                      className="track-healthy"
                      style={{ flex: operationalCount }}
                    />
                    <div
                      className="track-warning"
                      style={{ flex: degradedCount }}
                    />
                    <div
                      className="track-down"
                      style={{ flex: downCount }}
                    />
                    <div
                      className="track-unknown"
                      style={{ flex: unknownCount }}
                    />
                  </>
                )}
              </div>

              <div className="availability-legend">
                <div><span className="legend-dot green-dot"></span> Operational <strong>{operationalCount}</strong></div>
                <div><span className="legend-dot yellow-dot"></span> Degraded <strong>{degradedCount}</strong></div>
                <div><span className="legend-dot red-dot"></span> Down <strong>{downCount}</strong></div>
                <div><span className="legend-dot unknown-dot"></span> Unknown <strong>{unknownCount}</strong></div>
              </div>
            </div>
          </section>

          <section className="panel services-panel" id="services">
            <div className="panel-heading">
              <div>
                <h2>Monitored Services</h2>
                <p>Health status of your registered services</p>
              </div>
              <span className="view-all">{totalServices} service(s)</span>
            </div>


<form className="add-service-form" onSubmit={handleAddService}>
  <div className="add-service-fields">
    <input
      type="text"
      placeholder="Service name (e.g. Production API)"
      value={serviceName}
      onChange={(event) => setServiceName(event.target.value)}
      maxLength={100}
      required
    />

    <input
      type="url"
      placeholder="HTTPS URL (e.g. https://example.com)"
      value={serviceUrl}
      onChange={(event) => setServiceUrl(event.target.value)}
      maxLength={2048}
      required
    />

    <button type="submit" disabled={serviceSubmitting}>
      {serviceSubmitting ? 'Adding...' : '+ Add Service'}
    </button>
  </div>

  {serviceFormError && (
    <p className="form-error">{serviceFormError}</p>
  )}

  {serviceFormMessage && (
    <p className="form-success">{serviceFormMessage}</p>
  )}
</form>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Uptime</th>
                    <th>Response Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr><td colSpan="5">Loading services...</td></tr>
                  ) : services.length === 0 ? (
                    <tr><td colSpan="5">No services found in this workspace.</td></tr>
                  ) : (
                    services.map(service => (
                      <tr key={service.id}>
                        <td>
                          <div className="service-name">{service.name}</div>
                          <div className="service-url">{service.url}</div>
                        </td>

                        <td>
                          <span className={`status-badge ${statusClass(service.status)}`}>
                            <span className="status-dot"></span>
                            {statusLabel(service.status)}
                          </span>
                        </td>

                        <td>
                          {service.uptime === null || service.uptime === undefined
                            ? 'â€”'
                            : `${service.uptime}%`}
                        </td>

                        <td>
                          {service.responseTime === null || service.responseTime === undefined
                            ? 'â€”'
                            : `${service.responseTime} ms`}
                        </td>

                        <td>
                          <button
                            className="row-action monitor-button"
                            onClick={() => handleMonitor(service.id)}
                            disabled={checkingService !== null}
                            title={`Run a health check for ${service.name}`}
                          >
                            {checkingService === service.id
                              ? 'Checking...'
                              : 'Check now'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel incidents-panel" id="incidents">
            <div className="panel-heading">
              <div>
                <h2>Recent Incidents</h2>
                <p>Latest events requiring attention</p>
              </div>
              <span className="view-all">{incidents.length} incident(s)</span>
            </div>

            <div className="incident-list">
              {incidentsLoading ? (
                <p>Loading incidents...</p>
              ) : incidents.length === 0 ? (
                <p>No incidents found.</p>
              ) : (
                incidents.map(incident => (
                  <div className="incident-item" key={incident.id}>
                    <div className={`incident-icon ${
                      incident.status === 'resolved'
                        ? 'resolved'
                        : 'investigating'
                    }`}>
                      {incident.status === 'resolved' ? 'âœ“' : '!'}
                    </div>

                    <div className="incident-details">
                      <strong>{incident.title}</strong>
                      <span>
                        {incident.service || 'Unknown service'} Â·{' '}
                        {incident.detectedAt
                          ? new Date(incident.detectedAt).toLocaleString()
                          : 'Date unavailable'}
                      </span>
                    </div>

                    <span className={`incident-status ${
                      incident.status === 'resolved'
                        ? 'resolved'
                        : 'investigating'
                    }`}>
                      {incident.status === 'resolved'
                        ? 'Resolved'
                        : incident.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>OpsPulse Â· Infrastructure Monitoring Platform</span>
            <span>Powered by Cloudflare</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App
