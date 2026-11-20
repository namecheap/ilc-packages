import { defineProject } from 'vitest/config';

export default defineProject({
    test: {
        name: 'ilc-adapter-react',
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.spec.{ts,tsx}'],
        setupFiles: ['./vitest.setup.ts'],
    },
});
