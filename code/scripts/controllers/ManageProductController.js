import {getCommunicationService} from "../services/CommunicationService.js";
import Product from '../models/Product.js';
import MessagesService from '../services/MessagesService.js';
import Languages from "../models/Languages.js";
import constants from '../constants.js';
import getSharedStorage from '../services/SharedDBStorageService.js';
import utils from "../utils.js";
import LeafletService from "../services/LeafletService.js";
import Countries from "../models/Countries.js";


const {WebcController} = WebCardinal.controllers;
const mappings = require("gtin-resolver").loadApi("mappings");
const gtinResolverUtils = require("gtin-resolver").getMappingsUtils();
const arrayBufferToBase64 = gtinResolverUtils.arrayBufferToBase64;
const LogService = require("gtin-resolver").loadApi("services").LogService;
const ModelMessageService = require("gtin-resolver").loadApi("services").ModelMessageService;
const gtinMultiplicationArray = [3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3];
const gtinResolver = require("gtin-resolver");

export default class ManageProductController extends WebcController {
  constructor(...props) {
    super(...props);

    gtinResolver.getDisabledFeatures().then((disabledFeatures) => {
      this.disabledFeatures = disabledFeatures
      this.model = {};
      this.storageService = getSharedStorage(this.DSUStorage);
      this.logService = new LogService(this.DSUStorage);
      getCommunicationService(this.DSUStorage).waitForMessage(() => {
      });

      let state = this.history.location.state;
      if (state && state.gtin) {
        this.storageService.getRecord(constants.PRODUCTS_TABLE, state.gtin, (err, product) => {
          this.model.submitLabel = "Update Product";
          this.model.product = new Product(product);
          this.model.product.version++;
          this.model.product.previousVersion = product.version;
          this.model.product.isCodeEditable = false;
          this.model.product.videos = product.videos || {defaultSource: ""};
          this.getProductAttachments(product, (err, attachments) => {
            if (err) {
              this.showErrorModalAndRedirect("Failed to get inherited cards", "products");
            }

            this.model.languageTypeCards = attachments.languageTypeCards;
            if (attachments.productPhoto) {
              this.model.product.photo = attachments.productPhoto;
            }
          });
          // ensureHolderCredential();
          this.model.product.videos.defaultSource = atob(this.model.product.videos.defaultSource);
          this.videoInitialDefaultSource = this.model.product.videos.defaultSource;
          this.validateGTIN(this.model.product.gtin);
          setTimeout(() => {
            this.setUpCheckboxes();
          }, 0)
        });
      } else {
        this.model.submitLabel = "Save Product";
        this.model.product = new Product();
        this.model.product.videos.defaultSource = atob(this.model.product.videos.defaultSource);
        this.videoInitialDefaultSource = this.model.product.videos.defaultSource;

        // ensureHolderCredential();
        this.validateGTIN(this.model.product.gtin);
        setTimeout(() => {
          this.setUpCheckboxes();
        }, 0)
      }

      utils.disableFeatures(this);

      this.model.videoSourceUpdated = false;

      this.model.languages = {
        label: "Language",
        placeholder: "Select a language",
        options: Languages.getListAsVM()
      };

      this.model.languageTypeCards = [];

      this.addEventListeners();
    }).catch(e => console.log("Couldn't get disabled features"))

  }

  setUpCheckboxes() {
    let checkboxes = this.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach(checkbox => {
      checkbox.checked = checkbox.value === "true";
    })
  }


  addEventListeners() {

    this.onTagEvent("productcode-edit", "focusout", (model, target, event) => {
      this.validateGTIN(target.value);
    })

    this.onTagClick("cancel", () => {
      this.navigateToPageTag("products");
    })

    this.onTagClick("add-market", (event) => {
      this.model.actionModalModel = {
        acceptButtonText: 'Add Market',
        action: "submit-add-market"
      }
      this.editMarket(event);
    })

    this.onTagClick("edit-market", (event) => {
      this.model.actionModalModel = {
        acceptButtonText: 'Update Market',
        action: "submit-update-market",
        marketId: event.marketId
      }
      this.editMarket(event);
    });

    this.onTagClick("submit-add-market", (event) => {
      this.validateMarket();
      if (!this.model.marketModel.validationFailed) {
        this.model.product.addMarket(this.model.selectedMarket);
      }
    })

    this.onTagClick("submit-update-market", (event) => {
      this.validateMarket();
      if (!this.model.marketModel.validationFailed) {
        this.model.product.updateMarket(this.model.actionModalModel.marketId, this.model.selectedMarket);
      }
    })

    this.onTagClick("remove-market", (model, event) => {
      this.model.product.removeMarket(model.marketId);
    })

    this.model.onChange('product.videos.defaultSource', async (...props) => {
      this.model.videoSourceUpdated = this.videoInitialDefaultSource !== this.model.product.videos.defaultSource;
    })

    this.on("product-photo-selected", (event) => {
      this.productPhoto = event.data;
    });

    this.on('openFeedback', (e) => {
      this.feedbackEmitter = e.detail;
    });

    this.onTagClick("add-product", async (event) => {
      let product = this.model.product.clone();
      if (this.model.product.isCodeEditable) {
        this.storageService.getRecord(constants.PRODUCTS_TABLE, product.gtin, async (err, productInDB) => {
          if (productInDB) {
            this.showErrorModal("Cannot save the product because provided product code is already used.");
            return;
          }
          await this.saveProduct(product);
        })
      } else {
        await this.saveProduct(product);
      }
    });
  }

  async saveProduct(product) {
    if (!this.isValid(product)) {
      return;
    }

    this.createWebcModal({
      disableExpanding: true,
      disableClosing: true,
      disableFooter: true,
      modalTitle: "Info",
      modalContent: "Saving product..."
    });

    let message = await utils.initMessage("Product");

    try {
      message.product = ModelMessageService.getMessageFromModel(product, "product");

      let photoMessages = [];
      //process photo
      if (typeof this.productPhoto !== "undefined") {
        let addPhotoMessage = await utils.initMessage("ProductPhoto");
        addPhotoMessage.productCode = message.product.productCode;
        addPhotoMessage.imageData = arrayBufferToBase64(this.productPhoto);
        photoMessages.push(addPhotoMessage);
      }

      //process leaflet & smpc cards

      let cardMessages = await LeafletService.createEpiMessages({
        cards: [...this.model.deletedLanguageTypeCards, ...this.model.languageTypeCards],
        type: "product",
        username: this.model.username,
        code: message.product.productCode
      })

      if (!this.DSUStorage.directAccessEnabled) {
        this.DSUStorage.enableDirectAccess(async () => {
          this.sendMessagesToProcess([message, ...photoMessages, ...cardMessages]);
        })
      } else {
        this.sendMessagesToProcess([message, ...photoMessages, ...cardMessages]);
      }

    } catch (e) {
      this.showErrorModal(e.message);
    }
  }

  async sendMessagesToProcess(messageArr) {
    //process video source if any change for video fields in product or language cards
    if (this.model.videoSourceUpdated) {
      let videoMessage = await utils.initMessage("VideoSource");
      videoMessage.videos = {
        productCode: this.model.product.gtin,
      }

      videoMessage.videos.source = btoa(this.model.product.videos.defaultSource);

      let videoSources = [];
      this.model.languageTypeCards.forEach(card => {
        if (card.videoSource) {
          videoSources.push({documentType: card.type.value, lang: card.language.value, source: card.videoSource})
        }
      })
      videoMessage.videos.sources = videoSources


      MessagesService.processMessages(messageArr, this.DSUStorage, async (undigestedMessages) => {
        MessagesService.processMessages([videoMessage], this.DSUStorage, (videoUndigested) => {
          this.hideModal();
          this.showMessageError([...undigestedMessages, ...videoUndigested]);
        });
      })
    } else {
      MessagesService.processMessages(messageArr, this.DSUStorage, async (undigestedMessages) => {
        this.hideModal();
        this.showMessageError(undigestedMessages);
      })
    }
  }

  validateGTIN(gtinValue) {
    this.model.gtinIsValid = false;
    if (isNaN(gtinValue)) {
      this.model.invalidGTINMessage = "GTIN should be a numeric value";
      return;
    }
    let gtinDigits = gtinValue.split("");

    // TO DO this check is to cover all types of gtin. For the moment we support just 14 digits length. TO update also in leaflet-ssapp
    /*
    if (gtinDigits.length !== 8 && gtinDigits.length !== 12 && gtinDigits.length !== 13 && gtinDigits.length !== 14) {
      this.model.invalidGTINMessage = "GTIN length should be 8, 12, 13 or 14";
      return;
    }
    */

    if (gtinDigits.length !== 14) {
      this.model.invalidGTINMessage = "GTIN length should be 14";
      return;
    }
    let j = gtinMultiplicationArray.length - 1;
    let reszultSum = 0;
    for (let i = gtinDigits.length - 2; i >= 0; i--) {
      reszultSum = reszultSum + gtinDigits[i] * gtinMultiplicationArray[j];
      j--;
    }
    let validDigit = Math.floor((reszultSum + 10) / 10) * 10 - reszultSum;
    if (validDigit === 10) {
      validDigit = 0;
    }
    if (gtinDigits[gtinDigits.length - 1] != validDigit) {
      this.model.invalidGTINMessage = "Invalid GTIN. Last digit should be " + validDigit;
      return;
    }
    this.model.invalidGTINMessage = "GTIN is valid";
    this.model.gtinIsValid = true;
    return;
  }

  showMessageError(undigestedMessages) {
    let errors = [];
    if (undigestedMessages.length > 0) {
      undigestedMessages.forEach(msg => {
        if (errors.findIndex((elem) => elem.message === msg.reason.originalMessage || elem.message === msg.reason.debug_message) < 0) {
          errors.push({message: msg.reason.originalMessage || msg.reason.debug_message});
        }
      })

      this.showModalFromTemplate("digest-messages-error-modal", () => {

        this.navigateToPageTag("products");
      }, () => {

      }, {model: {errors: errors}});
    } else {

      this.navigateToPageTag("products");
    }
  }

  getImageAsBase64(imageData) {
    if (typeof imageData === "string") {
      return imageData;
    }
    if (!(imageData instanceof Uint8Array)) {
      imageData = new Uint8Array(imageData);
    }
    let base64Image = utils.bytesToBase64(imageData);
    base64Image = `data:image/png;base64, ${base64Image}`;
    return base64Image;
  }

  filesWereProvided() {
    return this.model.languageTypeCards.filter(lf => lf.files.length > 0).length > 0;
  }

  isValid(product) {
    if (!this.model.gtinIsValid) {
      this.showErrorModal("Invalid GTIN.");
      return false;
    }
    let validationResult = product.validate();
    if (Array.isArray(validationResult)) {
      for (let i = 0; i < validationResult.length; i++) {
        let err = validationResult[i];
        this.showErrorModal(err);
      }
      return false;
    }
    return true;
  }

  getProductAttachments(product, callback) {
    const resolver = require("opendsu").loadAPI("resolver");
    resolver.loadDSU(product.keySSI, async (err, productDSU) => {
      if (err) {
        return callback(err);
      }

      let languageTypeCards = [];
      //used temporarily to avoid the usage of dsu cached instances which are not up to date

      try {
        await $$.promisify(productDSU.load)();
        let leaflets = await $$.promisify(productDSU.listFolders)("/leaflet");
        let smpcs = await $$.promisify(productDSU.listFolders)("/smpc");
        for (const leafletLanguageCode of leaflets) {
          let leafletFiles = await $$.promisify(productDSU.listFiles)("/leaflet/" + leafletLanguageCode);
          let videoSource = "";
          if (product.videos && product.videos[`leaflet/${leafletLanguageCode}`]) {
            videoSource = atob(product.videos[`leaflet/${leafletLanguageCode}`]);
          }
          languageTypeCards.push(LeafletService.generateCard(LeafletService.LEAFLET_CARD_STATUS.EXISTS, "leaflet", leafletLanguageCode, leafletFiles, videoSource));
        }
        for (const smpcLanguageCode of smpcs) {
          let smpcFiles = await $$.promisify(productDSU.listFiles)("/smpc/" + smpcLanguageCode);
          let videoSource = "";
          if (product.videos && product.videos[`smpc/${smpcLanguageCode}`]) {
            videoSource = atob(product.videos[`smpc/${smpcLanguageCode}`]);
          }
          languageTypeCards.push(LeafletService.generateCard(LeafletService.LEAFLET_CARD_STATUS.EXISTS, "smpc", smpcLanguageCode, smpcFiles, videoSource));
        }
        let stat = await $$.promisify(productDSU.stat)(constants.PRODUCT_IMAGE_FILE)
        if (stat.type === "file") {
          let data = await $$.promisify(productDSU.readFile)(constants.PRODUCT_IMAGE_FILE);
          let productPhoto = this.getImageAsBase64(data);
          callback(undefined, {languageTypeCards: languageTypeCards, productPhoto: productPhoto});
        } else {
          callback(undefined, {languageTypeCards: languageTypeCards});
        }
      } catch (e) {
        return callback(e);
      }

    });
  }

  editMarket(event) {
    if (!this.model.product.markets) {
      this.model.product.markets = [];
    }
    let existingCountryMarketIds = this.model.product.markets.map(market => market.marketId);
    let countriesList = event.marketId ? Countries.getList().map(country => {
        return {
          label: country.name,
          value: country.code
        }
      }) :
      Countries.getList().filter(country => !existingCountryMarketIds
        .includes(country.code)).map(country => {
        return {
          label: country.name,
          value: country.code
        }
      });

    this.model.marketModel = {
      validationFailed: false,
      countriesCodes: {
        options: countriesList,
        value: event.marketId || countriesList[0].value,
        label: "Select Country"
      },
      nationalCode: {
        value: event.nationalCode || "",
        placeholder: "Enter national code",
        label: "National Code",

        isValid: true
      },
      mahName: {
        value: event.mahName || "",
        placeholder: "Enter MAH name",
        label: "MAH Name",

        isValid: true
      },
      legalEntityName: {
        value: event.legalEntityName || "",
        placeholder: "Enter legal entity name",
        label: "Legal Entity Name",

        isValid: true
      }
    }


    this.showModalFromTemplate('add-market', () => {
    }, () => {
    }, {model: this.model});
  }

  validateMarket() {
    let market = {
      marketId: this.model.marketModel.countriesCodes.value,
      nationalCode: this.model.marketModel.nationalCode.value,
      mahName: this.model.marketModel.mahName.value,
      legalEntityName: this.model.marketModel.legalEntityName.value
    }
    let validationFailed = false;
    for (let prop in market) {
      if (this.model.marketModel[prop]) {
        if (this.model.marketModel[prop].required && market[prop].replace(/\s/g, "").length === 0) {
          validationFailed = true;
        }
        this.model.marketModel[prop].isValid = !validationFailed;
      }
    }

    if (validationFailed) {
      this.model.marketModel.validationFailed = true;
    } else {
      this.model.marketModel.validationFailed = false;
      this.model.selectedMarket = market;
      this.hideModal();
    }
  }
}

