import { fileURLToPath } from 'node:url';

import { defineProject } from 'vitest/config';

export default defineProject({
    resolve: {
        // The private specifier of package.json `imports` points at dist; tests run from the source
        alias: { '#token-store': fileURLToPath(new URL('./src/node/token-store.ts', import.meta.url)) },
    },
    test: {
        name: 'ilc-registry-sdk',
        environment: 'node',
        globals: true,
        include: ['src/**/*.{spec,test}.ts', 'test/**/*.ts'],
    },
});
