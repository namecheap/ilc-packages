import { defineProject } from 'vitest/config';

export default defineProject({
    test: {
        name: 'ilc-plugins-sdk',
        environment: 'node',
        globals: true,
        include: ['src/**/*.spec.ts'],
    },
});
