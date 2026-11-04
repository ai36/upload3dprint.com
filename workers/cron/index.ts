// T036: Cron Trigger worker (Pages Functions have no schedule). Logic lives in src/maintenance.ts.
import type { Env } from '../../functions/api/_lib.ts';
import { getSettings } from '../../functions/api/catalog.ts';
import { integrations } from '../../functions/_integrations/index.ts';
import { runMaintenance } from '../../src/maintenance.ts';

export default {
  async scheduled(_event: unknown, env: Env) {
    const { storage, email } = integrations(env);
    const result = await runMaintenance({
      db: env.DB,
      settings: await getSettings(env.DB),
      deleteFile: (key) => storage.delete(key),
      sendEmail: (to, template, data) => email.send(to, template, data),
      now: new Date(),
    });
    console.log('[cron] maintenance', JSON.stringify(result));
  },
};
