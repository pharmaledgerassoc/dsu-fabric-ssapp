import constants from "../constants.js";
import {getPermissionsWatcher} from "../services/PermissionsWatcher.js";
import utils from "../utils.js";

const openDSU = require("opendsu");
const w3cDID = openDSU.loadAPI("w3cdid");
const scAPI = openDSU.loadAPI("sc");

const {FwController} = WebCardinal.controllers;
export default class LandingPageController extends FwController {
  constructor(...props) {
    super(...props);
    this.initPermissionsWatcher = () => {
    };
    const openDSU = require("opendsu");
    const w3cDID = openDSU.loadAPI("w3cdid");
    const scAPI = openDSU.loadAPI("sc");

    scAPI.getMainEnclave(async (err, mainEnclave) => {
      if (err) {
        this.notificationHandler.reportUserRelevantError("Failed to initialize wallet", err);
        setTimeout(() => {
          window.disableRefreshSafetyAlert = true;
          window.location.reload()
        }, 2000)
        return;
      }

      try {
        this.mainDSU = await $$.promisify(scAPI.getMainDSU)();
      } catch (e) {
        this.notificationHandler.reportUserRelevantError("Failed to initialize wallet", err);
        setTimeout(() => {
          window.disableRefreshSafetyAlert = true;
          window.location.reload()
        }, 2000)
        return;
      }

      this.mainEnclave = mainEnclave;
      let did;
      try {
        did = await scAPI.getMainDIDAsync();
      } catch (e) {
        // TODO check error type to differentiate between business and technical error
        // this.notificationHandler.reportDevRelevantInfo("DID not yet created", e);
      }

      let shouldPersist = false;
      if (!did) {
        did = await this.createDID();
        shouldPersist = true;
      }

      getPermissionsWatcher(did, () => {
        const {navigateToPageTag} = WebCardinal.preload;
        let skipPages = ["generate-did", "landing-page"];
        if (skipPages.indexOf(WebCardinal.state.page.tag) >= 0) {
          navigateToPageTag("home");
        }
      });


      if(!shouldPersist){
        return;
      }

      let batchId;
      try {
        batchId = await this.mainEnclave.startOrAttachBatchAsync();
        await scAPI.setMainDIDAsync(did);
        await this.mainEnclave.commitBatchAsync(batchId);
      } catch (e) {
        const writeKeyError = createOpenDSUErrorWrapper(`Failed to write key`, e);
        try {
          await this.mainEnclave.cancelBatchAsync(batchId);
        } catch (error) {
          throw createOpenDSUErrorWrapper(`Failed to cancel batch`, error, writeKeyError);
        }
        throw writeKeyError;
      }
    })
  }

  async createDID() {
    const userDetails = await utils.getUserDetails();
    const vaultDomain = await $$.promisify(scAPI.getVaultDomain)();
    const openDSU = require("opendsu");
    const config = openDSU.loadAPI("config");
    let appName = await $$.promisify(config.getEnv)("appName");
    let userId = `${appName}/${userDetails.username}`;
    let did;
    let i = 1;
    do {
      try {
        did = await $$.promisify(w3cDID.resolveDID)(`did:ssi:name:${vaultDomain}:${userId}`);
      } catch (e) {
        did = null;
      }
      if (did) {
        userId = userId + i++;
      }
    } while (did)

    did = await $$.promisify(w3cDID.createIdentity)("ssi:name", vaultDomain, userId);
    return did.getIdentifier();
  }
}
