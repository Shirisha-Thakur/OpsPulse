
/**
 * OpsPulse URL Security Validator
 *
 * Validates monitoring URLs before HTTP requests.
 */

import ipaddr from "ipaddr.js";
import { isBlockedIPAddress } from "./ipValidator.js";
import { validateDns } from "./dnsValidator.js";

export async function validateMonitoringUrl(rawUrl) {

  // 1. Check that a URL was provided
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      allowed: false,
      error: "A valid monitoring URL is required"
    };
  }

  // 2. Parse the URL
  let target;

  try {
    target = new URL(rawUrl);
  } catch {
    return {
      allowed: false,
      error: "Invalid URL format"
    };
  }

  // 3. Allow HTTPS only
  if (target.protocol !== "https:") {
    return {
      allowed: false,
      error: "Only HTTPS URLs are allowed"
    };
  }

  // 4. Reject embedded credentials
  if (target.username || target.password) {
    return {
      allowed: false,
      error: "URLs containing credentials are not allowed"
    };
  }

  // 5. Allow only HTTPS port 443
  if (target.port && target.port !== "443") {
    return {
      allowed: false,
      error: "Only HTTPS port 443 is allowed"
    };
  }

  // 6. Normalize hostname
  const normalizedHostname = target.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");

  // 7. Reject restricted hostnames
  const blockedHostnames = [
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal"
  ];

  if (
    blockedHostnames.includes(normalizedHostname) ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local")
  ) {
    return {
      allowed: false,
      error: "Local and restricted hostnames are not allowed"
    };
  }

  // 8. Validate literal IP addresses
  if (ipaddr.isValid(normalizedHostname)) {
    if (isBlockedIPAddress(normalizedHostname)) {
      return {
        allowed: false,
        error: "Private or restricted IP addresses are not allowed"
      };
    }
  } else {

    // 9. Validate DNS records for hostnames
    const dnsResult = await validateDns(normalizedHostname);

    if (!dnsResult.allowed) {
      return {
        allowed: false,
        error: dnsResult.error
      };
    }
  }

  // 10. Return validated URL
  return {
    allowed: true,
    url: target.toString(),
    hostname: normalizedHostname
  };
}
