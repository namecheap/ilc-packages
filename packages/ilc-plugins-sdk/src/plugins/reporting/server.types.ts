import { Logger } from '../common/server.types';

import { Plugin } from '../../pluginManager/server.types';

export interface IlcError extends Error {
    cause?: IlcError;
    data?: any;
}

export declare interface IlcReportingPlugin extends Plugin {
    type: 'reporting';
    logger: Logger;
    requestIdLogLabel?: string;
    genReqId?: () => string;
}
