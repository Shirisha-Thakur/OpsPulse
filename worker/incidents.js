export async function processIncident(
  env,
  service,
  organizationId,
  targetIsAllowed,
  checkStatus
) {
  try {
    const activeIncident = await env.DB.prepare(`
      SELECT id
      FROM incidents
      WHERE service_id = ?
        AND organization_id = ?
        AND status != 'resolved'
      ORDER BY detected_at DESC
      LIMIT 1
    `).bind(service.id, organizationId).first();

    if (targetIsAllowed && checkStatus === "failure" && !activeIncident) {
      await env.DB.prepare(`
        INSERT INTO incidents (
          organization_id, service_id, title, severity, status
        )
        VALUES (?, ?, ?, 'high', 'investigating')
      `).bind(
        organizationId,
        service.id,
        `Service unavailable: ${service.name}`
      ).run();

      console.log(`Incident created for service: ${service.name}`);
    }

    if (checkStatus === "success" && activeIncident) {
      await env.DB.prepare(`
        UPDATE incidents
        SET status = 'resolved',
            resolved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND organization_id = ?
      `).bind(activeIncident.id, organizationId).run();

      console.log(`Incident resolved for service: ${service.name}`);
    }
  } catch (incidentError) {
    console.error(
      `Automatic incident processing failed for ${service.name}:`,
      incidentError
    );
  }
}