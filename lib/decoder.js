let fs = require('fs');
let logger = require('winston');
let Promise = require('bluebird');
let _ = require('lodash');
let POGOProtos = require('node-pogo-protos');
let pcrypt = require('pcrypt');

Promise.promisifyAll(fs);

class Decoder {
    constructor(config) {
        this.config = config;
    }

    decodeRequest(session, requestId) {
        return fs.readFileAsync(`data/${session}/${requestId}.req.bin`, 'utf8')
        .then(content => {
            let data = JSON.parse(content);
            if (data.endpoint == '/plfe/version') {
                data.decoded = {request: 'check version', checkVersion: true};

            } else {
                let raw = Buffer.from(data.data, 'base64');
                delete data.data;

                data.decoded = POGOProtos.Networking.Envelopes.RequestEnvelope.decode(raw);

                // decode plateform requests
                _.each(data.decoded.platform_requests, req => {
                    let reqname = _.findKey(POGOProtos.Networking.Platform.PlatformRequestType, r => r == req.type);
                    req.request_name = reqname;
                    reqname = _.upperFirst(_.camelCase(reqname)) + 'Request';
                    let requestType = POGOProtos.Networking.Platform.Requests[reqname];
                    if (requestType) {
                        req.message = requestType.decode(req.request_message);
                        if (req.type == POGOProtos.Networking.Platform.PlatformRequestType.SEND_ENCRYPTED_SIGNATURE) {
                            // decrypt signature
                            try {
                                let buffer = req.message.encrypted_signature.toBuffer();
                                let decrypted = pcrypt.decrypt(buffer);
                                req.message = POGOProtos.Networking.Envelopes.Signature.decode(decrypted);
                            } catch(e) {
                                req.message = 'Error while decrypting: ' + e.message;
                            }
                        }
                    } else {
                        req.message = `unable to decode ${reqname}`;
                    }
                    delete req.request_message;
                });

                // decode requests
                _.each(data.decoded.requests, req => {
                    let reqname = _.findKey(POGOProtos.Networking.Requests.RequestType, r => r == req.request_type);
                    req.request_name = reqname;
                    reqname = _.upperFirst(_.camelCase(reqname)) + 'Message';
                    let requestType = POGOProtos.Networking.Requests.Messages[reqname];
                    req.message = requestType.decode(req.request_message);
                    delete req.request_message;
                });
            }

            return fs.writeFileAsync(`data/${session}/${requestId}.req.json`, JSON.stringify(data, null, 4), 'utf8')
                    .then(() => data);
        });
    }

    decodeResponse(session, requestId) {
        return Promise.all([
            fs.readFileAsync(`data/${session}/${requestId}.req.json`, 'utf8'),
            fs.readFileAsync(`data/${session}/${requestId}.res.bin`, 'utf8'),
        ])
        .then(results => {
            let request = JSON.parse(results[0]).decoded;

            let raw = '';
            let data = {};
            if (results[1][0] == '{') {
                data = JSON.parse(results[1]);
                raw = Buffer.from(data.data, 'base64');
                delete data.data;
            } else {
                data.when = request.when;
                raw = Buffer.from(results[1], 'base64');
            }

            if (request.checkVersion) {
                return {
                    decoded: {response: raw.toString('utf8')},
                };
            }

            let decoded = POGOProtos.Networking.Envelopes.ResponseEnvelope.decode(raw);

            // decode plateform response
            let allPtfmRequests = _.map(request.platform_requests, r => r.request_name);
            if (allPtfmRequests.length > 0) {
                decoded.platform_responses = _.map(decoded.platform_returns, (buffer, i) => {
                    let request = allPtfmRequests[i];
                    let responseType = POGOProtos.Networking.Platform.Responses[_.upperFirst(_.camelCase(request)) + 'Response'];
                    if (responseType) {
                        let message = responseType.decode(buffer.response);
                        message.request_name = request;
                        return message;
                    } else {
                        return {error: 'unable to decrypt ' + request};
                    }
                });
                delete decoded.platform_returns;
            }

            // decode response messages
            let allRequests = _.map(request.requests, r => r.request_name);
            if (allRequests.length > 0) {
                decoded.responses = _.map(decoded.returns, (buffer, i) => {
                    let request = allRequests[i];
                    let responseType = POGOProtos.Networking.Responses[_.upperFirst(_.camelCase(request)) + 'Response'];
                    if (responseType) {
                        let message = responseType.decode(buffer);
                        message.request_name = request;
                        return message;
                    } else {
                        return {error: 'unable to decrypt ' + request};
                    }
                });
                delete decoded.returns;
            }

            data.decoded = decoded;
            return fs.writeFileAsync(`data/${session}/${requestId}.res.json`, JSON.stringify(data, null, 4), 'utf8')
                    .then(() => data);
        }).catch(e => {
            logger.error('Error decypting request %s of session %s', requestId, session);
            logger.error(e);
            if (fs.existsSync(`data/${session}/${requestId}.res.json`)) {
                return fs.readFileAsync(`data/${session}/${requestId}.res.json`)
                        .then(data => JSON.parse(data));
            } else {
                return {
                    decoded: {error: 'unable to decode response'},
                };
            }
        });
    }
}

module.exports = Decoder;
