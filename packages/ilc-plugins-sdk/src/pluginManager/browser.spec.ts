import type { PluginManagerPublicApi } from './browser.types';
import type { Plugin } from './common.types';
import type { IlcReportingPlugin } from '../plugins/reporting/browser.types';
import PluginManager from './browser';
import * as reporting from '../plugins/reporting/browser';
import defaultTransitionHooksPlugin from '../plugins/transitionHooks/browser';

vi.mock('../plugins/reporting/browser', async (importOriginal) => ({
    ...(await importOriginal<typeof reporting>()),
    reportingPluginsWrapper: vi.fn(),
}));

const reportingPluginsWrapperMock = vi.mocked(reporting.reportingPluginsWrapper);

describe('PluginManager', () => {
    let pluginManager: PluginManagerPublicApi;

    describe('when trying to get a plugin that is existed', () => {
        let wrappedReportingPlugin: IlcReportingPlugin;

        const transitionHooksPlugin = {
            type: 'transitionHooks',
            property: 'propertyOfTransitionHooksPlugin',
            getTransitionHooks: () => {},
        };

        const cloneOfTransitionHooks = {
            type: 'transitionHooks',
            property: 'propertyOfCloneOfTransitionHooksPlugin',
            getTransitionHooks: () => {},
        };

        const reportingPlugin = {
            type: 'reporting',
            logger: {},
            setConfig: () => {},
        };

        const reportingSecondPlugin = {
            type: 'reporting',
            logger: {},
            setConfig: () => {},
        };

        const nonExistentTypePlugin = {
            type: 'nonExistentType',
            property: 'propertyOfPluginWithNonExistentType',
            method: () => {},
        };

        const PluginPaths = {
            reporting: 'node_modules/@test/ilc-plugin-reporting-hooks',
            reportingSecond: 'node_modules/@test/ilc-plugin-reporting-second-plugin',
            transitionHooks: 'node_modules/@test/ilc-plugin-transition-hooks',
            cloneOfTransitionHooks: 'node_modules/@test/ilc-plugin-that-is-clone-of-transition-hooks-plugin',
            nonExistentType: 'node_modules/@test/ilc-plugin-with-non-existent-type',
        } as const;

        const plugins = {
            [PluginPaths.reporting]: { default: reportingPlugin },
            [PluginPaths.reportingSecond]: { default: reportingSecondPlugin },
            [PluginPaths.transitionHooks]: { default: transitionHooksPlugin },
            [PluginPaths.cloneOfTransitionHooks]: cloneOfTransitionHooks,
            [PluginPaths.nonExistentType]: nonExistentTypePlugin,
        };

        const pluginsList: Plugin[] = [
            reportingPlugin,
            reportingSecondPlugin,
            transitionHooksPlugin,
            cloneOfTransitionHooks,
            nonExistentTypePlugin,
        ];

        beforeEach(() => {
            wrappedReportingPlugin = { type: 'reporting' } as IlcReportingPlugin;
            reportingPluginsWrapperMock.mockReset().mockReturnValue(wrappedReportingPlugin);
        });

        describe('from context', () => {
            function context(pluginPath: (typeof PluginPaths)[keyof typeof PluginPaths]) {
                return plugins[pluginPath];
            }

            context.keys = function () {
                return Object.keys(plugins);
            };

            beforeEach(() => {
                pluginManager = new PluginManager(context);
            });

            it('should return transition hooks plugin', () => {
                expect(pluginManager.getTransitionHooksPlugin()).toBe(transitionHooksPlugin);
            });

            it('should return reporting wrapper plugin', () => {
                expect(pluginManager.getReportingPlugin()).toBe(wrappedReportingPlugin);
            });

            it('should wrap reporting plugins and default console plugin with reportingPluginsWrapper', () => {
                pluginManager.getReportingPlugin();

                expect(reportingPluginsWrapperMock).toHaveBeenCalledTimes(1);
                expect(reportingPluginsWrapperMock).toHaveBeenCalledWith([
                    reportingPlugin,
                    reportingSecondPlugin,
                    reporting.consoleReportingPlugin,
                ]);
            });
        });

        describe('from plugins', () => {
            beforeEach(() => {
                pluginManager = new PluginManager(...pluginsList);
            });

            it('should return transition hooks plugin', () => {
                expect(pluginManager.getTransitionHooksPlugin()).toBe(transitionHooksPlugin);
            });

            it('should return reporting wrapper plugin', () => {
                expect(pluginManager.getReportingPlugin()).toBe(wrappedReportingPlugin);
            });

            it('should wrap reporting plugins and default console plugin with reportingPluginsWrapper', () => {
                pluginManager.getReportingPlugin();

                expect(reportingPluginsWrapperMock).toHaveBeenCalledTimes(1);
                expect(reportingPluginsWrapperMock).toHaveBeenCalledWith([
                    reportingPlugin,
                    reportingSecondPlugin,
                    reporting.consoleReportingPlugin,
                ]);
            });
        });
    });

    describe('when trying to get a plugin that is non existent', () => {
        describe('from context', () => {
            function context() {
                return;
            }

            context.keys = function () {
                return [];
            };

            beforeEach(() => {
                pluginManager = new PluginManager(context);
            });

            it('should return the default transition hooks plugin', () => {
                expect(pluginManager.getTransitionHooksPlugin()).toEqual(defaultTransitionHooksPlugin);
            });

            it('should return reporting consoleReporting plugin', () => {
                expect(pluginManager.getReportingPlugin()).toBe(reporting.consoleReportingPlugin);
            });
        });

        describe('from plugins', () => {
            beforeEach(() => {
                pluginManager = new PluginManager(...([] as Plugin[]));
            });

            it('should return the default transition hooks plugin', () => {
                expect(pluginManager.getTransitionHooksPlugin()).toEqual(defaultTransitionHooksPlugin);
            });

            it('should return reporting consoleReporting plugin', () => {
                expect(pluginManager.getReportingPlugin()).toBe(reporting.consoleReportingPlugin);
            });
        });
    });
});
