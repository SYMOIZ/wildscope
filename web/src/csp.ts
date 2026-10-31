// Content-Security-Policy shared by `vite preview` and the CloudFront response headers policy
// (infra/wildscope.yaml copies this string; scripts/check-csp.mjs fails the build if they differ).
export const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https://maps.geo.us-east-1.amazonaws.com; " +
  "connect-src 'self' https://maps.geo.us-east-1.amazonaws.com; worker-src 'self' blob:; " +
  "font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
