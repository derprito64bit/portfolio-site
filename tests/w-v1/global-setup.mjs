// Serves the built dist/ (or W_V1_DIST, a planted build for tests/w-v1/negative.mjs) on a free port for the whole run;
// the specs read the address from SMOKE_BASE.
import { serve } from '../harness/lib.mjs';

export default async function globalSetup() {
  const srv = await serve(process.env.W_V1_DIST || undefined);
  process.env.SMOKE_BASE = srv.base;
  return async () => {
    await srv.close();
  };
}
