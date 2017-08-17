import * as logger from 'winston';
import * as fs from 'mz/fs';
import * as _ from 'lodash';
import * as Bluebird from 'bluebird';

const json2csv = require('json2csv');
const geolib = require('geolib');

import Utils from './../lib/utils';
import Config from './../lib/config';
import Decoder from './../lib/decoder.js';

export default class Csv {
    config: any;
    utils: Utils;
    decoder: Decoder;

    constructor(config?: any) {
        this.config = config || new Config().load();
        this.utils = new Utils(this.config);
        this.decoder = new Decoder(this.config);
    }

    distance(from: any, to: any): number {
        return geolib.getDistance(from, to, 1, 1);
    }

    async exportRequestsSignature(filename?: string): Promise<string> {
        await this.utils.cleanDataFolders();
        const folders = await this.utils.getSessionFolders();

        const sessionsArOfAr = await Bluebird.map(folders, async folder => {
            let files = await fs.readdir(`data/${folder}`) as string[];
            files = _.filter(files, file => _.endsWith(file, '.req.bin'));
            return _.map(files, file => {
                                            return {
                                                session: folder,
                                                request: _.trimEnd(file, '.req.bin'),
                                                file: folder + '/' + file,
                                                info: '',
                                            };
                                        });
        });

        const requests = _.flatten(sessionsArOfAr);

        await Bluebird.each(requests, async request => {
            const exists = await fs.exists(`data/${request.session}/.info`);
            if (exists) {
                request.info = await fs.readFile(`data/${request.session}/.info`, 'utf8');
            }
        });

        // we now have an array of files with requests dump, let's decrypt
        let signatures = await Bluebird.map(requests, async file => {
            const request = await this.decoder.decodeRequest(file.session, file.request);
            let signature = _.find(<any[]>request.decoded.platform_requests, r => r.request_name === 'SEND_ENCRYPTED_SIGNATURE');
            signature = (!signature || typeof signature.message === 'string') ? null : signature.message;

            let apiCall = 'NONE';
            if (request.decoded.requests && request.decoded.requests.length > 0) {
                apiCall = _.first(<any[]>request.decoded.requests).request_name;
            }

            let ptr8 = _.find(<any[]>request.decoded.platform_requests, r => r.type === 8);
            if (ptr8) {
                ptr8 = ptr8.message ? ptr8.message.message || 'true' : 'true';
            }

            let versionHash = '';
            if (signature) versionHash = '="' + signature.unknown25.toString() + '"';

            let loginType = '';
            let uk2 = '';
            if (request.decoded.auth_info) {
                loginType = request.decoded.auth_info.provider;
                uk2 = request.decoded.auth_info.token.unknown2;
            }

            const lastLocFix = signature != null && signature.location_fix ? signature.location_fix[signature.location_fix.length - 1] : '';

            return {
                request_id: '="' + request.decoded.request_id + '"',
                loginType,
                uk2,
                session: file.session,
                info: file.info,
                request: file.request,
                apiCall,
                ptr8,
                version_hash: versionHash,
                latitude: request.decoded.latitude,
                longitude: request.decoded.longitude,
                accuracy: request.decoded.accuracy,
                signature,
                lastLocFix,
                fullRequest: request.decoded,
            };
        });

        signatures = _.filter(<any[]>signatures, s => s.signature != null);

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

        return await this.dumpAllSignatures(signatures, filename);
    }

    async dumpAllSignatures(signatures: any[], file = 'requests.signatures.csv'): Promise<string> {
        logger.info('Dumping signature info...');
        const csv = json2csv({
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
                'latitude',
                'longitude',
                'accuracy',
                'signature.device_info.device_brand',
                'signature.device_info.device_model',
                'signature.device_info.device_model_boot',
                'signature.device_info.hardware_manufacturer',
                'signature.device_info.hardware_model',
                'signature.device_info.firmware_brand',
                'signature.device_info.firmware_type',
                'signature.location_fix.length',
                'lastLocFix.provider',
                'lastLocFix.altitude',
                'lastLocFix.latitude',
                'lastLocFix.longitude',
                'lastLocFix.speed',
                'lastLocFix.course',
                'lastLocFix.horizontal_accuracy',
                'lastLocFix.vertical_accuracy',
                'lastLocFix.provider_status',
                'lastLocFix.floor',
                'lastLocFix.location_type',
                'signature.sensor_info.length',
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
                // 'signature.activity_status.automotive',
                // 'signature.activity_status.tilting',
                // 'signature.activity_status.cycling',
            ],
            del: this.config.export.csv.separator,
        });

        await fs.writeFile(`data/${file}`, csv, 'utf8');
        return file;
    }
}
