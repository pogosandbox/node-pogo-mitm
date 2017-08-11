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
const Long = require("long");
const POGOProtos = require("node-pogo-protos-vnext");
const config_1 = require("./../lib/config");
const utils_1 = require("./../lib/utils");
const decoder_js_1 = require("./../lib/decoder.js");
class Analysis {
    constructor(config) {
        this.issues = [];
        this.state = {};
        this.config = config || new config_1.default().load();
        this.utils = new utils_1.default(this.config);
        this.decoder = new decoder_js_1.default(this.config, true);
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            if (process.argv.length < 3) {
                logger.error('usage: node ./bin/analys.js <session name>');
                return;
            }
            const folder = process.argv[2];
            logger.info(`Start analysis session ${folder}...`);
            if (!(yield fs.exists(`data/${folder}`))) {
                logger.error(`Folder data/${folder} does not exists.`);
                return;
            }
            this.init();
            let requests = yield fs.readdir(`data/${folder}`);
            requests = _.filter(requests, request => _.endsWith(request, '.req.bin'));
            for (const request of requests) {
                yield this.handleRequest(folder, request);
            }
            yield this.buildReport();
            return requests.length;
        });
    }
    init() {
        this.state = {
            reqId: {
                generation: { rpcId: 2, rpcIdHigh: 1 },
                ids: [],
                current: 0,
            },
            common: {
                first: true,
                login: true,
                store: false,
            },
        };
        this.generateSomeRequestIds(100);
    }
    generateSomeRequestIds(howMany = 20) {
        for (let i = 0; i < howMany; i++) {
            this.state.reqId.ids.push('0x' + this.getRequestID().toString(16));
        }
    }
    getRequestID() {
        const self = this.state.reqId.generation;
        self.rpcIdHigh = (Math.pow(7, 5) * self.rpcIdHigh) % (Math.pow(2, 31) - 1);
        return new Long(self.rpcId++, self.rpcIdHigh, true);
    }
    handleRequest(session, file) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const info = yield this.decoder.decodeRequest(session, _.trimEnd(file, '.req.bin'), true);
                const request = info.decoded;
                yield this.checkRequestId(file, request);
                yield this.checkSignature(file, request);
                yield this.checkApiCommon(file, request);
            }
            catch (e) {
                this.issues.push({
                    file,
                    issue: 'Unable to decode request',
                    more: e.toString(),
                });
            }
        });
    }
    checkRequestId(file, request) {
        const state = this.state.reqId;
        if (state.current + 5 >= state.ids.length)
            this.generateSomeRequestIds();
        const reqId = request.request_id;
        if (reqId === state.ids[state.current]) {
            state.current++;
            // } else if (request.requests.length === 0) {
        }
        else if (state.current > 0 && reqId === state.ids[state.current - 1]) {
            // replay? (relogin, throttle, ...)
        }
        else if (reqId === state.ids[state.current + 1]) {
            this.issues.push({
                file,
                issue: 'There is a gap in request id generation',
                more: `got ${reqId}, ${state.ids[state.current]} was expected`,
            });
            state.current += 2;
        }
        else {
            const id = Long.fromString(state.ids[state.current], true, 16).low;
            if (Long.fromString(reqId, true, 16).low === id) {
                this.issues.push({
                    file,
                    issue: 'Request number is correct but full request_id doesn\'t match',
                    more: `got ${reqId}, ${state.ids[state.current]} was expected`,
                });
                state.current++;
            }
            else {
                this.issues.push({
                    file,
                    issue: 'Unable to match request_id',
                    more: `received ${reqId}, ${state.ids[state.current]} was expected`,
                });
            }
        }
    }
    checkSignature(file, request) {
        let signature = _.find(request.platform_requests, ptfm => ptfm.request_name === 'SEND_ENCRYPTED_SIGNATURE');
        if (!signature) {
            this.issues.push({
                file,
                issue: 'request as no signature',
            });
        }
        else {
            signature = signature.message;
            // check uk25
            if (signature.unknown25 !== '5395925083854747393') {
                this.issues.push({
                    file,
                    issue: `invalid uk25: ${signature.unknown25}`,
                    more: '5395925083854747393 was expected',
                });
            }
            // check activity status
            const pActivity = POGOProtos.Networking.Envelopes.Signature.ActivityStatus.fromObject({ stationary: true });
            let activity = POGOProtos.Networking.Envelopes.Signature.ActivityStatus.toObject(pActivity, { defaults: true });
            activity = this.decoder.fixLongAndBuffer(activity);
            if (!_.isEqual(activity, signature.activity_status)) {
                this.issues.push({
                    file,
                    issue: 'activity status not as expected',
                    more: JSON.stringify(signature.activity_status, null, 2),
                });
            }
            // check device info
            if (signature.device_info) {
                const di = signature.device_info;
                if (di.device_id.length !== 32) {
                    this.issues.push({
                        file,
                        issue: 'device_id length was not 32',
                        more: signature.device_info.device_id,
                    });
                }
                if (di.android_board_name !== '' || di.android_bootloader !== '' || di.firmware_tags !== '' ||
                    di.device_brand !== 'Apple' || di.device_model !== 'iPhone' || di.device_model_identifier !== '' ||
                    di.hardware_manufacturer !== 'Apple' || di.firmware_brand !== 'iPhone OS' ||
                    di.firmware_fingerprint !== '') {
                    this.issues.push({
                        file,
                        issue: 'unexpected info in device_info',
                        more: JSON.stringify(di, null, 2),
                    });
                }
            }
            else {
                this.issues.push({
                    file,
                    issue: 'no device_info found',
                });
            }
            // location fix
            if (signature.location_fix && signature.location_fix.length > 0) {
                const wrong = _.filter(signature.location_fix, lc => lc.provider !== 'fused' ||
                    lc.location_type !== '1' || lc.floor !== 0 || lc.provider_status !== '3');
                if (wrong.length > 0) {
                    this.issues.push({
                        file,
                        issue: 'unexpected value in location_fix',
                        more: JSON.stringify(wrong, null, 2),
                    });
                }
            }
            else {
                this.issues.push({
                    file,
                    issue: 'no location_fix found',
                });
            }
            // sensor info
            if (!signature.sensor_info || signature.sensor_info.length !== 1) {
                const found = !signature.sensor_info ? 0 : signature.sensor_info.length;
                this.issues.push({
                    file,
                    issue: `only one sensor_info is expected, ${found} found`,
                });
            }
            else if (signature.sensor_info[0].status !== 3) {
                this.issues.push({
                    file,
                    issue: `sensor_info.status == ${signature.sensor_info.status} (3 was expected)`,
                });
            }
        }
    }
    checkApiCommon(file, request) {
        const state = this.state.common;
        const reqId = Long.fromString(request.request_id, true, 16).low;
        if (state.first && request.requests.length === 0) {
            state.first = false;
            // ok
            return;
        }
        state.first = false;
        if (state.login && request.requests.length === 1 && request.requests[0].request_name === 'GET_PLAYER') {
            // ok
            return;
        }
        if (request.requests.length === 0) {
            if (_.some(request.platform_requests, ptm => ptm.request_name === 'GET_STORE_ITEMS')) {
                // ok
                return;
            }
        }
        else if (request.requests.length < 6) {
            this.issues.push({
                file,
                issue: `request number too short (${request.requests.length})`,
                more: _.trimEnd(request.requests.map(r => r.request_name).join(', '), ', '),
            });
        }
        else if (state.login) {
            // in login flow
            const expected = [
                'CHECK_CHALLENGE',
                'GET_HATCHED_EGGS',
                'GET_INVENTORY',
                'CHECK_AWARDED_BADGES',
                'DOWNLOAD_SETTINGS',
            ];
            if (request.requests[0].request_name === 'GET_PLAYER_PROFILE') {
                expected.push('GET_BUDDY_WALKED');
            }
            else if (request.requests[0].request_name === 'LEVEL_UP_REWARDS') {
                expected.push('GET_BUDDY_WALKED');
                expected.push('GET_INBOX');
            }
            const common = _.drop(request.requests.map(r => r.request_name));
            if (!_.isEqual(expected, common)) {
                const strExpected = _.trimEnd(expected.join(', '), ', ');
                const strCommon = _.trimEnd(common.join(', '), ', ');
                this.issues.push({
                    file,
                    issue: `common requests are not as expected during login flow: ${strCommon}`,
                    more: `expected was ${strExpected}`,
                });
            }
            if (request.requests[0].request_name === 'LEVEL_UP_REWARDS') {
                state.login = false;
            }
        }
        else {
            // past login flow
            const expected = [
                'CHECK_CHALLENGE',
                'GET_HATCHED_EGGS',
                'GET_INVENTORY',
                'CHECK_AWARDED_BADGES',
                'GET_BUDDY_WALKED',
                'GET_INBOX',
            ];
            const common = _.drop(request.requests.map(r => r.request_name));
            if (!_.isEqual(expected, common)) {
                const strExpected = _.trimEnd(expected.join(', '), ', ');
                const strCommon = _.trimEnd(common.join(', '), ', ');
                this.issues.push({
                    file,
                    issue: `common requests are not as expected: ${strCommon}`,
                    more: `expected was ${strExpected}`,
                });
            }
        }
    }
    buildReport() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.issues.length === 0) {
                logger.info('No issue found.');
            }
            else {
                logger.info(JSON.stringify(this.issues, null, 2));
            }
        });
    }
}
const analysis = new Analysis();
analysis.run()
    .then(num => {
    logger.info('%s file(s) analysed.', num);
    process.exit();
})
    .catch(e => logger.error(e));
//# sourceMappingURL=analysis.js.map