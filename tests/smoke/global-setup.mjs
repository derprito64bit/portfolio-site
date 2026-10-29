// Serves the built dist/ (scripts/serve-dist.mjs: gzip, Pages rules) on a free port for the whole run, so parallel
// agents on the shared host never collide on a fixed port. The specs read the address from SMOKE_BASE.
import { serve } from '../harness/lib.mjs';

export default async function globalSetup() {
  const srv = await serve();
  process.env.SMOKE_BASE = srv.base;
  return async () => {
    await srv.close();
  };
}
