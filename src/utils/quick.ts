import * as fs from 'mz/fs';
import * as path from 'path';

async function handleFolder(folder) {
    let files = await fs.readdir(folder);
    files = files.filter(f => f.endsWith('.res.bin'));
    for (let file of files) {
        let data = Buffer.from(await fs.readFile(path.join(folder, file), 'utf8'), 'base64');
        try {
            console.log(`${data[0].toString(16)} ${data[1].toString(16)} ${data[2].toString(16)}`);
        } catch (e) {
            console.error(e);
        }
    }
}

async function main() {
    let folders = await fs.readdir('data');
    for (let folder of folders) {
        await handleFolder(path.join('data', folder));
    }
}

main()
.then(() => console.log('done.'))
.catch(e => console.error(e));
