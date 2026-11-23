
/**
 * OpsPulse IP Address Security Validator
 *
 * Uses ipaddr.js to identify IPv4 and IPv6 addresses
 * that must not be used as public monitoring targets.
 */

import ipaddr from "ipaddr.js";

// Check IPv4 addresses
export function isBlockedIPv4(address) {
  try {
    const parsed = ipaddr.parse(address);

    // Reject anything that is not a valid IPv4 address
    if (parsed.kind() !== "ipv4") {
      return true;
    }

    // Only allow addresses classified as unicast
    return parsed.range() !== "unicast";

  } catch {
    // Invalid IP addresses are rejected
    return true;
  }
}

// Check IPv6 addresses
export function isBlockedIPv6(address) {
  try {
    const parsed = ipaddr.parse(address);

    // Reject anything that is not a valid IPv6 address
    if (parsed.kind() !== "ipv6") {
      return true;
    }

    // Reject IPv4-mapped IPv6 addresses
    // to avoid alternate IP representation bypasses
    if (parsed.isIPv4MappedAddress()) {
      return true;
    }

    // Only allow addresses classified as unicast
    return parsed.range() !== "unicast";

  } catch {
    return true;
  }
}

// Main IP address classification function
export function isBlockedIPAddress(address) {
  try {
    const parsed = ipaddr.parse(address);

    if (parsed.kind() === "ipv4") {
      return parsed.range() !== "unicast";
    }

    if (parsed.kind() === "ipv6") {
      if (parsed.isIPv4MappedAddress()) {
        return true;
      }

      return parsed.range() !== "unicast";
    }

    return true;

  } catch {
    return true;
  }
}
