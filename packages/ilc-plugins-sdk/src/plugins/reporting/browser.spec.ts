import type { Mock } from 'vitest';

import type { IlcLogger, IlcReportingPlugin } from './browser.types';
import { consoleReportingPlugin, reportingPluginsWrapper } from './browser';

describe('Reporting browser', () => {
    describe('Console reporting plugin', () => {
        it('should have type reporting', () => {
            expect(consoleReportingPlugin.type).toBe('reporting');
        });

        describe('logger', () => {
            let warnStub: Mock;
            let infoStub: Mock;
            let errorStub: Mock;
            let debugStub: Mock;
            let traceStub: Mock;

            let logger: IlcLogger;

            beforeEach(() => {
                logger = consoleReportingPlugin.logger;

                warnStub = vi.spyOn(console, 'warn').mockImplementation(() => {});
                infoStub = vi.spyOn(console, 'info').mockImplementation(() => {});
                errorStub = vi.spyOn(console, 'error').mockImplementation(() => {});
                debugStub = vi.spyOn(console, 'debug').mockImplementation(() => {});
                traceStub = vi.spyOn(console, 'trace').mockImplementation(() => {});
            });

            afterEach(() => {
                vi.restoreAllMocks();
            });

            describe('message', () => {
                it('should invoke console.warn on logger.warn', () => {
                    logger.warn('Warn message');
                    expect(warnStub).toHaveBeenCalledTimes(1);
                    expect(warnStub).toHaveBeenCalledWith('Warn message');
                });

                it('should invoke console.info on logger.info', () => {
                    logger.info('Info message');
                    expect(infoStub).toHaveBeenCalledTimes(1);
                    expect(infoStub).toHaveBeenCalledWith('Info message');
                });

                it('should invoke console.error on logger.error', () => {
                    logger.error('Error message');
                    expect(errorStub).toHaveBeenCalledTimes(1);
                    expect(errorStub).toHaveBeenCalledWith('Error message');
                });

                it('should invoke console.error on logger.fatal', () => {
                    logger.fatal('Fatal message');
                    expect(errorStub).toHaveBeenCalledTimes(1);
                    expect(errorStub).toHaveBeenCalledWith('Fatal message');
                });

                it('should invoke console.debug on logger.debug', () => {
                    logger.debug('Debug message');
                    expect(debugStub).toHaveBeenCalledTimes(1);
                    expect(debugStub).toHaveBeenCalledWith('Debug message');
                });

                it('should invoke console.trace on logger.trace', () => {
                    logger.trace('Trace message');
                    expect(traceStub).toHaveBeenCalledTimes(1);
                    expect(traceStub).toHaveBeenCalledWith('Trace message');
                });
            });

            describe('message with plain object', () => {
                const logObject = {
                    hot: 'cake',
                };

                it('should invoke console.warn on logger.warn', () => {
                    logger.warn('Warn message', logObject);
                    expect(warnStub).toHaveBeenCalledTimes(1);
                    expect(warnStub).toHaveBeenCalledWith('Warn message', logObject);
                });

                it('should invoke console.info on logger.info', () => {
                    logger.info('Info message', logObject);
                    expect(infoStub).toHaveBeenCalledTimes(1);
                    expect(infoStub).toHaveBeenCalledWith('Info message', logObject);
                });

                it('should invoke console.error on logger.error', () => {
                    logger.error('Error message', logObject);
                    expect(errorStub).toHaveBeenCalledTimes(1);
                    expect(errorStub).toHaveBeenCalledWith('Error message', logObject);
                });

                it('should invoke console.error on logger.fatal', () => {
                    logger.fatal('Fatal message', logObject);
                    expect(errorStub).toHaveBeenCalledTimes(1);
                    expect(errorStub).toHaveBeenCalledWith('Fatal message', logObject);
                });

                it('should invoke console.debug on logger.debug', () => {
                    logger.debug('Debug message', logObject);
                    expect(debugStub).toHaveBeenCalledTimes(1);
                    expect(debugStub).toHaveBeenCalledWith('Debug message', logObject);
                });

                it('should invoke console.trace on logger.trace', () => {
                    logger.trace('Trace message', logObject);
                    expect(traceStub).toHaveBeenCalledTimes(1);
                    expect(traceStub).toHaveBeenCalledWith('Trace message', logObject);
                });
            });

            describe('message with error', () => {
                const logError = new Error('Log error');
                const logErrorInfo = JSON.stringify({
                    type: 'Error',
                    message: 'Log error',
                    stack: (logError.stack || '').split('\n'),
                });

                it('should transform error before invoke console.warn on logger.warn', () => {
                    logger.warn('Warn message', logError);
                    expect(warnStub).toHaveBeenCalledTimes(1);
                    expect(warnStub).toHaveBeenCalledWith('Warn message', logErrorInfo, logError);
                });

                it('should transform error before console.info on logger.info', () => {
                    logger.info('Info message', logError);
                    expect(infoStub).toHaveBeenCalledTimes(1);
                    expect(infoStub).toHaveBeenCalledWith('Info message', logErrorInfo, logError);
                });

                it('should transform error before console.error on logger.error', () => {
                    logger.error('Error message', logError);
                    expect(errorStub).toHaveBeenCalledTimes(1);
                    expect(errorStub).toHaveBeenCalledWith('Error message', logErrorInfo, logError);
                });

                it('should transform error before console.error on logger.fatal', () => {
                    logger.fatal('Fatal message', logError);
                    expect(errorStub).toHaveBeenCalledTimes(1);
                    expect(errorStub).toHaveBeenCalledWith('Fatal message', logErrorInfo, logError);
                });

                it('should transform error before console.debug on logger.debug', () => {
                    logger.debug('Debug message', logError);
                    expect(debugStub).toHaveBeenCalledTimes(1);
                    expect(debugStub).toHaveBeenCalledWith('Debug message', logErrorInfo, logError);
                });

                it('should transform error before console.trace on logger.trace', () => {
                    logger.trace('Trace message', logError);
                    expect(traceStub).toHaveBeenCalledTimes(1);
                    expect(traceStub).toHaveBeenCalledWith('Trace message', logErrorInfo, logError);
                });
            });

            describe('message with ilcError', () => {
                const logError = Object.assign(new Error('Log error'), {
                    data: {
                        hot: 'cake',
                    },
                    code: 'test.runtime',
                    errorId: '7216ea27-408a-4a4f-82d5-8f47fd030e8e',
                });

                const logErrorInfo = JSON.stringify({
                    type: 'Error',
                    message: 'Log error',
                    stack: (logError.stack || '').split('\n'),
                    additionalInfo: {
                        hot: 'cake',
                        code: 'test.runtime',
                        errorId: '7216ea27-408a-4a4f-82d5-8f47fd030e8e',
                    },
                });

                it('should transform error before invoke console.warn on logger.warn', () => {
                    logger.warn('Warn message', logError);
                    expect(warnStub).toHaveBeenCalledTimes(1);
                    expect(warnStub).toHaveBeenCalledWith('Warn message', logErrorInfo, logError);
                });

                it('should transform error before console.info on logger.info', () => {
                    logger.info('Info message', logError);
                    expect(infoStub).toHaveBeenCalledTimes(1);
                    expect(infoStub).toHaveBeenCalledWith('Info message', logErrorInfo, logError);
                });

                it('should transform error before console.error on logger.error', () => {
                    logger.error('Error message', logError);
                    expect(errorStub).toHaveBeenCalledTimes(1);
                    expect(errorStub).toHaveBeenCalledWith('Error message', logErrorInfo, logError);
                });

                it('should transform error before console.error on logger.fatal', () => {
                    logger.fatal('Fatal message', logError);
                    expect(errorStub).toHaveBeenCalledTimes(1);
                    expect(errorStub).toHaveBeenCalledWith('Fatal message', logErrorInfo, logError);
                });

                it('should transform error before console.debug on logger.debug', () => {
                    logger.debug('Debug message', logError);
                    expect(debugStub).toHaveBeenCalledTimes(1);
                    expect(debugStub).toHaveBeenCalledWith('Debug message', logErrorInfo, logError);
                });

                it('should transform error before console.trace on logger.trace', () => {
                    logger.trace('Trace message', logError);
                    expect(traceStub).toHaveBeenCalledTimes(1);
                    expect(traceStub).toHaveBeenCalledWith('Trace message', logErrorInfo, logError);
                });
            });
        });
    });

    describe('Reporting plugins wrapper', () => {
        let firstStubReporter: IlcReportingPlugin;
        let secondStubReporter: IlcReportingPlugin;
        let wrappedReporingPlugin: IlcReportingPlugin;

        const logObject = {
            hot: 'cake',
        };

        const logError = new Error('Log error');

        const logIlcError = Object.assign(new Error('Log error'), {
            data: {
                hot: 'cake',
            },
            code: 'test.runtime',
            errorId: '7216ea27-408a-4a4f-82d5-8f47fd030e8e',
        });

        function stubReporter(): IlcReportingPlugin {
            return {
                type: 'reporting',
                logger: {
                    warn: vi.fn(),
                    info: vi.fn(),
                    fatal: vi.fn(),
                    error: vi.fn(),
                    debug: vi.fn(),
                    trace: vi.fn(),
                },
                setConfig: vi.fn(),
            };
        }

        beforeEach(() => {
            firstStubReporter = stubReporter();
            secondStubReporter = stubReporter();

            wrappedReporingPlugin = reportingPluginsWrapper([firstStubReporter, secondStubReporter]);
        });

        it('should have reporting type', () => {
            expect(wrappedReporingPlugin.type).toBe('reporting');
        });

        it('shoud set config on every wrapped reporter', () => {
            const ilcConfig = {
                getConfig: vi.fn(),
                getConfigForApps: vi.fn(),
                getConfigForAppByName: vi.fn(),
                getSettings: vi.fn(),
                getSettingsByKey: vi.fn(),
                getConfigForSharedLibs: vi.fn(),
                getConfigForSharedLibsByName: vi.fn(),
            };

            wrappedReporingPlugin.setConfig(ilcConfig);

            expect(firstStubReporter.setConfig).toHaveBeenCalledWith(ilcConfig);
            expect(secondStubReporter.setConfig).toHaveBeenCalledWith(ilcConfig);
        });

        const methods: (keyof IlcLogger)[] = ['warn', 'info', 'debug', 'trace', 'fatal', 'error'];
        methods.forEach((methodName: keyof IlcLogger) => {
            it(`should call method on every wrapped reporter logger when logger.${methodName} invoked`, () => {
                wrappedReporingPlugin.logger[methodName](`${methodName} message`);
                wrappedReporingPlugin.logger[methodName](`${methodName} message`, logObject);
                wrappedReporingPlugin.logger[methodName](`${methodName} message`, logError);
                wrappedReporingPlugin.logger[methodName](`${methodName} message`, logIlcError);

                for (const reporter of [firstStubReporter, secondStubReporter]) {
                    expect(reporter.logger[methodName]).toHaveBeenCalledWith(`${methodName} message`);
                    expect(reporter.logger[methodName]).toHaveBeenCalledWith(`${methodName} message`, logObject);
                    expect(reporter.logger[methodName]).toHaveBeenCalledWith(`${methodName} message`, logError);
                    expect(reporter.logger[methodName]).toHaveBeenCalledWith(`${methodName} message`, logIlcError);
                }
            });
        });
    });
});
