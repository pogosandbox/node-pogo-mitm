import * as fs from 'fs';
import * as Forge from 'node-forge';

const ServerAttrs = [{
    name: 'countryName',
    value: 'Internet'
}, {
    shortName: 'ST',
    value: 'Internet'
}, {
    name: 'localityName',
    value: 'Internet'
}, {
    name: 'organizationName',
    value: 'Niantic, Inc.'
// }, {
//     shortName: 'OU',
//     value: 'Node MITM Proxy Server Certificate'
}];

const ServerExtensions: any = [{
    name: 'basicConstraints',
    cA: false
}, {
    name: 'keyUsage',
    keyCertSign: false,
    digitalSignature: true,
    nonRepudiation: false,
    keyEncipherment: true,
    dataEncipherment: true
}, {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
    codeSigning: false,
    emailProtection: false,
    timeStamping: false
}, {
    name: 'nsCertType',
    client: true,
    server: true,
    email: false,
    objsign: false,
    sslCA: false,
    emailCA: false,
    objCA: false
}, {
    name: 'subjectKeyIdentifier'
}];

export default class MyCerts {
    myCertGenerator(ca, hosts: any[], cb) {
        if (typeof(hosts) === 'string') hosts = [hosts];
        const mainHost = hosts[0];
        const keysServer = Forge.pki.rsa.generateKeyPair(1024);
        const certServer = Forge.pki.createCertificate();
        certServer.publicKey = keysServer.publicKey;
        certServer.serialNumber = this.randomSerialNumber();
        certServer.validity.notBefore = new Date();
        certServer.validity.notBefore.setDate(certServer.validity.notBefore.getDate() - 1);
        certServer.validity.notAfter = new Date();
        certServer.validity.notAfter.setFullYear(certServer.validity.notBefore.getFullYear() + 2);
        const attrsServer = ServerAttrs.slice(0);
        attrsServer.unshift({
          name: 'commonName',
          value: mainHost
        });
        certServer.setSubject(attrsServer);
        certServer.setIssuer(ca.CAcert.issuer.attributes);
        certServer.setExtensions(ServerExtensions.concat([{
            name: 'subjectAltName',
            altNames: hosts.map(function(host) {
                if (host.match(/^[\d\.]+$/)) {
                    return { type: 7, ip: host };
                }
                return { type: 2, value: host };
            })
        }]));
        certServer.sign(ca.CAkeys.privateKey, Forge.md.sha256.create());
        const certPem = Forge.pki.certificateToPem(certServer);
        const keyPrivatePem = Forge.pki.privateKeyToPem(keysServer.privateKey);
        const keyPublicPem = Forge.pki.publicKeyToPem(keysServer.publicKey);
        fs.writeFile(ca.certsFolder + '/' + mainHost.replace(/\*/g, '_') + '.pem', certPem, function(error) {
          if (error) console.error('Failed to save certificate to disk in ' + ca.certsFolder, error);
        });
        fs.writeFile(ca.keysFolder + '/' + mainHost.replace(/\*/g, '_') + '.key', keyPrivatePem, function(error) {
          if (error) console.error('Failed to save private key to disk in ' + ca.keysFolder, error);
        });
        fs.writeFile(ca.keysFolder + '/' + mainHost.replace(/\*/g, '_') + '.public.key', keyPublicPem, function(error) {
          if (error) console.error('Failed to save public key to disk in ' + ca.keysFolder, error);
        });
        // returns synchronously even before files get written to disk
        cb(certPem, keyPrivatePem);
    }

    randomSerialNumber() {
        // generate random 16 bytes hex string
        let sn = '';
        for (let i = 0; i < 4; i++) {
            sn += ('00000000' + Math.floor(Math.random() * Math.pow(256, 4)).toString(16)).slice(-8);
        }
        return sn;
    }
}