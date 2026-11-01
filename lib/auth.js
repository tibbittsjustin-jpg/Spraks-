/* Verify a Supabase access token. The browser sends Authorization: Bearer.
   This process calls auth.getUser(token) and keeps only the user id.
   No email, phone, or session is stored. */
"use strict";

function bearerToken(req) {
  const header = req && req.headers ? req.headers.authorization : "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(String(header || "").trim());
  return match ? match[1] : "";
}

function createSupabaseAuth(options) {
  options = options || {};
  const fetchImpl = options.fetch || global.fetch;
  const url = options.url != null ? options.url : (process.env.SUPABASE_URL || "");
  const key = options.key != null ? options.key : (process.env.SUPABASE_ANON_KEY || "");
  return {
    auth: {
      async getUser(token) {
        if (!url || !key || !token) {
          return { data: { user: null }, error: { message: "not_configured" } };
        }
        const base = String(url).replace(/\/+$/, "");
        let resp;
        try {
          resp = await fetchImpl(base + "/auth/v1/user", {
            headers: {
              apikey: key,
              Authorization: "Bearer " + token
            }
          });
        } catch (err) {
          return { data: { user: null }, error: { message: "unauthorized" } };
        }
        if (!resp || !resp.ok) {
          return { data: { user: null }, error: { message: "unauthorized" } };
        }
        let user = null;
        try {
          user = await resp.json();
        } catch (err) {
          user = null;
        }
        if (!user || !user.id) {
          return { data: { user: null }, error: { message: "unauthorized" } };
        }
        return { data: { user: user }, error: null };
      }
    }
  };
}

async function userFromToken(token, auth) {
  if (!token) return null;
  try {
    const client = auth || createSupabaseAuth();
    if (!client || !client.auth || typeof client.auth.getUser !== "function") return null;
    const result = await client.auth.getUser(token);
    const user = result && result.data && result.data.user;
    if (!user || !user.id) return null;
    return { id: String(user.id) };
  } catch (err) {
    return null;
  }
}

module.exports = { bearerToken, createSupabaseAuth, userFromToken };
