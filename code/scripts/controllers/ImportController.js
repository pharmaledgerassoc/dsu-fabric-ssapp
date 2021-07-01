import utils from "../utils.js";
import getSharedStorage from "../services/SharedDBStorageService.js";
import HolderService from "../services/HolderService.js";

const mappings = require("epi-utils").loadApi("mappings");
const MessagesPipe = require("epi-utils").getMessagesPipe();
const {WebcController} = WebCardinal.controllers;
const model = {
  selectedTab: 0,
  filesChooser: {
    label: "Select files",
    accept: "json",
    listFiles: true,
    filesAppend: true,
    "event-name": "uploadProducts",
    "list-files": true
  },
  importIsDisabled: true,
  retryBtnIsDisabled:true,
  successfullyImportedLogs: [],
  failedImportedLogs: [],
  retryAll: false,
}
export default class importController extends WebcController {
  constructor(...props) {

    super(...props);
    this.filesArray = [];
    this.model = model;

    this.on('uploadProducts', (event) => {
      this.filesArray = event.data || [];
      this.model.importIsDisabled = this.filesArray.length === 0;
    });

    this.onTagClick("import", async () => {
      if (this.filesArray.length === 0) {
        return;
      }
      let messages = await this.getMessagesFromFiles(this.filesArray);
      await this.processMessages(messages);
    });

    this.onTagClick("view-message", (model, target, event) => {
      const formattedJSON = JSON.stringify(model.message, null, 4);
      this.model.actionModalModel = {
        title: "Message",
        messageData: formattedJSON,
        denyButtonText: 'Close',
        acceptButtonText: "Download"
      }

      this.showModalFromTemplate('view-message-modal',
        () => {
          let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(formattedJSON);
          let downloadAnchorNode = document.createElement('a');
          downloadAnchorNode.setAttribute("href", dataStr);
          downloadAnchorNode.setAttribute("download", model.itemType + "_" + model.itemCode + ".json");
          document.body.appendChild(downloadAnchorNode); // required for firefox
          downloadAnchorNode.click();
          downloadAnchorNode.remove();
        }, () => {
          return
        }, {model: this.model});
    })

    this.model.onChange("retryAll", (event) => {
      this.querySelectorAll(".failed-message").forEach((elem) => {
        elem.checked = this.model.retryAll
      });

      this.model.failedImportedLogs.forEach(elem => {
        elem.retry = this.model.retryAll;
      });
    });

    this.onTagClick("retry-failed", async (model, target, event) => {
      let messages = [];
      this.model.failedImportedLogs.forEach(elem => {
        if (elem.retry) {
          messages.push(elem.message);
        }
      });
      if (messages.length > 0) {
        this.model.selectedTab = 1;
        await this.processMessages(messages);
        this.model.retryAll = false;
        this.querySelector("#retry-all-checkbox").checked = false;
      }
    })
    this.getImportLogs();

    this.model.onChange("failedImportedLogs",()=>{
      this.model.retryBtnIsDisabled = !this.model.failedImportedLogs.some(failedLog=> failedLog.retry === true)
    })
  }

  async getMessagesFromFiles(files) {
    let messages = [];
    let filesRead = 0;

    return new Promise((resolve, reject) => {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];

        let fileReader = new FileReader();
        fileReader.readAsText(file, "UTF-8");

        fileReader.onload = function (evt) {
          let message;
          try {
            message = JSON.parse(evt.target.result);
          } catch (e) {
            throw new Error("Message should be an object: " + e.message);
          }
          //TODO discuss if files can contain more than one message/product
          if (Array.isArray(message)) {
            for (let i = 0; i < message.length; i++) {
              messages.push(message[i]);
            }
          } else {
            messages.push(message);
          }
          filesRead++;
          if (filesRead === files.length) {
            resolve(messages);
          }
        }

        fileReader.onerror = function (evt) {
          throw new Error("Error reading file")
        }
      }
    })
  }

  async processMessages(messages) {
    const LogService = require("epi-utils").loadApi("services").LogService
    let logService = new LogService(this.DSUStorage);

    let mappingEngine;
    try {
      const holderService = HolderService.getHolderService();
      const holderInfo = await $$.promisify(holderService.ensureHolderInfo.bind(holderService.ensureHolderInfo))();
      mappingEngine = mappings.getEPIMappingEngine(this.DSUStorage, {
        holderInfo: holderInfo,
        logService: logService
      });
    } catch (e) {
      printOpenDSUError(createOpenDSUErrorWrapper("Invalid configuration detected!", e));
      this.showErrorModalAndRedirect("Invalid configuration detected! Configure your wallet properly in the Holder section!", "import");
    }

    try {

      window.WebCardinal.loader.hidden = false;

      const MessageQueuingService = require("epi-utils").loadApi("services").getMessageQueuingServiceInstance();
      let messagesPipe = new MessagesPipe(30, 2 * 1000, MessageQueuingService.getNextMessagesBlock);

      messagesPipe.onNewGroup(async (groupMessages) => {
        let undigestedMessages = await mappingEngine.digestMessages(groupMessages);

        console.log(undigestedMessages);
        window.WebCardinal.loader.hidden = true;
        this.getImportLogs();

        if (undigestedMessages.length === 0) {
          this.model.setChainValue("selectedTab", 0);
        } else {
          this.model.setChainValue("selectedTab", 1)
        }
      })

      messagesPipe.addInQueue(messages);

    } catch (err) {
      console.log("Error on digestMessages", err);
    }
  }

  getImportLogs() {
    let successfullyImportedLogs = [];
    let failedImportedLogs = [];
    const storageService = getSharedStorage(this.DSUStorage);
    const getMappingLogs = require("epi-utils").loadApi("mappings").getMappingLogs(storageService);
    getMappingLogs((err, importLogs) => {
      if (err) {
        console.log(err);
      }
      let now = Date.now();
      importLogs.forEach(log => {
        if (log.message) {
          log.timeAgo = utils.timeAgo(log.timestamp)
          log.isFresh = now - log.timestamp < 60 * 1000;
          if (log.status === "success") {
            successfullyImportedLogs.push(log);
          } else {
            log.retry = false;
            log.itemId = log.itemCode + '_' + log.timestamp
            failedImportedLogs.push(log);
          }
        }
      });

      this.model.successfullyImportedLogs = successfullyImportedLogs.reverse();
      this.model.failedImportedLogs = failedImportedLogs.reverse();
    });
  }
}


