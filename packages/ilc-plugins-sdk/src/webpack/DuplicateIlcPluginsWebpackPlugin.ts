import path from 'path';
import { ilcPluginsPath } from './ilcPluginsPath';
import { WebpackError, type Compiler, type WebpackPluginInstance } from 'webpack';

function createDuplicateError(message: string): WebpackError {
    const error = new WebpackError(message);
    error.name = 'DuplicateIlcPluginsWebpackPlugin';

    return error;
}

export class DuplicateIlcPluginsWebpackPlugin implements WebpackPluginInstance {
    constructor(private readonly pluginsPath?: string) {}

    apply(compiler: Compiler) {
        compiler.hooks.thisCompilation.tap('DuplicateIlcPluginsWebpackPlugin', (compilation) => {
            const pluginPaths = ilcPluginsPath(this.pluginsPath || path.resolve(__dirname, '../../../../node_modules'));
            const pluginTypeCount: Record<string, number> = {};

            for (const pluginPath of pluginPaths) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports -- plugins are discovered on disk and loaded by path
                const module = require(pluginPath);
                const plugin = module.default || module;

                const count = (pluginTypeCount[plugin.type] || 0) + 1;
                pluginTypeCount[plugin.type] = count;

                if (count > 1) {
                    compilation.warnings.push(
                        createDuplicateError(
                            `ILC plugins SDK: Plugins at path "${pluginPath}" duplicates "${plugin.type}" plugin type`,
                        ),
                    );
                }
            }

            for (const [pluginType, count] of Object.entries(pluginTypeCount)) {
                if (count > 1) {
                    compilation.warnings.push(
                        createDuplicateError(`ILC plugins SDK: Multiple plugins of type "${pluginType}" installed.`),
                    );
                }
            }
        });
    }
}
