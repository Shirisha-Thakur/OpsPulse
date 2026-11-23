
import assert from "node:assert/strict";
import { validateDns } from "./dnsValidator.js";

async function runTests() {
  // Test 1: A public hostname should pass DNS validation.
  const publicResult = await validateDns("example.com");

  assert.equal(
    publicResult.allowed,
    true,
    "A public hostname should be allowed"
  );

  console.log("PASS: Public hostname validation");

  // Test 2: localhost must not be allowed.
  const localhostResult = await validateDns("localhost");

  assert.equal(
    localhostResult.allowed,
    false,
    "localhost must not be allowed"
  );

  console.log("PASS: localhost rejection");

  // Test 3: A private IPv4 address must be rejected.
  const privateResult = await validateDns("192.168.1.10");

  assert.equal(
    privateResult.allowed,
    false,
    "Private IPv4 addresses must be rejected"
  );

  console.log("PASS: Private IPv4 rejection");

  // Test 4: A public IPv4 address should pass.
  const publicIpResult = await validateDns("1.1.1.1");

  assert.equal(
    publicIpResult.allowed,
    true,
    "A public IPv4 address should be allowed"
  );

  console.log("PASS: Public IPv4 validation");

  console.log("\nAll DNS validator tests passed.");
}

runTests().catch((error) => {
  console.error("DNS validator tests failed:", error);
  process.exitCode = 1;
});
