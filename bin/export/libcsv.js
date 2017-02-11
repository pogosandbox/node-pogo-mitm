"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const logger = require("winston");
const fs = require("fs-promise");
const _ = require("lodash");
const Bluebird = require("Bluebird");
let json2csv = require('json2csv');
const geolib = require('geolib');
const utils_1 = require("./../lib/utils");
const config_1 = require("./../lib/config");
const decoder_js_1 = require("./../lib/decoder.js");
class Csv {
    constructor(config) {
        this.config = config || new config_1.default().load();
        this.utils = new utils_1.default(this.config);
        this.decoder = new decoder_js_1.default(this.config);
    }
    distance(from, to) {
        return geolib.getDistance(from, to, 1, 1);
    }
    exportRequestsSignature(filename) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.utils.cleanDataFolders();
            let folders = yield this.utils.getSessionFolders();
            let sessionsArOfAr = yield Bluebird.map(folders, (folder) => __awaiter(this, void 0, void 0, function* () {
                let files = yield fs.readdir(`data/${folder}`);
                files = _.filter(files, file => _.endsWith(file, '.req.bin'));
                return _.map(files, file => {
                    return {
                        session: folder,
                        request: _.trimEnd(file, '.req.bin'),
                        file: folder + '/' + file,
                        info: '',
                    };
                });
            }));
            let requests = _.flatten(sessionsArOfAr);
            Bluebird.each(requests, (request) => __awaiter(this, void 0, void 0, function* () {
                let exists = yield fs.exists(`data/${request.session}/.info`);
                if (exists) {
                    request.info = yield fs.readFile(`data/${request.session}/.info`, 'utf8');
                }
            }));
            // we now have an array of files with requests dump, let's decrypt
            let signatures = yield Bluebird.map(requests, (file) => __awaiter(this, void 0, void 0, function* () {
                let request = yield this.decoder.decodeRequest(file.session, file.request);
                let signature = _.find(request.decoded.platform_requests, r => r.request_name === 'SEND_ENCRYPTED_SIGNATURE');
                signature = (!signature || typeof signature.message === 'string') ? null : signature.message;
                let apiCall = 'NONE';
                if (request.decoded.requests && request.decoded.requests.length > 0) {
                    apiCall = _.first(request.decoded.requests).request_name;
                }
                let ptr8 = _.find(request.decoded.platform_requests, r => r.type === 8);
                if (ptr8) {
                    ptr8 = ptr8.message.message || 'true';
                }
                let versionHash = '';
                if (signature)
                    versionHash = '="' + signature.unknown25.toString() + '"';
                let loginType = '';
                let uk2 = '';
                if (request.decoded.auth_info) {
                    loginType = request.decoded.auth_info.provider;
                    uk2 = request.decoded.auth_info.token.unknown2;
                }
                return {
                    request_id: '="' + request.decoded.request_id + '"',
                    loginType: loginType,
                    uk2: uk2,
                    session: file.session,
                    info: file.info,
                    request: file.request,
                    apiCall: apiCall,
                    ptr8: ptr8,
                    version_hash: versionHash,
                    signature: signature,
                    fullRequest: request.decoded,
                };
            }));
            signatures = _.filter(signatures, s => s.signature != null);
            // if (datas.length > 0) {
            //     let prevPos = {latitude: datas[0].fullRequest.latitude, longitude: datas[0].fullRequest.longitude};
            //     let prevTime = +datas[0].signature.timestamp_since_start;
            //     _(datas).each(data => {
            //         data.distFromPrev = this.distance(prevPos, data.fullRequest);
            //         data.timeFromPrev = +data.signature.timestamp_since_start - prevTime;
            //         prevPos = {latitude: data.fullRequest.latitude, longitude: data.fullRequest.longitude};
            //         prevTime = +data.signature.timestamp_since_start;
            //     });
            // }
            return yield this.dumpAllSignatures(signatures, filename);
        });
    }
    dumpAllSignatures(signatures, file = 'requests.signatures.csv') {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info('Dumping signature info...');
            let csv = json2csv({
                data: signatures,
                fields: [
                    'request_id',
                    'session',
                    'info',
                    // 'loginType',
                    // 'uk2',
                    'request',
                    'apiCall',
                    'ptr8',
                    'version_hash',
                    // 'timeFromPrev',
                    // 'distFromPrev',
                    'signature.device_info.device_brand',
                    'signature.device_info.device_model',
                    'signature.device_info.device_model_boot',
                    'signature.device_info.hardware_manufacturer',
                    'signature.device_info.hardware_model',
                    'signature.device_info.firmware_brand',
                    'signature.device_info.firmware_type',
                    'signature.location_fix.length',
                    'signature.location_fix[0].provider',
                    'signature.location_fix[0].altitude',
                    'signature.location_fix[0].latitude',
                    'signature.location_fix[0].longitude',
                    'signature.location_fix[0].speed',
                    'signature.location_fix[0].course',
                    'signature.location_fix[0].horizontal_accuracy',
                    'signature.location_fix[0].vertical_accuracy',
                    'signature.location_fix[0].provider_status',
                    'signature.location_fix[0].floor',
                    'signature.location_fix[0].location_type',
                    'signature.sensor_info[0].linear_acceleration_x',
                    'signature.sensor_info[0].linear_acceleration_y',
                    'signature.sensor_info[0].linear_acceleration_z',
                    'signature.sensor_info[0].magnetic_field_x',
                    'signature.sensor_info[0].magnetic_field_y',
                    'signature.sensor_info[0].magnetic_field_z',
                    'signature.sensor_info[0].magnetic_field_accuracy',
                    'signature.sensor_info[0].attitude_pitch',
                    'signature.sensor_info[0].attitude_yaw',
                    'signature.sensor_info[0].attitude_roll',
                    'signature.sensor_info[0].rotation_rate_x',
                    'signature.sensor_info[0].rotation_rate_y',
                    'signature.sensor_info[0].rotation_rate_z',
                    'signature.sensor_info[0].gravity_x',
                    'signature.sensor_info[0].gravity_y',
                    'signature.sensor_info[0].gravity_z',
                    // 'signature.activity_status.unknown_status',
                    // 'signature.activity_status.walking',
                    // 'signature.activity_status.running',
                    'signature.activity_status.stationary',
                ],
                del: this.config.export.csv.separator,
            });
            yield fs.writeFile(`data/${file}`, csv, 'utf8');
            return file;
        });
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Csv;
//# sourceMappingURL=libcsv.js.map