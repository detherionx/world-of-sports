// Verifies the Cloudflare Access JWT on every request, so the Worker stays private even if the
// Access application is misconfigured or the Worker is reached through another route.
let certs = null;
const b64url = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const decode = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function keyFor(issuer, kid, refresh) {
  if (!certs || refresh) certs = await (await fetch(issuer + '/cdn-cgi/access/certs')).json();
  return certs.keys.find((k) => k.kid === kid);
}

export async function verifyAccess(request, env) {
  try {
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token) return false;
    const [h, p, sig] = token.split('.');
    const header = decode(h),
      payload = decode(p),
      issuer = 'https://' + env.ACCESS_TEAM_DOMAIN;
    if (payload.iss !== issuer || ![payload.aud].flat().includes(env.ACCESS_AUD)) return false;
    if (!(payload.exp * 1000 > Date.now())) return false;
    const jwk = (await keyFor(issuer, header.kid)) || (await keyFor(issuer, header.kid, true));
    if (!jwk) return false;
    const alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('jwk', jwk, alg, false, ['verify']);
    return await crypto.subtle.verify(alg, key, b64url(sig), new TextEncoder().encode(h + '.' + p));
  } catch {
    return false;
  }
}
