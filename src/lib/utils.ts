import * as os from 'os';
import * as fs from 'fs-promise';
import * as moment from 'moment';
import * as _ from 'lodash';
import * as Bluebird from 'bluebird';

import Config from './config';

export default class Utils {
    config: any;

    constructor(config) {
        this.config = config;
    }

    getIp(): string {
        // typing is bad but I can't find a way to make it works
        let ipv4: any = _(os.networkInterfaces())
                .filter((i, name) => !/(loopback|vmware|internal)/gi.test(name))
                .flatten().filter(ip => !(<any>ip).internal && (<any>ip).family === 'IPv4').first();
        return ipv4.address;
    }

    async initFolders() {
        await this.cleanDataFolders();
        await this.createCurrentFolder();
    }

    async createCurrentFolder() {
        if (this.config.proxy.active) {
            this.config.datadir = 'data/' + moment().format('YYYYMMDD.HHmmss');
            await fs.mkdir(this.config.datadir);
        }
    }

    async getSessionFolders(): Promise<string[]> {
        let content: string[] = await fs.readdir('data');
        let files = await Bluebird.filter(content, async file => {
            let stat = await fs.stat('data/' + file);
            return stat.isDirectory() && !file.startsWith('.');
        });
        return _.sortBy(files);
    }

    async cleanDataFolders(): Promise<void> {
        try {
            await fs.mkdir('data');
        } catch (e) {}

        let folders = await this.getSessionFolders();
        folders = await Bluebird.filter(folders, async dir => {
            let content = await fs.readdir(`data/${dir}`);
            return content.length === 0;
        });

        await Bluebird.map(folders, async dir => {
            await fs.rmdir(`data/${dir}`);
        });
    }
}
