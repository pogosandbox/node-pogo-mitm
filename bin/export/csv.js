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
const libcsv_1 = require("./libcsv");
function exportCsv() {
    return __awaiter(this, void 0, void 0, function* () {
        let csv = new libcsv_1.default();
        yield csv.exportRequestsSignature();
        logger.info('Done.');
        process.exit();
    });
}
exportCsv().catch(e => logger.error(e));
//# sourceMappingURL=csv.js.map