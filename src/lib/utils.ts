import * as os from 'os';
import * as fs from 'fs-promise';
import * as moment from 'moment';
import * as _ from 'lodash';

import Config from './config';

export default class Utils {
    config: any;

    constructor(config) {
        this.config = config;
    }

    getIp(): string {
        let ips: any = os.networkInterfaces();
        ips = _.filter(ips, (i, name) => !/(loopback|vmware|internal)/gi.test(name));


        let ipv4 = _(os.networkInterfaces())
                .filter((i, name) => !/(loopback|vmware|internal)/gi.test(name))
                .flatten().filter(ip => !ip.internal && ip.family == 'IPv4').first();

        return ipv4.address;
    }

    async initFolders() {
        await this.cleanDataFolders();
        await this.createCurrentFolder();
    }

    async createCurrentFolder() {
        this.config.datadir = 'data/' + moment().format('YYYYMMDD.HHmmss');
        await fs.mkdir(this.config.datadir);
    }

    async getSessionFolders(): Promise<string[]> {
        let content: string[] = await fs.readdir('data');
        let files = _.filter(content, file => {
            let stat = await fs.stat('data/' + file);
            return stat.isDirectory();
        });
        return _.sortBy(files);
    }

    async cleanDataFolders(): Promise<void> {
        try {
            await fs.mkdir('data');
        } catch(e) {}

        let folders = await this.getSessionFolders();
        folders = _.filter(folders, dir => {
            let content = await fs.readdir(`data/${dir}`);
            return content.length == 0;
        });

        _.map(folders, dir => {
            await fs.rmdir(`data/${dir}`);
        });
    }
}
