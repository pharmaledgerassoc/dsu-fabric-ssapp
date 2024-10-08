import {LazyDataSource} from "../LazyDataSource.js";

export default class AuditDataSource extends LazyDataSource {
  constructor(...props) {
    super(...props);
  }

  basicLogProcessing(item) {
    return {
      gtin: item.metadata ? item.metadata.gtin || "-" : "-",
      batch: "-",
      reason: item.reason,
      username: item.username,
      creationTime: item.creationTime || new Date(item["__timestamp"]).toISOString(),
      details: item
    };
  }

  attachmentLogProcessing(item) {
    let attachmentLog = this.basicLogProcessing(item);
    if (item.metadata && item.metadata.attachedTo && item.metadata.attachedTo === "BATCH") {
      attachmentLog.batch = `${item.itemCode}`;
    }
    return attachmentLog;
  }

  productLogProcessing(item) {
    let le = this.basicLogProcessing(item);
    return le;
  }

  batchLogProcessing(item) {
    let le = this.productLogProcessing(item);
    le.batch = `${item.itemCode}`
    return le;
  }

  getMappedResult(data) {
    super.getMappedResult(data);
    this.currentViewData = data.map((item, index) => {
      let viewLog;
      try {
        switch (item.logType) {
          case "PRODUCT_LOG":
            viewLog = this.productLogProcessing(item);
            break;
          case "BATCH_LOG":
            viewLog = this.batchLogProcessing(item);
            break;
          case "PRODUCT_PHOTO_LOG":
          case "LEAFLET_LOG":
          case "VIDEO_LOG":
            viewLog = this.attachmentLogProcessing(item);
            break;
          case "FAILED_LOG":
            if (item.logInfo && item.invalidFields) {
              item.metadata.invalidFields = item.invalidFields;
              delete item.invalidFields;
            }
            viewLog = this.basicLogProcessing(item);
            break;
          case "RECOVER_LOG":
            viewLog = this.basicLogProcessing(item);
            if (item.metadata && item.metadata.batch) {
              viewLog.batch = item.metadata.batch;
            }
            break;
          default:
            viewLog = this.basicLogProcessing(item);
        }
      } catch (err) {
        viewLog = this.basicLogProcessing(item);
      }
      return viewLog;
    });
    return this.currentViewData;
  }

}
