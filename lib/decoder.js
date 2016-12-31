let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let POGOProtos = require('node-pogo-protos');
let pcrypt = require('pcrypt');

Promise.promisifyAll(fs);

class Decoder {
    constructor(config) {
        this.config = config;
    }

    decodeRequest(file) {
        return fs.readFileAsync(file, 'utf8')
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

            return data;
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
            let data = {
                when: null,
            };
            if (results[1][0] == '{') {
                data = JSON.parse(results[1]);
                raw = Buffer.from(data.data, 'base64');
                delete data.data;
            } else {
                raw = Buffer.from(results[1], 'base64');
            }

            if (request.checkVersion) {
                return {
                    decoded: {response: raw.toString('utf8')},
                };
            }

            let allRequests = _.map(request.requests, r => _.upperFirst(_.camelCase(r.request_name)));

            let decoded = POGOProtos.Networking.Envelopes.ResponseEnvelope.decode(raw);

            // decode plateform requests
            // _.each(decoded.platform_returns, req => {
            //     var reqname = _.findKey(POGOProtos.Networking.Platform.PlatformRequestType, r => r == req.type);
            //     req.request_name = reqname;
            //     reqname = _.upperFirst(_.camelCase(reqname)) + "Response";
            //     let requestType = POGOProtos.Networking.Platform.Requests[reqname];
            //     req.message = requestType.decode(req.request_message);
            //     delete req.request_message;
            //     if (req.type == POGOProtos.Networking.Platform.PlatformRequestType.SEND_ENCRYPTED_SIGNATURE) {
            //         // decrypt signature
            //         try {
            //             req.message = POGOProtos.Networking.Envelopes.Signature.decode();
            //         } catch(e) {
            //             req.message = 'Error while decrypting: ' + e.message;
            //         }
            //     }
            // });

            if (allRequests.length > 0) {
                decoded.responses = _.map(decoded.returns, (buffer, i) => {
                    let request = allRequests[i];
                    let responseType = POGOProtos.Networking.Responses[request + 'Response'];
                    if (responseType) {
                        return responseType.decode(buffer);
                    } else {
                        return {error: 'unable to decrypt ' + request};
                    }
                });
            }
            delete decoded.returns;

            data.decoded = decoded;
            return data;
        });
    }
}

module.exports = Decoder;
