--
-- ==========================================
-- OpsPulse: Initial Database Schema
-- ==========================================

-- 1. Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE CASCADE
);

-- Index for faster organization-based user lookup
CREATE INDEX IF NOT EXISTS idx_users_organization_id
ON users(organization_id);



-- ==========================================
-- 3. Monitored Services table
-- ==========================================

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (status IN ('operational', 'degraded', 'down', 'unknown')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_services_organization_id
ON services(organization_id);


-- ==========================================
-- 4. Incidents table
-- ==========================================

CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'investigating'
        CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    FOREIGN KEY (service_id)
        REFERENCES services(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_incidents_organization_id
ON incidents(organization_id);

CREATE INDEX IF NOT EXISTS idx_incidents_service_id
ON incidents(service_id);


-- ==========================================
-- 5. Monitoring Checks table
-- ==========================================

CREATE TABLE IF NOT EXISTS monitoring_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,

    status TEXT NOT NULL
        CHECK (status IN ('success', 'failure')),

    response_time_ms INTEGER
        CHECK (response_time_ms IS NULL OR response_time_ms >= 0),

    http_status INTEGER,
    error_message TEXT,

    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    FOREIGN KEY (service_id)
        REFERENCES services(id)
        ON DELETE CASCADE
);

-- Speed up monitoring history queries
CREATE INDEX IF NOT EXISTS idx_checks_service_time
ON monitoring_checks(service_id, checked_at);

CREATE INDEX IF NOT EXISTS idx_checks_organization_id
ON monitoring_checks(organization_id);
