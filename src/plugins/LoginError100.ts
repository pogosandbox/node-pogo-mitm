import * as logger from 'winston';

import MitmProxy from '../lib/proxy';
import BasePlugin from './BasePlugin';

import * as POGOProtos from 'node-pogo-protos';

class LoginError100 extends BasePlugin {
    async handleResponse(context, response: POGOProtos.Networking.Envelopes.ResponseEnvelope) {
        let requestId = response.request_id.toString(16);
        if (context.clientToProxyRequest.url === '/plfe/rpc') {
            response.api_url = '';
            response.status_code = 100;
        }

        return true; // we modified something
    }
}

export = new LoginError100();
