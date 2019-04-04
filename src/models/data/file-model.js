const path = require('path');
const config = require('config');
const { Schema } = require('mongoose');
const utils = require('../../common/utils');
const FileType = require('../const/file-type');
const ExchangeableImageFileModel = require('./exchangeable-image-file-model');

const db = utils.getDatabaseConnection();
const schema = utils.generateSchema(
  {
    type: {
      type: String,
      required: true,
      enum: FileType.all(),
      index: {
        name: 'Type',
      },
    },
    project: {
      type: Schema.ObjectId,
      ref: 'ProjectModel',
      index: {
        name: 'Project',
      },
    },
    user: {
      // The file owner.
      type: Schema.ObjectId,
      ref: 'UserModel',
      index: {
        name: 'User',
      },
    },
    originalFilename: {
      // The original filename.
      type: String,
      required: true,
    },
    exif: {
      type: Schema.ObjectId,
      ref: 'ExchangeableImageFileModel',
    },
    size: {
      // The file total size.
      type: Number,
    },
  },
  {
    collection: 'Files',
  },
);
schema.post('remove', file => {
  switch (file.type) {
    case FileType.projectCoverImage:
      utils
        .deleteS3Objects([
          `${config.s3.folders.projectCovers}/${file.getFilename()}`,
        ])
        .catch(error => {
          utils.logError(error, { file: file.dump() });
        });
      break;
    case FileType.annotationImage:
      utils
        .deleteS3Objects([
          `${config.s3.folders.annotationImages}/${file.getFilename()}`,
          `${config.s3.folders.annotationOriginalImages}/${file.getFilename()}`,
        ])
        .catch(error => {
          utils.logError(error, { file: file.dump() });
        });
      break;
    default:
      utils.logError(new Error('not implement'), { file: file.dump() });
      break;
  }
});
const model = db.model('FileModel', schema);

model.prototype.getExtensionName = function() {
  return path
    .extname(this.originalFilename)
    .replace('.', '')
    .toLowerCase();
};
model.prototype.getFilename = function() {
  /*
  Get the filename on S3.
  @returns {string}
   */
  return `${this._id}.${this.getExtensionName()}`;
};

model.prototype.saveWithContent = function(buffer) {
  /*
  Save the document with binary content.
  @param buffer {Buffer}
  @returns {Promise<FileModel>}
   */
  this.size = buffer.length;
  return this.save().then(() => {
    switch (this.type) {
      case FileType.projectCoverImage:
        return utils
          .resizeImageAndUploadToS3({
            buffer,
            filename: `${
              config.s3.folders.projectCovers
            }/${this.getFilename()}`,
            format: this.getExtensionName(),
            width: 383,
            height: 185,
            isFillUp: true,
            isPublic: true,
          })
          .then(result => {
            this.size = result.buffer.length;
            return this.save();
          });
      case FileType.annotationImage:
        return Promise.all([
          utils.uploadToS3(
            buffer,
            `${
              config.s3.folders.annotationOriginalImages
            }/${this.getFilename()}`,
            true,
          ),
          utils.resizeImageAndUploadToS3({
            buffer,
            filename: `${
              config.s3.folders.annotationImages
            }/${this.getFilename()}`,
            format: this.getExtensionName(),
            width: 1280,
            height: 1280,
            isFillUp: false,
            isPublic: true,
            isReturnExif: true,
          }),
        ])
          .then(([originalBuffer, thumbnailResult]) => {
            const items = thumbnailResult.exif.split('\n');
            const make = items.find(x => /^Make=/.test(x));
            const exifModel = items.find(x => /^Model=/.test(x));
            let dateTime;
            const dateTimeOriginal = items.find(x =>
              /^DateTimeOriginal=/.test(x),
            );
            if (dateTimeOriginal) {
              dateTime = new Date(
                `${dateTimeOriginal
                  .match(/^DateTimeOriginal=(.*)$/)[1]
                  .replace(':', '-')
                  .replace(':', '-')
                  .replace(' ', 'T')}.000Z`,
              );
              dateTime.setUTCMinutes(
                dateTime.getUTCMinutes() - config.defaultTimezone,
              );
            }

            const exif = new ExchangeableImageFileModel({
              rawData: thumbnailResult.exif,
              make: make ? make.match(/^Make=(.*)$/)[1] : undefined,
              model: exifModel ? exifModel.match(/^Model=(.*)$/)[1] : undefined,
              dateTime,
            });
            this.exif = exif;
            this.size = originalBuffer.length + thumbnailResult.buffer.length;
            return exif.save();
          })
          .then(() => this.save());
      default:
        throw new Error('error type');
    }
  });
};

model.prototype.dump = function() {
  return {
    id: `${this._id}`,
    type: this.type,
    originalFilename: this.originalFilename,
    filename: this.getFilename(),
    url: utils.getFileUrl(this.type, this.getFilename()),
    size: this.size,
  };
};

module.exports = model;
