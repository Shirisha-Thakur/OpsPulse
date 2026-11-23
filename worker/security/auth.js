
const SESSION_COOKIE = "opspulse_session";
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 100000;

const encoder = new TextEncoder();

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function toHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function hashToken(token) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(token)
  );

  return toHex(new Uint8Array(hash));
}

// Password hashing using PBKDF2-SHA256
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );

  return [
    "pbkdf2_sha256",
    PBKDF2_ITERATIONS,
    toBase64(salt),
    toBase64(new Uint8Array(derived))
  ].join("$");
}

// Verify a supplied password
export async function verifyPassword(password, storedHash) {
  try {
    const [algorithm, iterationsText, saltText, hashText] =
      storedHash.split("$");

    const iterations = Number(iterationsText);

    if (
      algorithm !== "pbkdf2_sha256" ||
      !Number.isInteger(iterations) ||
      iterations < 100000 ||
      iterations > 100000
    ) {
      return false;
    }

    const salt = fromBase64(saltText);
    const expected = fromBase64(hashText);

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derived = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256"
        },
        key,
        256
      )
    );

    if (derived.length !== expected.length) return false;

    let difference = 0;

    for (let i = 0; i < derived.length; i++) {
      difference |= derived[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

// Create a database session and return the raw token once
async function createSession(env, user) {
  const token = randomToken();
  const tokenHash = await hashToken(token);

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_SECONDS * 1000
  ).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions (
      id,
      user_id,
      organization_id,
      expires_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    tokenHash,
    user.id,
    user.organization_id,
    expiresAt
  ).run();

  return token;
}

// Set the browser's HTTP-only session cookie
export function sessionCookie(token, request, clear = false) {
  const secure = new URL(request.url).protocol === "https:";

  const parts = [
    `${SESSION_COOKIE}=${clear ? "" : token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${clear ? 0 : SESSION_DURATION_SECONDS}`
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
}

// Register a new user and organization
export async function registerUser(env, data) {
  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const password = data.password;
  const organizationName =
    String(data.organizationName || `${name}'s Workspace`).trim();

  if (name.length < 2 || name.length > 100) {
    throw new Error("Name must contain 2 to 100 characters");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("A valid email address is required");
  }

  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  ) {
    throw new Error("Password must contain 12 to 128 characters");
  }

  if (
    organizationName.length < 2 ||
    organizationName.length > 100
  ) {
    throw new Error("Organization name must contain 2 to 100 characters");
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE email = ? COLLATE NOCASE"
  ).bind(email).first();

  if (existing) {
    throw new Error("An account with this email already exists");
  }

  const passwordHash = await hashPassword(password);

  const baseSlug = organizationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 35) || "workspace";

  const suffix = toHex(
    crypto.getRandomValues(new Uint8Array(4))
  );

  const slug = `${baseSlug}-${suffix}`;

  const organizationResult = await env.DB.prepare(`
    INSERT INTO organizations (name, slug, plan)
    VALUES (?, ?, 'free')
  `).bind(organizationName, slug).run();

  const organizationId = organizationResult.meta.last_row_id;

  if (!organizationId) {
    throw new Error("Unable to create organization");
  }

  let userId;

  try {
    const userResult = await env.DB.prepare(`
      INSERT INTO users (
        organization_id,
        name,
        email,
        password_hash,
        role
      )
      VALUES (?, ?, ?, ?, 'owner')
    `).bind(
      organizationId,
      name,
      email,
      passwordHash
    ).run();

    userId = userResult.meta.last_row_id;

    if (!userId) {
      throw new Error("Unable to create user account");
    }

  } catch (error) {
    await env.DB.prepare(
      "DELETE FROM organizations WHERE id = ?"
    ).bind(organizationId).run();

    if (error.message?.includes("UNIQUE")) {
      throw new Error("An account with this email already exists");
    }

    throw error;
  }

  const user = {
    id: userId,
    organization_id: organizationId,
    name,
    email,
    role: "owner",
    organization_name: organizationName
  };

  const token = await createSession(env, user);

  return { user, token };
}

// Login an existing user
export async function loginUser(env, email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    typeof password !== "string"
  ) {
    throw new Error("Invalid email or password");
  }

  const user = await env.DB.prepare(`
    SELECT
      u.id,
      u.organization_id,
      u.name,
      u.email,
      u.password_hash,
      u.role,
      o.name AS organization_name
    FROM users u
    JOIN organizations o
      ON o.id = u.organization_id
    WHERE u.email = ? COLLATE NOCASE
  `).bind(normalizedEmail).first();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new Error("Invalid email or password");
  }

  const token = await createSession(env, user);

  delete user.password_hash;

  return { user, token };
}

// Read the current authenticated user from the session cookie
export async function getAuthenticatedUser(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const cookie = cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${SESSION_COOKIE}=`));

  if (!cookie) return null;

  const token = cookie.substring(SESSION_COOKIE.length + 1);

  if (!token || token.length > 200) return null;

  const tokenHash = await hashToken(token);

  return await env.DB.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.organization_id,
      o.name AS organization_name
    FROM sessions s
    JOIN users u
      ON u.id = s.user_id
    JOIN organizations o
      ON o.id = s.organization_id
    WHERE s.id = ?
      AND s.revoked_at IS NULL
      AND julianday(s.expires_at) > julianday('now')
      AND u.organization_id = s.organization_id
  `).bind(tokenHash).first();
}

// Revoke the current session
export async function logoutUser(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const cookie = cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${SESSION_COOKIE}=`));

  if (!cookie) return;

  const token = cookie.substring(SESSION_COOKIE.length + 1);

  if (!token || token.length > 200) return;

  const tokenHash = await hashToken(token);

  await env.DB.prepare(`
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND revoked_at IS NULL
  `).bind(tokenHash).run();
}
