import type http from 'node:http';

import { cookieName } from './browser';
import plugin from './server';

describe('Server transition hooks suite', () => {
    const log = {
        info: vi.fn(),
        fatal: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
    };

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should continue if a route is not protected', async () => {
        const route = {
            meta: {
                protected: false,
            },
            url: '/some/url',
            hostname: 'example.com',
            route: '/some/*',
        };

        const req = {
            headers: {},
        } as http.IncomingMessage;

        const results = await Promise.all(plugin.getTransitionHooks().map((hook) => hook({ route, req, log })));

        for (const result of results) {
            expect(result).toEqual({ type: 'continue' });
        }

        expect(log.info).toHaveBeenCalledWith(route.meta, expect.any(String));
    });

    it('should continue if req has a special cookie', async () => {
        const route = {
            meta: {
                protected: true,
            },
            url: '/some/url',
            hostname: 'example.com',
            route: '/some/*',
        };

        const req = {
            headers: {
                cookie: `${cookieName}=skip; path=/;`,
            },
        } as http.IncomingMessage;

        const results = await Promise.all(plugin.getTransitionHooks().map((hook) => hook({ route, req, log })));

        for (const result of results) {
            expect(result).toEqual({ type: 'continue' });
        }

        expect(log.info).toHaveBeenCalledWith(route.meta, expect.any(String));
    });

    it('should redirect if req does not have a special cookie', async () => {
        const route = {
            meta: {
                protected: true,
            },
            url: '/some/url',
            hostname: 'example.com',
            route: '/some/*',
        };

        const req = {
            headers: {
                cookie: `some-cookie=skip; path=/;`,
            },
        } as http.IncomingMessage;

        const results = await Promise.all(plugin.getTransitionHooks().map((hook) => hook({ route, req, log })));

        expect(results).toEqual([{ type: 'redirect', newLocation: '/' }]);
        expect(log.info).toHaveBeenCalledWith(route.meta, expect.any(String));
    });

    it('should redirect if req does not have any cookies', async () => {
        const route = {
            meta: {
                protected: true,
            },
            url: '/some/url',
            hostname: 'example.com',
            route: '/some/*',
        };

        const req = {
            headers: {},
        } as http.IncomingMessage;

        const results = await Promise.all(plugin.getTransitionHooks().map((hook) => hook({ route, req, log })));

        expect(results).toEqual([{ type: 'redirect', newLocation: '/' }]);
        expect(log.info).toHaveBeenCalledWith(route.meta, expect.any(String));
    });
});
