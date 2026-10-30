/**
 * EXIF & Geolocation Metadata Scrubber
 * Removes EXIF, GPS coordinates, camera serials, and privacy-sensitive metadata from
 * patient-uploaded JPEG and PNG images prior to AI vision processing or persistence.
 */

export const scrubExifMetadata = (imageBuffer: Buffer): Buffer => {
  if (!imageBuffer || imageBuffer.length < 4) {
    return imageBuffer;
  }

  // 1. Detect JPEG (SOI 0xFFD8)
  if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
    return scrubJpeg(imageBuffer);
  }

  // 2. Detect PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47
  ) {
    return scrubPng(imageBuffer);
  }

  // Fallback for PDF or raw formats: return unmodified
  return imageBuffer;
};

export const stripExifMetadata = scrubExifMetadata;

const scrubJpeg = (buffer: Buffer): Buffer => {
  const pieces: Buffer[] = [];
  pieces.push(buffer.subarray(0, 2)); // SOI: 0xFF, 0xD8

  let offset = 2;
  const len = buffer.length;

  while (offset < len) {
    if (buffer[offset] !== 0xff) {
      // Malformed or non-marker byte, preserve remainder
      pieces.push(buffer.subarray(offset));
      break;
    }

    const marker = buffer[offset + 1];

    // EOI (End of Image)
    if (marker === 0xd9) {
      pieces.push(buffer.subarray(offset, offset + 2));
      break;
    }

    // SOS (Start of Scan) - remainder is scan data
    if (marker === 0xda) {
      pieces.push(buffer.subarray(offset));
      break;
    }

    // RST0 - RST7 (no length field)
    if (marker >= 0xd0 && marker <= 0xd7) {
      pieces.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > len) {
      pieces.push(buffer.subarray(offset));
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + segmentLength;

    // Filter out APP1 (0xE1: EXIF / XMP), APP2 (0xE2: FlashPix/ICC can contain metadata),
    // APP13 (0xED: Photoshop IPTC), COM (0xFE: Comment)
    const isExifOrMeta =
      marker === 0xe1 || marker === 0xe2 || marker === 0xed || marker === 0xfe;

    if (!isExifOrMeta && segmentEnd <= len) {
      pieces.push(buffer.subarray(offset, segmentEnd));
    }

    offset = segmentEnd;
  }

  return Buffer.concat(pieces);
};

const scrubPng = (buffer: Buffer): Buffer => {
  const header = buffer.subarray(0, 8);
  const pieces: Buffer[] = [header];

  let offset = 8;
  const len = buffer.length;

  while (offset + 8 <= len) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const totalChunkLength = 12 + chunkLength; // 4 length + 4 type + data + 4 CRC

    if (offset + totalChunkLength > len) {
      pieces.push(buffer.subarray(offset));
      break;
    }

    // Strip eXIf (EXIF metadata), tEXt, zTXt, iTXt (text metadata / location)
    const isMetadataChunk =
      chunkType === 'eXIf' ||
      chunkType === 'tEXt' ||
      chunkType === 'zTXt' ||
      chunkType === 'iTXt';

    if (!isMetadataChunk) {
      pieces.push(buffer.subarray(offset, offset + totalChunkLength));
    }

    offset += totalChunkLength;
  }

  return Buffer.concat(pieces);
};
