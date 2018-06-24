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
const POGOProtos = require("node-pogo-protos-vnext/fs");
const pcrypt = require('pcrypt');
const protobuf = require('protobufjs');
const long = require('long');
class Decoder {
    constructor(config, doNotHide = false) {
        this.config = config;
        this.doNotHide = doNotHide || config.ui.doNotHide;
        this.loadProtos();
    }
    loadProtos() {
        return __awaiter(this, void 0, void 0, function* () {
            // alt protos for Android
            const load = yield protobuf.load('protos/Alternate.Signature.proto');
            this.altProtos = load.POGOProtos;
        });
    }
    decodeRequest(session, requestId, force = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!force && fs.existsSync(`data/${session}/${requestId}.req.json`)) {
                const data = yield fs.readFile(`data/${session}/${requestId}.req.json`, 'utf8');
                return JSON.parse(data);
            }
            const content = yield fs.readFile(`data/${session}/${requestId}.req.bin`, 'utf8');
            if (content.length === 0) {
                return {
                    empty: true,
                };
            }
            let data = JSON.parse(content);
            if (_.endsWith(data.endpoint, '/plfe/version')) {
                data.decoded = { request: 'check version', checkVersion: true };
            }
            else if (data.endpoint && data.endpoint.indexOf('pgorelease.nianticlabs.com') < 0) {
                let display = Buffer.from(data.data, 'base64').toString();
                if (display[0] === '{')
                    display = JSON.parse(display);
                data.decoded = {
                    url: data.endpoint,
                    more: data.more,
                    data: display,
                };
            }
            else {
                const raw = Buffer.from(data.data, 'base64');
                delete data.data;
                if (!data.when)
                    data.when = +requestId;
                data.decoded = this.decodeRequestBuffer(raw);
                // decode platform requests
                const platform_requests = data.decoded.platform_requests;
                _.each(platform_requests, req => {
                    let reqname = _.findKey(POGOProtos.Networking.Platform.PlatformRequestType, r => r === req.type);
                    if (reqname) {
                        req.request_name = reqname;
                        reqname = _.upperFirst(_.camelCase(reqname)) + 'Request';
                        const requestType = POGOProtos.Networking.Platform.Requests[reqname];
                        if (requestType) {
                            const proto = requestType.decode(req.request_message);
                            // req.message = requestType.toObject(proto, { defaults: true });
                            if (req.type === POGOProtos.Networking.Platform.PlatformRequestType.SEND_ENCRYPTED_SIGNATURE) {
                                // decrypt signature
                                try {
                                    const decrypted = pcrypt.decrypt(proto.encrypted_signature);
                                    try {
                                        req.message = POGOProtos.Networking.Envelopes.Signature.decode(decrypted);
                                        req.message = POGOProtos.Networking.Envelopes.Signature.toObject(req.message, { defaults: true });
                                    }
                                    catch (e) {
                                        req.message = this.altProtos.Networking.Envelopes.Signature.decode(decrypted);
                                        req.message = this.altProtos.Networking.Envelopes.Signature.toObject(req.message, { defaults: true });
                                        logger.debug('Decrypted with alternate protos');
                                    }
                                    if (!this.doNotHide && req.message.device_info) {
                                        req.message.device_info.device_id = '(hidden)';
                                    }
                                    if (!this.doNotHide && req.message.session_hash) {
                                        req.message.session_hash = '(hidden)';
                                    }
                                }
                                catch (e) {
                                    req.message = 'Error while decrypting: ' + e.message;
                                    logger.error(e);
                                }
                            }
                            else {
                                req.message = proto.constructor.toObject(proto, { default: true });
                            }
                        }
                        else {
                            req.message = `unable to decode ${reqname}, type=${req.type}`;
                            req.data = req.request_message.toString('base64');
                        }
                    }
                    else {
                        req.message = `unable to decrypt ptfm request ${req.type}`;
                        req.data = req.request_message.toString('base64');
                    }
                    delete req.request_message;
                });
                // prettify
                if (data.decoded.request_id) {
                    data.decoded.request_id = '0x' + data.decoded.request_id.toString(16);
                }
                // hide sensitive info
                if (!this.doNotHide && data.decoded.auth_info) {
                    if (data.decoded.auth_info.token)
                        data.decoded.auth_info.token.contents = '(hidden)';
                }
                if (!this.doNotHide && data.decoded.auth_ticket) {
                    if (data.decoded.auth_ticket.start)
                        data.decoded.auth_ticket.start = '(hidden)';
                    if (data.decoded.auth_ticket.end)
                        data.decoded.auth_ticket.end = '(hidden)';
                }
            }
            data = this.fixLongAndBuffer(data);
            yield fs.writeFile(`data/${session}/${requestId}.req.json`, JSON.stringify(data, null, 4), 'utf8');
            return data;
        });
    }
    decodeRequestBuffer(buffer) {
        const RequestEnvelope = POGOProtos.Networking.Envelopes.RequestEnvelope;
        const request = RequestEnvelope.toObject(RequestEnvelope.decode(buffer), { defaults: true });
        // decode requests
        for (const req of request.requests) {
            let reqname = POGOProtos.Networking.Requests.RequestType[req.request_type];
            if (reqname) {
                req.request_name = reqname;
                reqname = _.upperFirst(_.camelCase(reqname)) + 'Message';
                const requestType = POGOProtos.Networking.Requests.Messages[reqname];
                if (requestType) {
                    req.message = requestType.toObject(requestType.decode(req.request_message), { defaults: true });
                    if (reqname === 'ProxySocialActionMessage') {
                        try {
                            const actionName = POGOProtos.Enums.SocialAction[req.message.action];
                            req.message.action_name = actionName;
                            const actionTypeName = _.upperFirst(_.camelCase(actionName)) + 'Message';
                            const actionType = POGOProtos.Networking.Requests.Social[actionTypeName];
                            req.message.payload = actionType.toObject(actionType.decode(req.message.payload), { defaults: true });
                        }
                        catch (e) {
                            logger.error(e);
                        }
                    }
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
        }
        return request;
    }
    decodeResponse(session, requestId, force = false) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!force && fs.existsSync(`data/${session}/${requestId}.res.json`)) {
                    const data = yield fs.readFile(`data/${session}/${requestId}.res.json`, 'utf8');
                    return JSON.parse(data);
                }
                let request = {};
                if (yield fs.exists(`data/${session}/${requestId}.req.json`)) {
                    const requestJson = yield fs.readFile(`data/${session}/${requestId}.req.json`, 'utf8');
                    const requestdata = JSON.parse(requestJson);
                    if (requestdata.endpoint && requestdata.endpoint.indexOf('pgorelease.nianticlabs.com') < 0) {
                        request = { other: true };
                    }
                    else {
                        request = requestdata.decoded;
                    }
                }
                const responseJson = yield fs.readFile(`data/${session}/${requestId}.res.bin`, 'utf8');
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
                else if (request.other) {
                    let display = Buffer.from(raw, 'base64').toString();
                    if (display.length > 0 && display[0] === '{')
                        display = JSON.parse(display);
                    else
                        display = display.replace(/\n+/gm, '\n');
                    return {
                        decoded: display,
                    };
                }
                const decoded = this.decodeResponseBuffer(request, raw);
                // decode plateform response
                const allPtfmRequests = _.map(request.platform_requests, r => r.request_name);
                if (allPtfmRequests.length > 0) {
                    decoded.platform_responses = _.map(decoded.platform_returns, (buffer, i) => {
                        const request = allPtfmRequests[i];
                        const responseType = POGOProtos.Networking.Platform.Responses[_.upperFirst(_.camelCase(request)) + 'Response'];
                        try {
                            if (responseType) {
                                const message = responseType.toObject(responseType.decode(buffer.response), { defaults: true });
                                message.request_name = request;
                                return message;
                            }
                            else {
                                return {
                                    error: 'unable to decrypt ' + request,
                                    data: buffer.response.toString('base64'),
                                };
                            }
                        }
                        catch (e) {
                            return {
                                error: `exception while decoding ${request}: ${e}`,
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
                        base64: response.toString('base64'),
                    });
                });
                delete decoded.platform_returns;
                // prettify
                decoded.request_id = '0x' + decoded.request_id.toString(16);
                // hide auth info
                if (!this.doNotHide && decoded.auth_ticket) {
                    if (decoded.auth_ticket.start)
                        decoded.auth_ticket.start = '(hidden)';
                    if (decoded.auth_ticket.end)
                        decoded.auth_ticket.end = '(hidden)';
                }
                data.decoded = decoded;
                data = this.fixLongAndBuffer(data);
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
        const ResponseEnvelope = POGOProtos.Networking.Envelopes.ResponseEnvelope;
        const decoded = ResponseEnvelope.toObject(ResponseEnvelope.decode(buffer), { defaults: true });
        // decode response messages
        const allRequests = _.map(request.requests, r => r.request_name);
        if (allRequests.length > 0) {
            decoded.responses = _.map(decoded.returns, (buffer, i) => {
                const requestName = allRequests[i];
                const responseType = POGOProtos.Networking.Responses[_.upperFirst(_.camelCase(requestName)) + 'Response'];
                if (responseType) {
                    const message = responseType.toObject(responseType.decode(buffer), { defaults: true });
                    message.request_name = requestName;
                    if (requestName === 'PROXY_SOCIAL_ACTION') {
                        const actionName = request.requests[i].message.action_name;
                        message.action_name = actionName;
                        const actionType = POGOProtos.Networking.Responses.Social[_.upperFirst(_.camelCase(actionName)) + 'Response'];
                        message.payload = actionType.toObject(actionType.decode(message.payload), { defaults: true });
                    }
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
                base64: response.toString('base64'),
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
            const responseType = POGOProtos.Networking.Responses[_.upperFirst(_.camelCase(response.request_name)) + 'Response'];
            delete response.request_name;
            return responseType.encode(response);
        });
        delete response.responses;
        return POGOProtos.Networking.Envelopes.ResponseEnvelope.encode(response).finish();
    }
    fixLongAndBuffer(data) {
        _.forIn(data, (value, key) => {
            if (value && value.constructor.name === 'Long') {
                data[key] = value.toString();
            }
            else if (value instanceof Buffer) {
                data[key] = value.toString('base64');
            }
            else if (typeof value === 'object') {
                data[key] = this.fixLongAndBuffer(value);
            }
        });
        return data;
    }
}
exports.default = Decoder;
//# sourceMappingURL=decoder.js.map