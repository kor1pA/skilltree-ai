import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SkillTreeRepository } from './repositories/SkillTreeRepository.ts';
import { createApp } from './createApp.ts';

const repo = new SkillTreeRepository();
const coreApp = createApp(repo);

const app = new Hono();
app.use('*', async (_c, next) => {
  await repo.init();
  await next();
});
app.route('/', coreApp);

export default app;

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 3000);
  repo
    .init()
    .then(() => {
      const server = serve(
        {
          fetch: app.fetch,
          port,
        },
        (info) => {
          console.log(
            `SkillTree AI running at http://localhost:${info.port} (DB: ${repo.db.driverName})`
          );
        }
      );

      const shutdown = async () => {
        server.close(async () => {
          await repo.close();
          process.exit(0);
        });
      };

      process.on('SIGTERM', () => void shutdown());
      process.on('SIGINT', () => void shutdown());
    })
    .catch((err) => {
      console.error('Failed to start SkillTree AI server:', err);
      process.exit(1);
    });
}
