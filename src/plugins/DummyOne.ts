import * as logger from 'winston';

import MitmProxy from '../lib/proxy';
import BasePlugin from './BasePlugin';

class DummyOne extends BasePlugin {
    async init(proxy: MitmProxy) {
        logger.debug('DummyOne Init');
    }

    async handleResponse(context, response) {
        logger.debug('DummyOne.handleResponse');

        // false = we did not modify anything
        return false;
    }
}

export = new DummyOne();
