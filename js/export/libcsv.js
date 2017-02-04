let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let json2csv = require('json2csv');
const geolib = require('geolib');
import Utils from './../lib/utils';
import Config from './../lib/config';
import Decoder from './../lib/decoder.js';
export default class Csv {
    constructor(config) {
        this.config = config || new Config().load();
        this.utils = new Utils(this.config);
        this.decoder = new Decoder(this.config);
    }
    distance(from, to) {
        return geolib.getDistance(from, to, 1, 1);
    }
    exportRequestsSignature(filename) {
        return this.utils.cleanDataFolders()
            .then(() => this.utils.getSessionFolders())
            .then(folders => {
            // parse all session folder and get only requests
            return Promise.map(folders, folder => {
                return fs.readdirAsync(`data/${folder}`)
                    .then(files => _.filter(files, file => _.endsWith(file, '.req.bin')))
                    .then(files => _.map(files, file => {
                    return {
                        session: folder,
                        request: _.trimEnd(file, '.req.bin'),
                        file: folder + '/' + file,
                    };
                }));
            });
        })
            .then(folders => _.flatten(folders))
            .then(folders => {
            return Promise.map(folders, folder => {
                if (fs.existsSync(`data/${folder.session}/.info`)) {
                    return fs.readFileAsync(`data/${folder.session}/.info`, 'utf8')
                        .then(content => {
                        folder.info = content;
                        return folder;
                    });
                }
                else {
                    return folder;
                }
            });
        })
            .then(files => {
            // we now have an array of files with requests dump, let's decrypt
            return Promise.map(files, file => {
                return this.decoder.decodeRequest(file.session, file.request)
                    .then(request => {
                    let signature = _.find(request.decoded.platform_requests, r => r.request_name == 'SEND_ENCRYPTED_SIGNATURE');
                    return {
                        request: request,
                        signature: (!signature || typeof signature.message == 'string') ? null : signature.message,
                    };
                })
                    .then(request => {
                    let apiCall = 'NONE';
                    if (request.request.decoded.requests && request.request.decoded.requests.length > 0) {
                        apiCall = _.first(request.request.decoded.requests).request_name;
                    }
                    let ptr8 = _.find(request.request.decoded.platform_requests, r => r.type == 8);
                    if (ptr8) {
                        ptr8 = ptr8.message.message || 'true';
                    }
                    let versionHash = '';
                    if (request.signature)
                        versionHash = '="' + request.signature.unknown25.toString() + '"';
                    let loginType = '';
                    let uk2 = '';
                    if (request.request.decoded.auth_info) {
                        loginType = request.request.decoded.auth_info.provider;
                        uk2 = request.request.decoded.auth_info.token.unknown2;
                    }
                    return {
                        request_id: '="' + request.request.decoded.request_id + '"',
                        loginType: loginType,
                        uk2: uk2,
                        session: file.session,
                        info: file.info,
                        request: file.request,
                        apiCall: apiCall,
                        ptr8: ptr8,
                        version_hash: versionHash,
                        signature: request.signature,
                        fullRequest: request.request.decoded,
                    };
                });
            });
        })
            .then(signatures => _.filter(signatures, s => s.signature != null))
            .then(datas => {
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
            return datas;
        })
            .then(data => this.dumpAllSignatures(data, filename));
    }
    dumpAllSignatures(signatures, file = 'requests.signatures.csv') {
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
        return fs.writeFileAsync(`data/${file}`, csv, 'utf8')
            .then(() => file);
    }
}
//# sourceMappingURL=libcsv.js.map