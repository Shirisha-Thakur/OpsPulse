
/**
 * OpsPulse DNS Security Validator
 *
 * Resolves a hostname and checks whether its IP addresses
 * are public and allowed for monitoring.
 */

import { resolve4, resolve6 } from "node:dns/promises";
import { isBlockedIPAddress } from "./ipValidator.js";

export async function validateDns(hostname) {
  if (!hostname || typeof hostname !== "string") {
    return {
      allowed: false,
      error: "A valid hostname is required"
    };
  }

  const normalizedHostname = hostname
    .toLowerCase()
    .replace(/\.$/, "");

  // Literal IP addresses do not require DNS resolution.
  if (normalizedHostname.includes(":") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(normalizedHostname)) {
    if (isBlockedIPAddress(normalizedHostname)) {
      return {
        allowed: false,
        error: "Private or restricted IP addresses are not allowed"
      };
    }

    return {
      allowed: true,
      addresses: [normalizedHostname]
    };
  }

  let addresses = [];

  try {
    const ipv4 = await resolve4(normalizedHostname).catch(() => []);
    const ipv6 = await resolve6(normalizedHostname).catch(() => []);

    addresses = [...ipv4, ...ipv6];
  } catch {
    return {
      allowed: false,
      error: "DNS resolution failed"
    };
  }

  if (addresses.length === 0) {
    return {
      allowed: false,
      error: "Hostname did not resolve to an IP address"
    };
  }

  const blockedAddress = addresses.find(isBlockedIPAddress);

  if (blockedAddress) {
    return {
      allowed: false,
      error: "Hostname resolves to a private or restricted IP address"
    };
  }

  return {
    allowed: true,
    addresses
  };
}
