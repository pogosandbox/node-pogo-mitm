let express = require('express');
let logger = require('winston');
let path = require('path');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let moment = require('moment');
let POGOProtos = require('node-pogo-protos');
let pcrypt = require('pcrypt');

Promise.promisifyAll(fs);

class WebUI {
    constructor(config) {
        this.config = config;
    }

    launch() {
        let app = express();
        app.set('etag', false);

        app.get('/api/sessions', this.getSessions);
        app.get('/api/session/:session', this.getRequests);
        app.get('/api/request/:session/:request', this.decryptRequest);
        app.get('/api/response/:session/:request', this.decryptResponse);

        app.use(express.static(path.resolve(__dirname, 'webui')));

        app.listen(this.config.webuiPort, () => {
            logger.info('UI started.');
        });
    }

    getSessions(req, res) {
        logger.info('Getting all sessions.');
        return fs.readdirAsync('data')
        .then(data => {
            data = _.map(data, d => {
                return {
                    id: d,
                    title: moment(d, 'YYYYDDMM.HHmmss').format('DD MMM YY - HH:mm:ss'),
                };
            });
            res.json(data);
        });
    }

    getRequests(req, res) {
        logger.info('Getting requests for session %s', req.params.session);
        return fs.readdirAsync(`data/${req.params.session}`)
        .then(data => _.filter(data, d => _.endsWith(d, '.req.bin')))
        .then(data => {
            return Promise.map(data, file => {
                return fs.readFileAsync(`data/${req.params.session}/${file}`, 'utf8')
                        .then(content => {
                            return JSON.parse(content);
                        })
                        .then(req => {
                            req.id = _.trimEnd(file, '.req.bin');
                            return req;
                        });
            });
        })
        .then(files => {
            res.json(files);
        })
        .catch(e => res.status(500).send(e));
    }

    decryptRequest(req, res) {
        logger.info('Decrypting session %d, request %s', req.params.session, req.params.request);
        return fs.readFileAsync(`data/${req.params.session}/${req.params.request}.req.bin`, 'utf8')
        .then(content => {
            let data = JSON.parse(content);
            let raw = Buffer.from(data.data, 'base64');
            delete data.data;

            data.id = req.params.request;
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

                            req.message = POGOProtos.Networking.Envelopes.Signature.decode();
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

            res.json(data);

            return fs.writeFileAsync(`data/${req.params.session}/${req.params.request}.req.json`, JSON.stringify(data, null, 4), 'utf8');

        }).catch(e => {
            logger.error(e);
            res.status(500).send(e);

        });
    }

    decryptResponse(req, res) {
        logger.info('Decrypting session %d, response %s', req.params.session, req.params.request);
        Promise.all([
            fs.readFileAsync(`data/${req.params.session}/${req.params.request}.req.json`, 'utf8'),
            fs.readFileAsync(`data/${req.params.session}/${req.params.request}.res.bin`, 'utf8'),
        ])
        .then(results => {
            let request = JSON.parse(results[0]).decoded;

            let allRequests = _.map(request.requests, r => _.upperFirst(_.camelCase(r.request_name)));

            let raw = Buffer.from(results[1], 'base64');
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

            decoded.responses = _.map(decoded.returns, (buffer, i) => {
                let request = allRequests[i];
                let responseType = POGOProtos.Networking.Responses[request + 'Response'];
                return responseType.decode(buffer);
            });
            delete decoded.returns;

            // decode response
            // _.each(decoded.returns, (req, i) => {
            //     var request = allRequests[i];
            //     let responseType = POGOProtos.Networking.Responses[request + "Response"];
            //     req.message = responseType.decode(req.buffer);
            //     delete req.buffer;
            // });

            res.json({decoded: decoded});

        }).catch(e => {
            logger.error(e);
            res.status(500).send(e);

        });
    }
}

module.exports = WebUI;
