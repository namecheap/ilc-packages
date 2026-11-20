import path from 'node:path';
import type { Mock } from 'vitest';

import * as ilcPluginsPathModule from './ilcPluginsPath';
import { DuplicateIlcPluginsWebpackPlugin } from './DuplicateIlcPluginsWebpackPlugin';

vi.mock('./ilcPluginsPath', () => ({
    ilcPluginsPath: vi.fn(),
}));

const ilcPluginsPathMock = vi.mocked(ilcPluginsPathModule.ilcPluginsPath);

describe('DuplicateIlcPluginsWebpackPlugin', () => {
    let dublicatePluginsPlugin: DuplicateIlcPluginsWebpackPlugin;

    let compilerStub: any;
    let compilationTapStub: Mock;

    let compilationStub: any;
    let warningsPushStub: Mock;

    beforeEach(() => {
        ilcPluginsPathMock.mockReset().mockReturnValue([path.resolve(__dirname, './fixture/first-plugin.js')]);

        compilationTapStub = vi.fn();
        warningsPushStub = vi.fn();

        compilerStub = {
            hooks: {
                thisCompilation: {
                    tap: compilationTapStub,
                },
            },
        };

        compilationStub = {
            warnings: {
                push: warningsPushStub,
            },
        };

        dublicatePluginsPlugin = new DuplicateIlcPluginsWebpackPlugin();
    });

    it('should subscribe on thisCompilation hook', () => {
        dublicatePluginsPlugin.apply(compilerStub);
        expect(compilationTapStub).toHaveBeenCalledWith('DuplicateIlcPluginsWebpackPlugin', expect.any(Function));
    });

    it('should provide pluginsPath from constructor', () => {
        dublicatePluginsPlugin = new DuplicateIlcPluginsWebpackPlugin('./custom-path/');

        dublicatePluginsPlugin.apply(compilerStub);
        const handler = compilationTapStub.mock.calls[0]![1];
        handler(compilationStub);

        expect(ilcPluginsPathMock).toHaveBeenCalledWith('./custom-path/');
    });

    it('should push "multiple plugins warning" if type duplicates exists', () => {
        const pluginPath = path.resolve(__dirname, './fixture/first-plugin.js');

        ilcPluginsPathMock.mockReturnValue([pluginPath, pluginPath]);

        dublicatePluginsPlugin.apply(compilerStub);
        const handler = compilationTapStub.mock.calls[0]![1];
        handler(compilationStub);

        const messages = warningsPushStub.mock.calls.map(([warning]) => {
            expect(warning).toBeInstanceOf(Error);
            return warning.message;
        });

        expect(messages).toEqual([
            `ILC plugins SDK: Plugins at path "${pluginPath}" duplicates "first" plugin type`,
            `ILC plugins SDK: Multiple plugins of type "first" installed.`,
        ]);
    });

    it('should not push "multiple plugins warning" if type duplicates exists', () => {
        ilcPluginsPathMock.mockReturnValue([
            path.resolve(__dirname, './fixture/first-plugin.js'),
            path.resolve(__dirname, './fixture/second-plugin.js'),
        ]);

        dublicatePluginsPlugin.apply(compilerStub);
        const handler = compilationTapStub.mock.calls[0]![1];
        handler(compilationStub);

        expect(warningsPushStub).not.toHaveBeenCalled();
    });
});
