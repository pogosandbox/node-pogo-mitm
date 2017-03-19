import * as logger from 'winston';
import * as _ from 'lodash';

import MitmProxy from '../lib/proxy';
import BasePlugin from './BasePlugin';

import * as POGOProtos from 'node-pogo-protos';

class FakeWarn extends BasePlugin {
    async handleResponse(context, response) {
        let main = _.first(response.responses) as any;
        if (main && main.request_name === 'GET_PLAYER') {
            // getPlayer()
            main.warn = true;

            // we modified something
            return true;
        }

        return false;
    }
}

export = new FakeWarn();
