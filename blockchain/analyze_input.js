const fs = require('fs');

const input = fs.readFileSync('input_full.hex', 'utf8').trim();
const selector = input.substring(0, 10);
const data = '0x' + input.substring(10);

console.log('Selector:', selector);

// 11289565: report(address,bytes,bytes,bytes[])
if (selector === '0x11289565') {
    // Decoding address, bytes, bytes, bytes[]
    // Offset 0: address (32 bytes)
    // Offset 32: metadata pointer
    // Offset 64: reportPayload pointer
    // Offset 96: signatures pointer

    const receiver = '0x' + input.substring(10, 10 + 64);
    const metadataPointer = parseInt(input.substring(10 + 64, 10 + 128), 16);
    const reportPointer = parseInt(input.substring(10 + 128, 10 + 192), 16);
    const signaturesPointer = parseInt(input.substring(10 + 192, 10 + 256), 16);

    console.log('Receiver:', receiver);

    // Helper to extract bytes from a pointer
    const getBytes = (ptr) => {
        const lenHex = input.substring(10 + ptr * 2, 10 + ptr * 2 + 64);
        const len = parseInt(lenHex, 16);
        return input.substring(10 + ptr * 2 + 64, 10 + ptr * 2 + 64 + len * 2);
    };

    const metadata = getBytes(metadataPointer);
    const reportPayload = getBytes(reportPointer);

    console.log('Metadata Length:', metadata.length / 2);
    console.log('ReportPayload Length:', reportPayload.length / 2);
    console.log('ReportPayload Hex:', reportPayload);
    console.log('Metadata Hex:', metadata);
}
