/** Opens a URL in the user's browser with the platform's opener, detached; failure is silent since the URL is printed */
import { spawn } from 'node:child_process';

export function openBrowser(url: string): Promise<void> {
    return new Promise((resolve) => {
        const [command, args, verbatim] = opener(url);
        try {
            const child = spawn(command, args, {
                detached: true,
                stdio: 'ignore',
                windowsVerbatimArguments: verbatim,
            });
            child.on('error', () => resolve());
            child.on('spawn', () => resolve());
            child.unref();
        } catch {
            resolve();
        }
    });
}

function opener(url: string): [command: string, args: string[], verbatim: boolean] {
    switch (process.platform) {
        case 'darwin':
            return ['open', [url], false];
        case 'win32':
            // `start` takes the window title first; the quotes keep `&` in the URL out of cmd's hands
            return ['cmd', ['/c', 'start', '""', `"${url}"`], true];
        default:
            return ['xdg-open', [url], false];
    }
}
