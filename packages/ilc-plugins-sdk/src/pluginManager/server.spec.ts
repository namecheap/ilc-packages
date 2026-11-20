import type { PluginManagerPublicApi } from './server.types';
import type { Plugin } from './common.types';
import PluginManager from './server';
import { plugin as defaultReportingPlugin } from '../plugins/reporting/server';
import defaultI18nParamsDetectionPlugin from '../plugins/i18nParamsDetection/server';
import defaultTransitionHooksPlugin from '../plugins/transitionHooks/server';

describe('PluginManager', () => {
    let pluginManager: PluginManagerPublicApi;

    describe('when trying to get a plugin that is existed', () => {
        const reportingPlugin = {
            type: 'reporting',
            property: 'propertyOfReportingPlugin',
            method: () => {},
        };

        const cloneOfReporting = {
            type: 'reporting',
            property: 'propertyOfCloneOfReportingPlugin',
            method: () => {},
        };

        const i18nParamsDetectionPlugin = {
            type: 'i18nParamsDetection',
            property: 'propertyOfI18nParamsDetectionPlugin',
            method: () => {},
        };

        const transitionHooksPlugin = {
            type: 'transitionHooks',
            property: 'propertyOfTransitionHooksPlugin',
            method: () => {},
        };

        const nonExistentType = {
            type: 'nonExistentType',
            property: 'propertyOfPluginWithNonExistentType',
            method: () => {},
        };

        const PluginPaths = {
            reporting: 'node_modules/@test/ilc-plugin-reporting',
            i18nParamsDetection: 'node_modules/@test/ilc-plugin-i18n-params-detection',
            transitionHooks: 'node_modules/@test/ilc-plugin-transition-hooks',
            cloneOfReporting: 'node_modules/@test/ilc-plugin-that-is-clone-of-reporting-plugin',
            nonExistentType: 'node_modules/@test/ilc-plugin-with-non-existent-type',
        } as const;

        const plugins = {
            [PluginPaths.reporting]: reportingPlugin,
            [PluginPaths.i18nParamsDetection]: i18nParamsDetectionPlugin,
            [PluginPaths.transitionHooks]: { default: transitionHooksPlugin },
            [PluginPaths.cloneOfReporting]: cloneOfReporting,
            [PluginPaths.nonExistentType]: nonExistentType,
        };

        const pluginsList: Plugin[] = [
            reportingPlugin,
            i18nParamsDetectionPlugin,
            transitionHooksPlugin,
            cloneOfReporting,
            nonExistentType,
        ];

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

            it('should return reporting plugin', () => {
                expect(pluginManager.getReportingPlugin()).toBe(reportingPlugin);
            });

            it('should return i18n params detection plugin', () => {
                expect(pluginManager.getI18nParamsDetectionPlugin()).toBe(i18nParamsDetectionPlugin);
            });

            it('should return transition hooks plugin', () => {
                expect(pluginManager.getTransitionHooksPlugin()).toBe(transitionHooksPlugin);
            });
        });

        describe('from plugins', () => {
            beforeEach(() => {
                pluginManager = new PluginManager(...pluginsList);
            });

            it('should return reporting plugin', () => {
                expect(pluginManager.getReportingPlugin()).toBe(reportingPlugin);
            });

            it('should return i18n params detection plugin', () => {
                expect(pluginManager.getI18nParamsDetectionPlugin()).toBe(i18nParamsDetectionPlugin);
            });

            it('should return transition hooks plugin', () => {
                expect(pluginManager.getTransitionHooksPlugin()).toBe(transitionHooksPlugin);
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

            it('should return the default reporting plugin', () => {
                expect(pluginManager.getReportingPlugin()).toEqual(defaultReportingPlugin);
            });

            it('should return the default i18n params detection plugin', () => {
                expect(pluginManager.getI18nParamsDetectionPlugin()).toEqual(defaultI18nParamsDetectionPlugin);
            });

            it('should return the default transition hooks plugin', () => {
                expect(pluginManager.getTransitionHooksPlugin()).toEqual(defaultTransitionHooksPlugin);
            });
        });

        describe('from plugins', () => {
            beforeEach(() => {
                pluginManager = new PluginManager(...([] as Plugin[]));
            });

            it('should return the default reporting plugin', () => {
                expect(pluginManager.getReportingPlugin()).toEqual(defaultReportingPlugin);
            });

            it('should return the default i18n params detection plugin', () => {
                expect(pluginManager.getI18nParamsDetectionPlugin()).toEqual(defaultI18nParamsDetectionPlugin);
            });

            it('should return the default transition hooks plugin', () => {
                expect(pluginManager.getTransitionHooksPlugin()).toEqual(defaultTransitionHooksPlugin);
            });
        });
    });
});
