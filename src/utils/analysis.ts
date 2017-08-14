import * as logger from 'winston';
import * as fs from 'mz/fs';
import * as Bluebird from 'bluebird';
import * as moment from 'moment';
import * as _ from 'lodash';
import * as Long from 'long';
import * as POGOProtos from 'node-pogo-protos-vnext/fs';
import * as mustachio from 'mustachio';

const pcrypt = require('pcrypt');

import Config from './../lib/config';
import Utils from './../lib/utils';
import Decoder from './../lib/decoder.js';

interface Issue {
    type: string;
    file: string;
    issue: string;
    more?: string;
}

export default class Analysis {
    config: any;
    utils: Utils;
    decoder: Decoder;
    issues: Issue[] = [];
    state: any = {};
    session: string;

    constructor(config?, utils?: Utils, decoder?: Decoder) {
        this.config = config || new Config().load();
        this.utils = utils || new Utils(this.config);
        this.decoder = decoder || new Decoder(this.config, true);
    }

    async run(folder) {
        logger.info(`Start analysis session ${folder}...`);
        if (!await fs.exists(`data/${folder}`)) {
            logger.error(`Folder data/${folder} does not exists.`);
            return;
        }

        this.init(folder);

        let requests = await fs.readdir(`data/${folder}`);
        requests = _.filter(requests, request => _.endsWith(request, '.req.bin'));
        for (const request of requests) {
            await this.handleRequest(request);
        }

        await this.buildReport();

        return requests.length;
    }

    init(folder: string) {
        this.state = {
            session: folder,
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

    async handleRequest(file: string) {
        try {
            const info = await this.decoder.decodeRequest(this.state.session, _.trimEnd(file, '.req.bin'), true);
            const request = info.decoded;
            await this.checkRequestId(file, request);
            await this.checkSignature(file, request);
            await this.checkSignatureMissingFields(file, request);
            await this.checkApiCommon(file, request);
        } catch (e) {
            this.issues.push({
                type: 'proto',
                file,
                issue: 'Unable to decode request',
                more: e.toString(),
            });
        }
    }

    checkRequestId(file: string, request) {
        const state = this.state.reqId;
        if (state.current + 10 >= state.ids.length) this.generateSomeRequestIds();

        const reqId = request.request_id;
        if (reqId === state.ids[state.current]) {
            state.current++;
        // } else if (request.requests.length === 0) {

        } else if (state.current > 0 && reqId === state.ids[state.current - 1]) {
            // replay? (relogin, throttle, ...)
        } else {
            let gap = 1;
            while (gap < 6 && reqId !== state.ids[state.current + gap]) {
                gap++;
            }
            if (reqId === state.ids[state.current + gap]) {
                this.issues.push({
                    type: 'requestid',
                    file,
                    issue: `There is a gap of ${gap} in request id generation`,
                    more: `got ${reqId}, ${state.ids[state.current]} was expected`,
                });
                state.current += gap + 1;
            } else {
                const id = Long.fromString(state.ids[state.current], true, 16).low;
                if (Long.fromString(reqId, true, 16).low === id) {
                    this.issues.push({
                        type: 'requestid',
                        file,
                        issue: 'Request number is correct but full request_id doesn\'t match',
                        more: `got ${reqId}, ${state.ids[state.current]} was expected`,
                    });
                    state.current++;
                } else {
                    this.issues.push({
                        type: 'requestid',
                        file,
                        issue: 'Unable to match request_id',
                        more: `received ${reqId}, ${state.ids[state.current]} was expected`,
                    });
                }
            }
        }
    }

    checkSignatureValue(file: string, obj: any, name: string, value: any) {
        if (!_.isEqual(obj[name], value)) {
            this.issues.push({
                type: 'signature',
                file,
                issue: `invalid value for '${name}' in signature`,
                more: `got ${obj[name]}, ${value} was expected.`,
            });
        }
    }

    checkSignature(file: string, request) {
        const signatures = _.filter(<any[]>request.platform_requests, ptfm => ptfm.request_name === 'SEND_ENCRYPTED_SIGNATURE');
        if (!signatures || signatures.length !== 1) {
            const count = !signatures ? 0 : signatures.length;
            this.issues.push({
                type: 'envelop',
                file,
                issue: `request should have exactly one signature (we have ${count})`,
            });
        } else {
            const signature = _.first(signatures).message;

            // check signature value
            this.checkSignatureValue(file, signature, 'unknown25', '5395925083854747393');
            this.checkSignatureValue(file, signature, 'gps_info', []);
            this.checkSignatureValue(file, signature, 'field1', []);
            this.checkSignatureValue(file, signature, 'field3', '');
            this.checkSignatureValue(file, signature, 'field6', []);
            this.checkSignatureValue(file, signature, 'field11', false);
            this.checkSignatureValue(file, signature, 'field12', false);
            this.checkSignatureValue(file, signature, 'field13', 0);
            this.checkSignatureValue(file, signature, 'field14', 0);
            this.checkSignatureValue(file, signature, 'field15', '');
            this.checkSignatureValue(file, signature, 'field16', 0);
            this.checkSignatureValue(file, signature, 'field17', '');
            this.checkSignatureValue(file, signature, 'field18', '');
            this.checkSignatureValue(file, signature, 'field19', false);
            this.checkSignatureValue(file, signature, 'field21', false);

            // check activity status
            const pActivity = POGOProtos.Networking.Envelopes.Signature.ActivityStatus.fromObject({ stationary: true });
            let activity = POGOProtos.Networking.Envelopes.Signature.ActivityStatus.toObject(pActivity, { defaults: true });
            activity = this.decoder.fixLongAndBuffer(activity);
            if (!_.isEqual(activity, signature.activity_status)) {
                this.issues.push({
                    type: 'signature',
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
                        type: 'signature',
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
                        type: 'signature',
                        file,
                        issue: 'unexpected info in device_info',
                        more: JSON.stringify(di, null, 2),
                    });
                }
            } else {
                this.issues.push({
                    type: 'signature',
                    file,
                    issue: 'no device_info found',
                });
            }
            // location fix
            if (signature.location_fix && signature.location_fix.length > 0) {
                const wrong = _.filter(<any[]>signature.location_fix, lc => lc.provider !== 'fused' ||
                    lc.location_type !== '1' || lc.floor !== 0  || lc.provider_status !== '3');
                if (wrong.length > 0) {
                    this.issues.push({
                        type: 'signature',
                        file,
                        issue: 'unexpected value in location_fix',
                        more: JSON.stringify(wrong, null, 2),
                    });
                }
            } else {
                this.issues.push({
                    type: 'signature',
                    file,
                    issue: 'no location_fix found',
                });
            }
            // sensor info
            if (!signature.sensor_info || signature.sensor_info.length !== 1) {
                const found = !signature.sensor_info ? 0 : signature.sensor_info.length;
                this.issues.push({
                    type: 'signature',
                    file,
                    issue: `exactly one sensor_info is expected, ${found} found`,
                });
            } else if (signature.sensor_info[0].status !== 3) {
                this.issues.push({
                    type: 'signature',
                    file,
                    issue: `sensor_info.status == ${signature.sensor_info.status} (3 was expected)`,
                });
            }
        }
    }

    async checkSignatureMissingFields(file: string, request) {
        const content = await fs.readFile(`data/${this.state.session}/${file}`, 'utf8');
        const data = JSON.parse(content);
        if (data.endpoint !== '/plfe/version') {
            const RequestEnvelope = POGOProtos.Networking.Envelopes.RequestEnvelope;
            const request = RequestEnvelope.decode(Buffer.from(data.data, 'base64'));
            // check signature
            let signature = _.find(<any[]>request.platform_requests, r => r.type === POGOProtos.Networking.Platform.PlatformRequestType.SEND_ENCRYPTED_SIGNATURE);
            if (signature) {
                const message = POGOProtos.Networking.Platform.Requests.SendEncryptedSignatureRequest.decode(signature.request_message);
                const decrypted = pcrypt.decrypt(message.encrypted_signature);
                signature = POGOProtos.Networking.Envelopes.Signature.decode(decrypted);
                if (signature.__unknownFields) {
                    const num = signature.__unknownFields.length;
                    this.issues.push({
                        type: 'signature',
                        file,
                        issue: `${num} unknown field(s) found in signature`,
                    });
                }
            }
            // check other platform request
            const known = [
                POGOProtos.Networking.Platform.PlatformRequestType.SEND_ENCRYPTED_SIGNATURE,
                POGOProtos.Networking.Platform.PlatformRequestType.UNKNOWN_PTR_8,
                POGOProtos.Networking.Platform.PlatformRequestType.GET_STORE_ITEMS,
                POGOProtos.Networking.Platform.PlatformRequestType.JOIN_EVENT,
            ];
            const unknown = _.filter(<any[]>request.platform_requests, r => !_.includes(known, r.type));
            if (unknown.length > 0) {
                this.issues.push({
                    type: 'envelop',
                    file,
                    issue: 'unknown platform request has been found',
                    more: _.trimEnd(unknown.map(ptfm => ptfm.type).join(', '), ', '),
                });
            }
        }
    }

    checkApiCommon(file: string, request) {
        const state = this.state.common;
        const reqId = Long.fromString(request.request_id, true, 16).low;
        if (state.first && request.requests.length === 0) {
            state.first = false;
            // ok
            return;
        }
        state.first = false;
        const requestName = request.requests.length > 0 ? request.requests[0].request_name : undefined;
        if (state.login && requestName === 'GET_MAP_OBJECTS') {
            state.login = false;
        }

        if (state.login && request.requests.length === 1 && requestName === 'GET_PLAYER') {
            // ok
            return;
        }
        if (request.requests.length === 0) {
            if (_.some(<any[]>request.platform_requests, ptm => ptm.request_name === 'GET_STORE_ITEMS')) {
                // ok
                return;
            }
        } else if (request.requests.length < 6) {
            this.issues.push({
                type: 'api',
                file,
                issue: `number of requests too short (${request.requests.length})`,
                more: _.trimEnd(request.requests.map(r => r.request_name).join(', '), ', '),
            });
        } else if (state.login) {
            // in login flow
            const expected = [
                'CHECK_CHALLENGE',
                'GET_HATCHED_EGGS',
                'GET_INVENTORY',
                'CHECK_AWARDED_BADGES',
                'DOWNLOAD_SETTINGS',
            ];
            if (requestName === 'GET_PLAYER_PROFILE') {
                expected.push('GET_BUDDY_WALKED');
            } else if (requestName === 'LEVEL_UP_REWARDS') {
                expected.push('GET_BUDDY_WALKED');
                expected.push('GET_INBOX');
            } else if (requestName === 'MARK_TUTORIAL_COMPLETE' ||
                       requestName === 'SET_AVATAR' ||
                       requestName === 'LIST_AVATAR_CUSTOMIZATIONS') {
                expected.pop();
            }
            const common = _.drop(request.requests.map(r => r.request_name));
            if (!_.isEqual(expected, common)) {
                const strExpected = _.trimEnd(expected.join(', '), ', ');
                const strCommon = _.trimEnd(common.join(', '), ', ');
                this.issues.push({
                    type: 'api',
                    file,
                    issue: `common requests are not as expected during login flow for request ${requestName}`,
                    more: `got ${strCommon},\nexpected was ${strExpected}`,
                });
            }

        } else {
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
                    type: 'api',
                    file,
                    issue: `common requests are not as expected for request ${requestName}`,
                    more: `got ${strCommon},\nexpected was ${strExpected}`,
                });
            }
        }
    }

    async buildReport(): Promise<string> {
        const output = `data/${this.state.session}/analysis.html`;
        if (this.issues.length === 0) {
            logger.info('No issue found.');
            if (await fs.exists(output)) {
                await fs.unlink(output);
            }
            return undefined;
        } else {
            logger.info(`${this.issues.length} issues found.`);
            const template = mustachio.string(await fs.readFile('./templates/analysis.mu.html', 'utf8'));
            const categories = _.values(_.mapValues(_.countBy(this.issues, 'type'), (value, key) => ({name: key, count: value})));
            const rendering = template.render({
                session: this.state.session,
                categories,
                issues: this.issues,
            });
            const html = await rendering.string();
            await fs.writeFile(output, html, 'utf8');
            logger.info('Report generated in %s', output);
            return output;
        }
    }
}

if (require.main === module) {
    if (process.argv.length < 3) {
        logger.error('usage: node ./bin/analys.js <session name>');
    } else {
        const folder = process.argv[2];
        const analysis = new Analysis();
        analysis.run(folder)
        .then(num => {
            logger.info('%s file(s) analysed.', num);
            process.exit();
        })
        .catch(e => logger.error(e));
    }
}