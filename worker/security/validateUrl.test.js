
import { validateMonitoringUrl } from "./validateUrl.js";

const testCases = [
  {
    name: "Valid HTTPS website",
    url: "https://example.com",
    expected: true
  },
  {
    name: "HTTP website",
    url: "http://example.com",
    expected: false
  },
  {
    name: "Localhost",
    url: "https://localhost",
    expected: false
  },
  {
    name: "Private IP address",
    url: "https://192.168.1.10",
    expected: false
  },
  {
    name: "Cloud metadata hostname",
    url: "https://metadata.google.internal",
    expected: false
  },
  {
    name: "URL containing credentials",
    url: "https://admin:password@example.com",
    expected: false
  },
  {
    name: "Invalid URL",
    url: "not-a-valid-url",
    expected: false
  },
  {
    name: "Non-standard port",
    url: "https://example.com:8443",
    expected: false
  }
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  console.log("\nOpsPulse URL Security Tests\n");

  for (const test of testCases) {
    const result = await validateMonitoringUrl(test.url);
    const success = result.allowed === test.expected;

    if (success) {
      passed++;
      console.log(`PASS: ${test.name}`);
    } else {
      failed++;
      console.error(`FAIL: ${test.name}`, result);
    }
  }

  console.log("\nTest Summary");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    throw new Error("Some URL security tests failed");
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
