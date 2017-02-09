import * as logger from 'winston';
import * as fs from 'fs-promise';
import * as _ from 'lodash';
import * as moment from 'moment';

let POGOProtos = require('node-pogo-protos');
let pcrypt = require('pcrypt');
let protobuf = require('protobufjs');
let long = require('long');

import Config from './config';

export default class Decoder {
    config: any;
    altProtos: any;

    constructor(config) {
        this.config = config;
        this.loadAltProtos();
    }

    loadAltProtos(): any {
        let builder = protobuf.newBuilder();
        protobuf.loadProtoFile('protos/Alternate.Signature.proto', builder);

        function addPackedOption(ns) {
            if (ns instanceof protobuf.Reflect.Message) {
                ns.getChildren(protobuf.Reflect.Message.Field).forEach(field => {
                    if (field.repeated && protobuf.PACKABLE_WIRE_TYPES.indexOf(field.type.wireType) !== -1) {
                        field.options.packed = true;
                    }
                });
                ns.getChildren(protobuf.Reflect.Message).forEach(addPackedOption);
            } else if (ns instanceof protobuf.Reflect.Namespace) {
                ns.children.forEach(addPackedOption);
            }
        }
        addPackedOption(builder.lookup('POGOProtos'));

        this.altProtos = builder.build('POGOProtos');
    }

    async decodeRequest(session: string, requestId: string, force = false): Promise<any> {
        if (!force && fs.existsSync(`data/${session}/${requestId}.req.json`)) {
            let data = await fs.readFile(`data/${session}/${requestId}.req.json`, 'utf8');
            return JSON.parse(data);
        }

        let content = await fs.readFile(`data/${session}/${requestId}.req.bin`, 'utf8');
        let data = JSON.parse(content);
        if (data.endpoint === '/plfe/version') {
            data.decoded = {request: 'check version', checkVersion: true};

        } else {
            let raw = Buffer.from(data.data, 'base64');
            delete data.data;

            data.decoded = POGOProtos.Networking.Envelopes.RequestEnvelope.decode(raw);
            data.decoded.request_id = '0x' + data.decoded.request_id.toString(16);

            // decode plateform requests
            _.each(data.decoded.platform_requests, req => {
                let reqname = _.findKey(POGOProtos.Networking.Platform.PlatformRequestType, r => r === req.type);
                req.request_name = reqname;
                reqname = _.upperFirst(_.camelCase(reqname)) + 'Request';
                let requestType = POGOProtos.Networking.Platform.Requests[reqname];
                if (requestType) {
                    req.message = requestType.decode(req.request_message);
                    if (req.type === POGOProtos.Networking.Platform.PlatformRequestType.SEND_ENCRYPTED_SIGNATURE) {
                        // decrypt signature
                        try {
                            let buffer = req.message.encrypted_signature.toBuffer();
                            let decrypted = pcrypt.decrypt(buffer);
                            try {
                                req.message = POGOProtos.Networking.Envelopes.Signature.decode(decrypted);
                            } catch (e) {
                                req.message = this.altProtos.Networking.Envelopes.Signature.decode(decrypted);
                                logger.debug('Decrypted with alternate protos');
                            }
                            if (req.message.device_info) {
                                req.message.device_info.device_id = '(hidden)';
                            }
                            if (req.message.session_hash) {
                                req.message.session_hash = '(hidden)';
                            }
                        } catch (e) {
                            // try with an alternate proto
                            req.message = 'Error while decrypting: ' + e.message;
                            logger.error(e);
                        }
                    }
                } else {
                    req.message = `unable to decode ${reqname}, type=${req.type}`;
                }
                delete req.request_message;
            });

            // decode requests
            _.each(data.decoded.requests, req => {
                let reqname = _.findKey(POGOProtos.Networking.Requests.RequestType, r => r === req.request_type);
                req.request_name = reqname;
                reqname = _.upperFirst(_.camelCase(reqname)) + 'Message';
                let requestType = POGOProtos.Networking.Requests.Messages[reqname];
                req.message = requestType.decode(req.request_message);
                delete req.request_message;
            });

            // hide auth info
            if (data.decoded.auth_info) {
                if (data.decoded.auth_info.token) data.decoded.auth_info.token.contents = '(hidden)';
            }
            if (data.decoded.auth_ticket) {
                if (data.decoded.auth_ticket.start) data.decoded.auth_ticket.start = '(hidden)';
                if (data.decoded.auth_ticket.end) data.decoded.auth_ticket.end = '(hidden)';
            }
        }

        data = this.fixLongToString(data);
        await fs.writeFile(`data/${session}/${requestId}.req.json`, JSON.stringify(data, null, 4), 'utf8');

        return data;
    }

    async decodeResponse(session: string, requestId: string, force = false): Promise<any> {
        try {
            if (!force && fs.existsSync(`data/${session}/${requestId}.res.json`)) {
                let data = await fs.readFile(`data/${session}/${requestId}.res.json`, 'utf8');
                return JSON.parse(data);
            }

            let requestJson = await fs.readFile(`data/${session}/${requestId}.req.json`, 'utf8');
            let responseJson = await fs.readFile(`data/${session}/${requestId}.res.bin`, 'utf8');

            let request = JSON.parse(requestJson).decoded;

            let raw: any = '';
            let data: any  = {};
            if (responseJson[0] === '{') {
                data = JSON.parse(responseJson);
                raw = Buffer.from(data.data, 'base64');
                delete data.data;
            } else {
                data.when = request.when;
                raw = Buffer.from(responseJson, 'base64');
            }

            if (request.checkVersion) {
                return {
                    decoded: {response: raw.toString('utf8')},
                };
            }

            let decoded = POGOProtos.Networking.Envelopes.ResponseEnvelope.decode(raw);
            decoded.request_id = '0x' + decoded.request_id.toString(16);

            // decode plateform response
            let allPtfmRequests = _.map(<any[]>request.platform_requests, r => r.request_name);
            if (allPtfmRequests.length > 0) {
                decoded.platform_responses = _.map(<any[]>decoded.platform_returns, (buffer, i) => {
                    let request = allPtfmRequests[i];
                    if (request === 'GET_STORE_ITEMS') { // crash. bad protos?
                        return {
                            error: '(unable to decode)',
                            request_name: request,
                        };
                    } else {
                        let responseType = POGOProtos.Networking.Platform.Responses[_.upperFirst(_.camelCase(request)) + 'Response'];
                        if (responseType) {
                            let message = responseType.decode(buffer.response);
                            message.request_name = request;
                            return message;
                        } else {
                            return {error: 'unable to decrypt ' + request};
                        }
                    }
                });
            } else {
                decoded.platform_responses = [];
            }

            _(decoded.platform_returns).takeRight(decoded.platform_returns.length - allPtfmRequests.length).each(response => {
                decoded.platform_responses.push({
                    error: '(unknown response)',
                });
            });
            delete decoded.platform_returns;

            // decode response messages
            let allRequests = _.map(<any[]>request.requests, r => r.request_name);
            if (allRequests.length > 0) {
                decoded.responses = _.map(decoded.returns, (buffer, i) => {
                    let request = allRequests[i];
                    let responseType = POGOProtos.Networking.Responses[_.upperFirst(_.camelCase(request)) + 'Response'];
                    if (responseType) {
                        let message = responseType.decode(buffer);
                        message.request_name = request;
                        if (request === 'GET_ASSET_DIGEST') {
                            _.each(message.digest, digest => {
                                digest.key = '(hidden)';
                            });
                        }
                        return message;
                    } else {
                        return {error: 'unable to decrypt ' + request};
                    }
                });
            } else {
                decoded.responses = [];
            }

            _(decoded.returns).takeRight(decoded.returns.length - allRequests.length).each(response => {
                decoded.responses.push({
                    error: '(unknown response)',
                });
            });
            delete decoded.returns;

            // hide auth info
            if (decoded.auth_ticket) {
                if (decoded.auth_ticket.start) decoded.auth_ticket.start = '(hidden)';
                if (decoded.auth_ticket.end) decoded.auth_ticket.end = '(hidden)';
            }

            data.decoded = decoded;
            data = this.fixLongToString(data);
            await fs.writeFile(`data/${session}/${requestId}.res.json`, JSON.stringify(data, null, 4), 'utf8');

            return data;

        } catch (e) {
            logger.error('Error decrypting request %s of session %s', requestId, session);
            logger.error(e);
            return {
                decoded: {error: 'unable to decode response'},
            };
        }
    }

    fixLongToString(data: any): any {
        _.forIn(data, (value, key) => {
            if (value instanceof long) {
                data[key] = value.toString();
            } else if (typeof value === 'object') {
                data[key] = this.fixLongToString(value);
            }
        });
        return data;
    }
}
