// Content-Security-Policy shared by `vite preview` and the CloudFront response headers policy
// (infra/wildscope.yaml copies this string; scripts/check_csp.py fails `make lint` if they differ).
// 'unsafe-eval' is required by Knockout, which CesiumJS bundles for its widgets and which calls
// (0,eval)("this") at load. Scripts are still limited to this origin.
export const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https://maps.geo.us-east-1.amazonaws.com; " +
  "connect-src 'self' https://maps.geo.us-east-1.amazonaws.com; worker-src 'self' blob:; " +
  "font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
