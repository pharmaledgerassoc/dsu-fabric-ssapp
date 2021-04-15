function convertDateToISO(dateString){
    const d = new Date(dateString);
    let isoDateString = d.toISOString();
    isoDateString = isoDateString.slice(0, 10);
    return isoDateString;
}

function convertDateFromISOToGS1Format(isoDateString, separator){
    const date = new Date(isoDateString);
    const ye = new Intl.DateTimeFormat('en', {year: '2-digit'}).format(date);
    const mo = new Intl.DateTimeFormat('en', {month: '2-digit'}).format(date);
    const da = new Intl.DateTimeFormat('en', {day: '2-digit'}).format(date);
    if(separator){
     return `${ye}${separator}${mo}${separator}${da}`
    }
    return `${ye}${mo}${da}`;
}


function convertDateTOGMTFormat(date){
    let formatter = new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
        weekday: "short",
        monthday: "short",
        timeZone: 'GMT'
    });

    let arr = formatter.formatToParts(date);
    let no = {};
    arr.forEach( item =>{
        no[item.type] = item.value;
    })
    let {year, month, day, hour, minute } = no;

    let offset = -date.getTimezoneOffset();
    let offset_min = offset % 60;
    if(!offset_min){
        offset_min = "00"
    }
    offset = offset / 60;
    let offsetStr = "GMT ";
    if(offset){
        if(offset >0){
            offsetStr+= "+";
        }
        offsetStr+=offset;
        offsetStr+=":";
        offsetStr+=offset_min;
    }

    return `${year} ${month} ${day} ${hour}:${minute} ${offsetStr}`;
}

function getFetchUrl(relativePath) {
    if (window["$$"] && $$.SSAPP_CONTEXT && $$.SSAPP_CONTEXT.BASE_URL && $$.SSAPP_CONTEXT.SEED) {
        // if we have a BASE_URL then we prefix the fetch url with BASE_URL
        return `${new URL($$.SSAPP_CONTEXT.BASE_URL).pathname}${
            relativePath.indexOf("/") === 0 ? relativePath.substring(1) : relativePath
        }`;
    }
    return relativePath;
}

function executeFetch(url, options) {
    const fetchUrl = getFetchUrl(url);
    return fetch(fetchUrl, options);
}


function sortByProperty (property, direction){
    return (a,b)=>{
        if ( (""+ a[property]) < ("" + b[property]) ){
            return   direction === "asc" ? -1 : 1;
        }
        if ( (""+ a[property]) > ("" + b[property])  ){
            return   direction === "asc" ? 1 : -1;
        }
        return 0;
    }
}

const bytesToBase64 = (bytes) => {
    const base64abc = [
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
        "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/"
    ];

    let result = '', i, l = bytes.length;
    for (i = 2; i < l; i += 3) {
        result += base64abc[bytes[i - 2] >> 2];
        result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
        result += base64abc[((bytes[i - 1] & 0x0F) << 2) | (bytes[i] >> 6)];
        result += base64abc[bytes[i] & 0x3F];
    }
    if (i === l + 1) { // 1 octet yet to write
        result += base64abc[bytes[i - 2] >> 2];
        result += base64abc[(bytes[i - 2] & 0x03) << 4];
        result += "==";
    }
    if (i === l) { // 2 octets yet to write
        result += base64abc[bytes[i - 2] >> 2];
        result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
        result += base64abc[(bytes[i - 1] & 0x0F) << 2];
        result += "=";
    }
    return result;
}
export default {
    convertDateFromISOToGS1Format,
    convertDateToISO,
    convertDateTOGMTFormat,
    getFetchUrl,
    fetch: executeFetch,
    sortByProperty,
    bytesToBase64
}
