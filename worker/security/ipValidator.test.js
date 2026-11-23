
import {
  isBlockedIPv4,
  isBlockedIPv6,
  isBlockedIPAddress
} from "./ipValidator.js";

const testCases = [
  // Original IPv4 tests
  {
    name: "Private IPv4 - 10.x.x.x",
    test: () => isBlockedIPv4("10.0.0.1"),
    expected: true
  },
  {
    name: "Private IPv4 - 192.168.x.x",
    test: () => isBlockedIPv4("192.168.1.10"),
    expected: true
  },
  {
    name: "Private IPv4 - 172.16.x.x",
    test: () => isBlockedIPv4("172.16.0.1"),
    expected: true
  },
  {
    name: "Loopback IPv4",
    test: () => isBlockedIPv4("127.0.0.1"),
    expected: true
  },
  {
    name: "Link-local IPv4",
    test: () => isBlockedIPv4("169.254.1.1"),
    expected: true
  },
  {
    name: "Public IPv4",
    test: () => isBlockedIPv4("8.8.8.8"),
    expected: false
  },
  {
    name: "Invalid IPv4",
    test: () => isBlockedIPv4("999.999.999.999"),
    expected: true
  },

  // Original IPv6 tests
  {
    name: "IPv6 loopback",
    test: () => isBlockedIPv6("::1"),
    expected: true
  },
  {
    name: "IPv6 unspecified",
    test: () => isBlockedIPv6("::"),
    expected: true
  },
  {
    name: "IPv6 unique local",
    test: () => isBlockedIPv6("fc00::1"),
    expected: true
  },
  {
    name: "IPv6 link-local",
    test: () => isBlockedIPv6("fe80::1"),
    expected: true
  },
  {
    name: "Public IPv6",
    test: () => isBlockedIPv6("2001:4860:4860::8888"),
    expected: false
  },

  // Combined tests
  {
    name: "Combined IPv4 private check",
    test: () => isBlockedIPAddress("192.168.0.5"),
    expected: true
  },
  {
    name: "Combined IPv6 loopback check",
    test: () => isBlockedIPAddress("::1"),
    expected: true
  },

  // Additional IPv4 security tests
  {
    name: "Carrier-grade NAT address",
    test: () => isBlockedIPv4("100.64.0.1"),
    expected: true
  },
  {
    name: "IPv4 documentation range",
    test: () => isBlockedIPv4("198.51.100.10"),
    expected: true
  },
  {
    name: "IPv4 multicast",
    test: () => isBlockedIPv4("224.0.0.1"),
    expected: true
  },
  {
    name: "Public IPv4 - Cloudflare DNS",
    test: () => isBlockedIPv4("1.1.1.1"),
    expected: false
  },

  // Additional IPv6 security tests
  {
    name: "IPv6 multicast",
    test: () => isBlockedIPv6("ff02::1"),
    expected: true
  },
  {
    name: "IPv6 documentation range",
    test: () => isBlockedIPv6("2001:db8::1"),
    expected: true
  },
  {
    name: "IPv4-mapped IPv6 private address",
    test: () => isBlockedIPv6("::ffff:192.168.1.10"),
    expected: true
  },
  {
    name: "IPv4-mapped IPv6 public address",
    test: () => isBlockedIPv6("::ffff:8.8.8.8"),
    expected: true
  },
  {
    name: "Invalid IPv6 address",
    test: () => isBlockedIPv6("not-an-ip"),
    expected: true
  }
];

let passed = 0;
let failed = 0;

console.log("\nOpsPulse IP Security Tests\n");

for (const test of testCases) {
  const actual = test.test();
  const success = actual === test.expected;

  if (success) {
    passed++;
    console.log(`PASS: ${test.name}`);
  } else {
    failed++;
    console.error(
      `FAIL: ${test.name} | Expected: ${test.expected}, Actual: ${actual}`
    );
  }
}

console.log("\nTest Summary");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  throw new Error("Some IP security tests failed");
}
