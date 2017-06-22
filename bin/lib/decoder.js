"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("winston");
const fs = require("mz/fs");
const _ = require("lodash");
const POGOProtos = require("node-pogo-protos/fs");
let pcrypt = require('pcrypt');
let protobuf = require('protobufjs');
let long = require('long');
let ByteBuffer = require('bytebuffer');
class Decoder {
    constructor(config) {
        this.config = config;
        this.loadProtos();
    }
    loadProtos() {
        return __awaiter(this, void 0, void 0, function* () {
            // alt protos for Android
            let load = yield protobuf.load('protos/Alternate.Signature.proto');
            this.altProtos = load.POGOProtos;
        });
    }
    decodeRequest(session, requestId, force = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!force && fs.existsSync(`data/${session}/${requestId}.req.json`)) {
                let data = yield fs.readFile(`data/${session}/${requestId}.req.json`, 'utf8');
                return JSON.parse(data);
            }
            let content = yield fs.readFile(`data/${session}/${requestId}.req.bin`, 'utf8');
            let data = JSON.parse(content);
            if (data.endpoint === '/plfe/version') {
                data.decoded = { request: 'check version', checkVersion: true };
            }
            else {
                let raw = Buffer.from(data.data, 'base64');
                delete data.data;
                data.decoded = this.decodeRequestBuffer(raw);
                // decode plateform requests
                _.each(data.decoded.platform_requests, req => {
                    let reqname = _.findKey(POGOProtos.Networking.Platform.PlatformRequestType, r => r === req.type);
                    if (reqname) {
                        req.request_name = reqname;
                        reqname = _.upperFirst(_.camelCase(reqname)) + 'Request';
                        let requestType = POGOProtos.Networking.Platform.Requests[reqname];
                        if (requestType) {
                            req.message = requestType.toObject(requestType.decode(req.request_message), { defaults: true });
                            if (req.type === POGOProtos.Networking.Platform.PlatformRequestType.SEND_ENCRYPTED_SIGNATURE) {
                                // decrypt signature
                                try {
                                    let decrypted = pcrypt.decrypt(req.message.encrypted_signature);
                                    try {
                                        req.message = POGOProtos.Networking.Envelopes.Signature.decode(decrypted);
                                        req.message = POGOProtos.Networking.Envelopes.Signature.toObject(req.message, { defaults: true });
                                    }
                                    catch (e) {
                                        req.message = this.altProtos.Networking.Envelopes.Signature.decode(decrypted);
                                        req.message = this.altProtos.Networking.Envelopes.Signature.toObject(req.message, { defaults: true });
                                        logger.debug('Decrypted with alternate protos');
                                    }
                                    if (req.message.device_info) {
                                        req.message.device_info.device_id = '(hidden)';
                                    }
                                    if (req.message.session_hash) {
                                        req.message.session_hash = '(hidden)';
                                    }
                                }
                                catch (e) {
                                    req.message = 'Error while decrypting: ' + e.message;
                                    logger.error(e);
                                }
                            }
                        }
                        else {
                            req.message = `unable to decode ${reqname}, type=${req.type}`;
                            req.data = req.request_message.toString('base64');
                        }
                    }
                    else {
                        req.message = `unable to decrypt ptfm request ${req.type}`;
                    }
                    delete req.request_message;
                });
                // prettify
                if (data.decoded.request_id) {
                    data.decoded.request_id = '0x' + data.decoded.request_id.toString(16);
                }
                // hide sensitive info
                if (data.decoded.auth_info) {
                    if (data.decoded.auth_info.token)
                        data.decoded.auth_info.token.contents = '(hidden)';
                }
                if (data.decoded.auth_ticket) {
                    if (data.decoded.auth_ticket.start)
                        data.decoded.auth_ticket.start = '(hidden)';
                    if (data.decoded.auth_ticket.end)
                        data.decoded.auth_ticket.end = '(hidden)';
                }
            }
            data = this.fixLongToString(data);
            yield fs.writeFile(`data/${session}/${requestId}.req.json`, JSON.stringify(data, null, 4), 'utf8');
            return data;
        });
    }
    decodeRequestBuffer(buffer) {
        let RequestEnvelope = POGOProtos.Networking.Envelopes.RequestEnvelope;
        let request = RequestEnvelope.toObject(RequestEnvelope.decode(buffer), { defaults: true });
        // decode requests
        _.each(request.requests, req => {
            let reqname = _.findKey(POGOProtos.Networking.Requests.RequestType, r => r === req.request_type);
            if (reqname) {
                req.request_name = reqname;
                reqname = _.upperFirst(_.camelCase(reqname)) + 'Message';
                let requestType = POGOProtos.Networking.Requests.Messages[reqname];
                if (requestType) {
                    req.message = requestType.toObject(requestType.decode(req.request_message), { defaults: true });
                }
                else {
                    logger.error('Unable to find request type %s (%d)', reqname, req.request_type);
                    req.message = {
                        base64: req.request_message.toString('base64'),
                    };
                }
                delete req.request_message;
            }
            else {
                logger.error('Unable to find request type %d', req.request_type);
            }
        });
        return request;
    }
    decodeResponse(session, requestId, force = false) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!force && fs.existsSync(`data/${session}/${requestId}.res.json`)) {
                    let data = yield fs.readFile(`data/${session}/${requestId}.res.json`, 'utf8');
                    return JSON.parse(data);
                }
                let requestJson = yield fs.readFile(`data/${session}/${requestId}.req.json`, 'utf8');
                let responseJson = yield fs.readFile(`data/${session}/${requestId}.res.bin`, 'utf8');
                let request = JSON.parse(requestJson).decoded;
                let raw = '';
                let data = {};
                if (responseJson[0] === '{') {
                    data = JSON.parse(responseJson);
                    raw = Buffer.from(data.data, 'base64');
                    delete data.data;
                }
                else {
                    data.when = request.when;
                    raw = Buffer.from(responseJson, 'base64');
                }
                if (request.checkVersion) {
                    return {
                        decoded: { response: raw.toString('utf8') },
                    };
                }
                let decoded = this.decodeResponseBuffer(request, raw);
                // decode plateform response
                let allPtfmRequests = _.map(request.platform_requests, r => r.request_name);
                if (allPtfmRequests.length > 0) {
                    decoded.platform_responses = _.map(decoded.platform_returns, (buffer, i) => {
                        let request = allPtfmRequests[i];
                        let responseType = POGOProtos.Networking.Platform.Responses[_.upperFirst(_.camelCase(request)) + 'Response'];
                        if (responseType) {
                            let message = responseType.toObject(responseType.decode(buffer.response), { defaults: true });
                            message.request_name = request;
                            return message;
                        }
                        else {
                            return {
                                error: 'unable to decrypt ' + request,
                                data: buffer.response.toString('base64'),
                            };
                        }
                    });
                }
                else {
                    decoded.platform_responses = [];
                }
                _(decoded.platform_returns).takeRight(decoded.platform_returns.length - allPtfmRequests.length).each(response => {
                    decoded.platform_responses.push({
                        error: '(unknown response)',
                    });
                });
                delete decoded.platform_returns;
                // prettify
                decoded.request_id = '0x' + decoded.request_id.toString(16);
                _.each(decoded.responses, response => {
                    if (response.request_name === 'GET_ASSET_DIGEST') {
                        _.each(response.digest, digest => {
                            digest.key = '(hidden)';
                        });
                    }
                    else if (response.request_name === 'SFIDA_REGISTRATION') {
                        response.access_token = {
                            base64: response.access_token.toString('base64'),
                        };
                    }
                });
                // hide auth info
                if (decoded.auth_ticket) {
                    if (decoded.auth_ticket.start)
                        decoded.auth_ticket.start = '(hidden)';
                    if (decoded.auth_ticket.end)
                        decoded.auth_ticket.end = '(hidden)';
                }
                data.decoded = decoded;
                data = this.fixLongToString(data);
                data = _.cloneDeep(data);
                yield fs.writeFile(`data/${session}/${requestId}.res.json`, JSON.stringify(data, null, 4), 'utf8');
                return data;
            }
            catch (e) {
                logger.error('Error decrypting response %s of session %s', requestId, session);
                logger.error(e);
                return {
                    decoded: { error: 'unable to decode response' },
                };
            }
        });
    }
    decodeResponseBuffer(request, buffer) {
        let ResponseEnvelope = POGOProtos.Networking.Envelopes.ResponseEnvelope;
        let decoded = ResponseEnvelope.toObject(ResponseEnvelope.decode(buffer), { defaults: true });
        // decode response messages
        let allRequests = _.map(request.requests, r => r.request_name);
        if (allRequests.length > 0) {
            decoded.responses = _.map(decoded.returns, (buffer, i) => {
                let request = allRequests[i];
                let responseType = POGOProtos.Networking.Responses[_.upperFirst(_.camelCase(request)) + 'Response'];
                if (responseType) {
                    let message = responseType.toObject(responseType.decode(buffer), { defaults: true });
                    message.request_name = request;
                    return message;
                }
                else {
                    return {
                        error: 'unable to decrypt ' + request,
                        data: buffer.toString('base64'),
                    };
                }
            });
        }
        else {
            decoded.responses = [];
        }
        _(decoded.returns).takeRight(decoded.returns.length - allRequests.length).each(response => {
            decoded.responses.push({
                error: '(unknown response)',
            });
        });
        delete decoded.returns;
        return decoded;
    }
    encodeRequestToBuffer(request) {
        return POGOProtos.Networking.Envelopes.RequestEnvelope.encode(request).finish();
    }
    encodeResponseToBuffer(response) {
        response.returns = _.map(response.responses, response => {
            let responseType = POGOProtos.Networking.Responses[_.upperFirst(_.camelCase(response.request_name)) + 'Response'];
            delete response.request_name;
            return responseType.encode(response);
        });
        delete response.responses;
        return POGOProtos.Networking.Envelopes.ResponseEnvelope.encode(response).finish();
    }
    fixLongToString(data) {
        _.forIn(data, (value, key) => {
            if (value instanceof long) {
                data[key] = value.toString();
            }
            else if (typeof value === 'object' && !(value instanceof ByteBuffer)) {
                data[key] = this.fixLongToString(value);
            }
        });
        return data;
    }
}
exports.default = Decoder;
//# sourceMappingURL=decoder.js.map