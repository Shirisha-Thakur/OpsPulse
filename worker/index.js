
import { validateMonitoringUrl } from "./security/validateUrl.js";
import {
  registerUser,
  loginUser,
  logoutUser,
  getAuthenticatedUser,
  sessionCookie
} from "./security/auth.js";
import { processIncident } from "./incidents.js";

async function runHealthCheck(env, service, organizationId) {


  let checkStatus = "failure";
  let responseTime = null;
  let httpStatus = null;
  let errorMessage = null;
  let targetIsAllowed = false;

  try {
    // 1. Validate URL and DNS records
    try {
      const validation = await validateMonitoringUrl(service.url);

      if (!validation.allowed) {
        throw new Error(validation.error);
      }

      const target = new URL(validation.url);

      targetIsAllowed = true;

      // 2. Send HTTP request and measure response time
      const startTime = Date.now();

      try {
        const response = await fetch(target.toString(), {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(10000)
        });

        responseTime = Date.now() - startTime;
        httpStatus = response.status;
        checkStatus = response.ok ? "success" : "failure";

        if (!response.ok) {
          errorMessage = `HTTP ${response.status}`;
        }

        if (response.body) {
          await response.body.cancel();
        }

      } catch (error) {
        responseTime = Date.now() - startTime;
        errorMessage = error.message;
      }

    } catch (validationError) {
      // Record rejected URLs instead of skipping them
      errorMessage = validationError.message;

      console.warn(
        `Monitoring target rejected for ${service.name}:`,
        errorMessage
      );
    }

    // 3. Save every check result in D1
    await env.DB.prepare(`
      INSERT INTO monitoring_checks (
        organization_id,
        service_id,
        status,
        response_time_ms,
        http_status,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      organizationId,
      service.id,
      checkStatus,
      responseTime,
      httpStatus,
      errorMessage
    ).run();

    // 4. Update service status
    const serviceStatus = !targetIsAllowed
      ? "unknown"
      : checkStatus === "success"
        ? "operational"
        : "down";

    await env.DB.prepare(`
      UPDATE services
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND organization_id = ?
    `).bind(
      serviceStatus,
      service.id,
      organizationId
    ).run();

      // 5. Automatic incident detection and resolution
    await processIncident(
      env,
      service,
      organizationId,
      targetIsAllowed,
      checkStatus
    );
    // 6. Return monitoring result
    return {
      service: service.name,
      status: serviceStatus,
      check: checkStatus,
      responseTime,
      httpStatus,
      error: errorMessage
    };

  } catch (error) {
    console.error(
      `Health check processing failed for ${service.name}:`,
      error
    );

    return {
      service: service.name,
      status: "unknown",
      check: "failure",
      responseTime,
      httpStatus,
      error: error.message
    };
  }
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // AUTHENTICATION: Protect private API endpoints
    let authenticatedUser = null;

    const publicEndpoints = [
      "/api/health",
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/me"
    ];

    if (
      url.pathname.startsWith("/api/") &&
      !publicEndpoints.includes(url.pathname)
    ) {
      try {
        authenticatedUser = await getAuthenticatedUser(request, env);

        if (!authenticatedUser) {
          return Response.json(
            { error: "Authentication required" },
            { status: 401 }
          );
        }
      } catch (error) {
        console.error("Authentication error:", error);

        return Response.json(
          { error: "Unable to authenticate request" },
          { status: 500 }
        );
      }
    }


// AUTH 1: Register
if (url.pathname === "/api/auth/register" && request.method === "POST") {
  try {
    const data = await request.json();

    const result = await registerUser(env, data);

    return Response.json(
      {
        message: "Account created successfully",
        user: result.user
      },
      {
        status: 201,
        headers: {
          "Set-Cookie": sessionCookie(result.token, request)
        }
      }
    );
  } catch (error) {
    const duplicate = error.message?.includes("already exists");

    return Response.json(
      { error: error.message || "Registration failed" },
      { status: duplicate ? 409 : 400 }
    );
  }
}

// AUTH 2: Login
if (url.pathname === "/api/auth/login" && request.method === "POST") {
  try {
    const data = await request.json();

    const result = await loginUser(
      env,
      data.email,
      data.password
    );

    return Response.json(
      {
        message: "Login successful",
        user: result.user
      },
      {
        headers: {
          "Set-Cookie": sessionCookie(result.token, request)
        }
      }
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "Login failed" },
      { status: 401 }
    );
  }
}

// AUTH 3: Current authenticated user
if (url.pathname === "/api/auth/me" && request.method === "GET") {
  try {
    const user = await getAuthenticatedUser(request, env);

    if (!user) {
      return Response.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return Response.json({
      authenticated: true,
      user
    });
  } catch (error) {
    console.error("Session validation failed:", error);

    return Response.json(
      { error: "Unable to validate session" },
      { status: 500 }
    );
  }
}

// AUTH 4: Logout
if (url.pathname === "/api/auth/logout" && request.method === "POST") {
  try {
    await logoutUser(request, env);

    return Response.json(
      { message: "Logged out successfully" },
      {
        headers: {
          "Set-Cookie": sessionCookie("", request, true)
        }
      }
    );
  } catch (error) {
    console.error("Logout failed:", error);

    return Response.json(
      { error: "Logout failed" },
      { status: 500 }
    );
  }
}

    // API: Test D1 database connection
    if (url.pathname === "/api/db-check") {
      try {
        const result = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        ).all();

        return Response.json({
          database: "connected",
          tables: result.results.map((table) => table.name)
        });

      } catch (error) {
        return Response.json(
          {
            database: "error",
            message: error.message
          },
          { status: 500 }
        );
      }
    }
    // API 1: Backend health check
    if (url.pathname === "/api/health") {
      return Response.json({
        application: "OpsPulse",
        status: "healthy",
        environment: "production",
        message: "OpsPulse backend is running successfully",
        timestamp: new Date().toISOString()
      });
    }


// API: Create a monitored service
if (url.pathname === "/api/services" && request.method === "POST") {
  try {
    const data = await request.json();

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const rawUrl = typeof data.url === "string" ? data.url.trim() : "";

    if (!name || name.length > 100) {
      return Response.json(
        { error: "Service name is required and must be 100 characters or fewer" },
        { status: 400 }
      );
    }

    if (!rawUrl || rawUrl.length > 2048) {
      return Response.json(
        { error: "A valid service URL is required" },
        { status: 400 }
      );
    }

    // Validate URL and DNS to prevent unsafe monitoring targets
    const validation = await validateMonitoringUrl(rawUrl);

    if (!validation.allowed) {
      return Response.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Always use the authenticated user's organization
    const result = await env.DB.prepare(`
      INSERT INTO services (organization_id, name, url)
      VALUES (?, ?, ?)
    `).bind(
      authenticatedUser.organization_id,
      name,
      validation.url
    ).run();

    const service = await env.DB.prepare(`
      SELECT id, name, url, status, created_at
      FROM services
      WHERE id = ? AND organization_id = ?
    `).bind(
      result.meta.last_row_id,
      authenticatedUser.organization_id
    ).first();

    return Response.json(
      {
        message: "Service created successfully",
        service
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("Service creation failed:", error);

    return Response.json(
      { error: "Unable to create service" },
      { status: 500 }
    );
  }
}

// API: List monitored services from D1
if (url.pathname === "/api/services") {
  try {
    const result = await env.DB.prepare(`
      SELECT
        s.id,
        s.name,
        s.url,
        s.status,
        CASE
          WHEN COUNT(mc.id) = 0 THEN NULL
          ELSE ROUND(
            100.0 * SUM(
              CASE WHEN mc.status = 'success' THEN 1 ELSE 0 END
            ) / COUNT(mc.id), 2
          )
        END AS uptime,
        ROUND(AVG(mc.response_time_ms)) AS responseTime
      FROM services s
      LEFT JOIN monitoring_checks mc
        ON mc.service_id = s.id
        AND mc.organization_id = s.organization_id
      WHERE s.organization_id = ?
      GROUP BY s.id
      ORDER BY s.id
      `).bind(authenticatedUser.organization_id).all();


    return Response.json({
      total: result.results.length,
      services: result.results
    });

  } catch (error) {
    return Response.json(
      {
        error: "Unable to retrieve services",
        message: error.message
      },
      { status: 500 }
    );
  }
}


// API: Run a manual health check
if (url.pathname === "/api/monitor") {
  try {
    // 1. Read and validate service ID
    const serviceId = Number(url.searchParams.get("id"));

    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return Response.json(
        { error: "A valid service ID is required" },
        { status: 400 }
      );
    }

    // 2. Retrieve service from D1
    const service = await env.DB.prepare(
      `SELECT id, name, url
       FROM services
       WHERE id = ? AND organization_id = ?`
    ).bind(
       serviceId,
        authenticatedUser.organization_id
        ).first();


    if (!service) {
      return Response.json(
        { error: "Service not found" },
        { status: 404 }
      );
    }

    // 3. Reuse the common health-check function
    const result = await runHealthCheck(
          env,
          service,
          authenticatedUser.organization_id
         );



    // 6. Return monitoring result
    return Response.json({
      url: service.url,
      ...result
    });

  } catch (error) {
    console.error("Manual monitoring failed:", error);

    return Response.json(
      {
        error: "Manual monitoring failed",
        message: error.message
      },
      { status: 500 }
    );
  }
}






    // API: Retrieve monitoring history
    if (url.pathname === "/api/monitoring-history") {
      try {
        const serviceId = Number(url.searchParams.get("id"));
        const organizationId = authenticatedUser.organization_id;

        if (!Number.isInteger(serviceId) || serviceId <= 0) {
          return Response.json(
            { error: "A valid service ID is required" },
            { status: 400 }
          );
        }

        const service = await env.DB.prepare(`
          SELECT id, name
          FROM services
          WHERE id = ? AND organization_id = ?
        `).bind(serviceId, organizationId).first();

        if (!service) {
          return Response.json(
            { error: "Service not found" },
            { status: 404 }
          );
        }

        const result = await env.DB.prepare(`
          SELECT
            id,
            status,
            response_time_ms,
            http_status,
            error_message,
            checked_at
          FROM monitoring_checks
          WHERE service_id = ?
            AND organization_id = ?
          ORDER BY checked_at DESC, id DESC
          LIMIT 20
        `).bind(serviceId, organizationId).all();

        return Response.json({
          service: service.name,
          total: result.results.length,
          history: result.results
        });

      } catch (error) {
        console.error("Monitoring history error:", error);

        return Response.json(
          {
            error: "Unable to retrieve monitoring history",
            message: error.message
          },
          { status: 500 }
        );
      }
    }

    // API: List incidents for authenticated organization
    if (url.pathname === "/api/incidents") {
      try {
        const result = await env.DB.prepare(`
          SELECT
            i.id,
            i.title,
            s.name AS service,
            i.severity,
            i.status,
            i.detected_at AS detectedAt,
            i.resolved_at AS resolvedAt
          FROM incidents i
          LEFT JOIN services s
            ON s.id = i.service_id
            AND s.organization_id = i.organization_id
          WHERE i.organization_id = ?
          ORDER BY i.detected_at DESC
        `).bind(authenticatedUser.organization_id).all();

        return Response.json({
          total: result.results.length,
          incidents: result.results
        });

      } catch (error) {
        console.error("Incident retrieval failed:", error);

        return Response.json(
          { error: "Unable to retrieve incidents" },
          { status: 500 }
        );
      }
    }

    // Unknown API endpoint
    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "API endpoint not found" },
        { status: 404 }
      );
    }

    return new Response(null, { status: 404 });
  },

  // Scheduled monitoring using Cloudflare Cron Triggers
  async scheduled(controller, env, ctx) {
    console.log("OpsPulse scheduled monitoring started");

    try {
      const result = await env.DB.prepare(`
        SELECT id, name, url, organization_id
        FROM services
        ORDER BY organization_id, id
      `).all();

      const services = result.results;

      console.log(`Found ${services.length} services to monitor`);

      for (const service of services) {
        console.log(
          "Starting health check:",
          service.id,
          service.name
        );

        const checkResult = await runHealthCheck(
          env,
          service,
          service.organization_id
        );

        console.log("Completed health check:", checkResult);
      }

      console.log("OpsPulse scheduled monitoring completed");

    } catch (error) {
      console.error("Scheduled monitoring failed:", error);
    }
  }
};
