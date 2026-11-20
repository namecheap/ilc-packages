import type { Mock } from 'vitest';

import plugin, { cookieName } from './browser';

interface DialogMock {
    innerHTML: string;
    addEventListener: (event: string, callback: () => void) => void;
    showModal: Mock;
    remove: Mock;
    returnValue: string;
}

interface DocumentMock {
    cookie: string;
    body: { appendChild: Mock };
    createElement: Mock;
}

function transition(meta: Record<string, unknown>, navigate: Mock = vi.fn()) {
    return {
        route: {
            url: '/test',
            meta,
            hostname: 'example.com',
            route: '/test',
        },
        prevRoute: {
            url: '/prev',
            meta: {},
            hostname: 'example.com',
            route: '/prev',
        },
        navigate,
    };
}

describe('transitionHooks browser plugin', () => {
    let consoleLogStub: Mock;
    let documentMock: DocumentMock;

    beforeEach(() => {
        consoleLogStub = vi.spyOn(console, 'log').mockImplementation(() => {});

        // Minimal document mock: the plugin only touches the cookie, the body and createElement
        documentMock = {
            cookie: '',
            body: {
                appendChild: vi.fn(),
            },
            createElement: vi.fn(),
        };
        vi.stubGlobal('document', documentMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('should have correct plugin type', () => {
        expect(plugin.type).toBe('transitionHooks');
    });

    it('should export cookieName', () => {
        expect(cookieName).toBe('ilc-plugin-transition-hooks-sample');
    });

    it('should return an array of hooks from getTransitionHooks', () => {
        const hooks = plugin.getTransitionHooks();
        expect(Array.isArray(hooks)).toBe(true);
        expect(hooks).toHaveLength(1);
        expect(hooks[0]).toBeTypeOf('function');
    });

    describe('transition hook', () => {
        function dialogMock(returnValue: string): DialogMock & { closeCallback: (() => void) | null } {
            const dialog = {
                innerHTML: '',
                closeCallback: null as (() => void) | null,
                addEventListener: (event: string, callback: () => void) => {
                    if (event === 'close') {
                        dialog.closeCallback = callback;
                    }
                },
                showModal: vi.fn(),
                remove: vi.fn(),
                returnValue,
            };
            return dialog;
        }

        it('should log route meta when hook is called', () => {
            const hook = plugin.getTransitionHooks()[0]!;

            hook(transition({ protected: false, customField: 'value' }));

            expect(consoleLogStub).toHaveBeenCalledTimes(1);
            expect(consoleLogStub).toHaveBeenCalledWith('Browser transition hook with index #0 called with meta:', {
                protected: false,
                customField: 'value',
            });
        });

        it('should return continue when route is not protected', () => {
            const hook = plugin.getTransitionHooks()[0]!;

            const result = hook(transition({ protected: false }));

            expect(result).toEqual({ type: 'continue' });
            expect(consoleLogStub).toHaveBeenCalledTimes(1);
        });

        it('should return continue when protected is not set (undefined)', () => {
            const hook = plugin.getTransitionHooks()[0]!;

            const result = hook(transition({}));

            expect(result).toEqual({ type: 'continue' });
        });

        it('should return continue when cookie exists for protected route', () => {
            const hook = plugin.getTransitionHooks()[0]!;
            const navigateStub = vi.fn();

            documentMock.cookie = `${cookieName}=skip; path=/;`;

            const result = hook(transition({ protected: true }, navigateStub));

            expect(result).toEqual({ type: 'continue' });
            // Neither a dialog nor a navigation when the cookie is already there
            expect(documentMock.createElement).not.toHaveBeenCalled();
            expect(navigateStub).not.toHaveBeenCalled();
        });

        it('should return stop-navigation and create dialog when protected without cookie', () => {
            const hook = plugin.getTransitionHooks()[0]!;

            documentMock.cookie = 'other=value';

            const dialog = {
                innerHTML: '',
                addEventListener: vi.fn(),
                showModal: vi.fn(),
                remove: vi.fn(),
                returnValue: '',
            };
            documentMock.createElement.mockImplementation((tag: string) => (tag === 'dialog' ? dialog : undefined));

            const result = hook(transition({ protected: true }));

            expect(result).toEqual({ type: 'stop-navigation' });
            expect(documentMock.createElement).toHaveBeenCalledTimes(1);
            expect(documentMock.createElement).toHaveBeenCalledWith('dialog');
            expect(documentMock.body.appendChild).toHaveBeenCalledTimes(1);
            expect(documentMock.body.appendChild).toHaveBeenCalledWith(dialog);
            expect(dialog.showModal).toHaveBeenCalledTimes(1);
            expect(dialog.addEventListener).toHaveBeenCalledTimes(1);
            expect(dialog.addEventListener).toHaveBeenCalledWith('close', expect.any(Function));
        });

        it('should set correct dialog innerHTML with confirmation message', () => {
            const hook = plugin.getTransitionHooks()[0]!;

            documentMock.cookie = 'other=value';

            const dialog = dialogMock('');
            documentMock.createElement.mockImplementation((tag: string) => (tag === 'dialog' ? dialog : undefined));

            hook(transition({ protected: true }));

            expect(dialog.innerHTML).toContain('Are you sure you want to proceed?');
            expect(dialog.innerHTML).toContain('This will add cookie to remember your choice');
            expect(dialog.innerHTML).toContain('<form method="dialog">');
            expect(dialog.innerHTML).toContain('<button value="no">Cancel</button>');
            expect(dialog.innerHTML).toContain('<button id="confirmBtn" value="yes">Confirm</button>');
        });

        it('should set cookie and navigate when dialog is confirmed with yes', () => {
            const hook = plugin.getTransitionHooks()[0]!;
            const navigateStub = vi.fn();

            documentMock.cookie = 'other=value';

            const dialog = dialogMock('yes');
            documentMock.createElement.mockImplementation((tag: string) => (tag === 'dialog' ? dialog : undefined));

            const result = hook(transition({ protected: true }, navigateStub));

            expect(result).toEqual({ type: 'stop-navigation' });
            expect(dialog.closeCallback).not.toBeNull();

            dialog.closeCallback!();

            expect(documentMock.cookie).toBe(`${cookieName}=skip; path=/;`);
            expect(navigateStub).toHaveBeenCalledTimes(1);
            expect(navigateStub).toHaveBeenCalledWith('/test');
            expect(dialog.remove).toHaveBeenCalledTimes(1);
        });

        it('should not set cookie or navigate when dialog is canceled', () => {
            const hook = plugin.getTransitionHooks()[0]!;
            const navigateStub = vi.fn();

            const initialCookie = 'other=value';
            documentMock.cookie = initialCookie;

            const dialog = dialogMock('no');
            documentMock.createElement.mockImplementation((tag: string) => (tag === 'dialog' ? dialog : undefined));

            hook(transition({ protected: true }, navigateStub));

            expect(dialog.closeCallback).not.toBeNull();

            dialog.closeCallback!();

            expect(documentMock.cookie).toBe(initialCookie);
            expect(navigateStub).not.toHaveBeenCalled();
            expect(dialog.remove).toHaveBeenCalledTimes(1);
        });

        it('should remove dialog after close regardless of confirmation result', () => {
            const hook = plugin.getTransitionHooks()[0]!;

            documentMock.cookie = '';

            const dialog = dialogMock('anything');
            documentMock.createElement.mockImplementation((tag: string) => (tag === 'dialog' ? dialog : undefined));

            hook(transition({ protected: true }));
            dialog.closeCallback!();

            expect(dialog.remove).toHaveBeenCalledTimes(1);
        });
    });
});
