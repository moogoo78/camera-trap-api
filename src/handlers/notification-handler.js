const auth = require('../auth/authorization');
const errors = require('../models/errors');
const PageList = require('../models/page-list');
const UserPermission = require('../models/const/user-permission');
const NotificationModel = require('../models/data/notification-model');
const NotificationsSearchForm = require('../forms/notification/notifications-search-form');
const NotificationType = require('../models/const/notification-type');
const ProjectModel = require('../models/data/project-model');
const StudyAreaModel = require('../models/data/study-area-model');
const CameraLocationModel = require('../models/data/camera-location-model');

exports.getMyNotifications = auth(UserPermission.all(), (req, res) => {
  /*
  GET /api/v1/me/notifications
   */
  const form = new NotificationsSearchForm(req.query);
  const errorMessage = form.validate();
  if (errorMessage) {
    throw new errors.Http400(errorMessage);
  }

  const query = NotificationModel.where({ user: req.user._id })
    .where({ type: { $ne: NotificationType.system } })
    .sort(form.sort)
    .populate('dataField')
    .populate('uploadSession')
    .populate('cameraLocationAbnormality')
    .populate('issue')
    .populate('sender');
  if (form.isRead != null) {
    query.where({ isRead: form.isRead });
  }
  return NotificationModel.paginate(query, {
    offset: form.index * form.size,
    limit: form.size,
  })
    .then(result =>
      Promise.all([
        result,
        ProjectModel.populate(result.docs, 'dataField.project'),
        ProjectModel.populate(result.docs, 'uploadSession.project'),
        CameraLocationModel.populate(
          result.docs,
          'uploadSession.cameraLocation',
        ),
        ProjectModel.populate(result.docs, 'cameraLocationAbnormality.project'),
        CameraLocationModel.populate(
          result.docs,
          'cameraLocationAbnormality.cameraLocation',
        ),
      ]),
    )
    .then(([result]) =>
      Promise.all([
        result,
        StudyAreaModel.populate(
          result.docs,
          'uploadSession.cameraLocation.studyArea',
        ),
        StudyAreaModel.populate(
          result.docs,
          'cameraLocationAbnormality.cameraLocation.studyArea',
        ),
      ]),
    )
    .then(([result]) =>
      Promise.all([
        result,
        StudyAreaModel.populate(
          result.docs,
          'uploadSession.cameraLocation.studyArea.parent',
        ),
        StudyAreaModel.populate(
          result.docs,
          'cameraLocationAbnormality.cameraLocation.studyArea.parent',
        ),
      ]),
    )
    .then(([result]) => {
      res.json(
        new PageList(form.index, form.size, result.totalDocs, result.docs),
      );
    });
});

exports.readAllMyNotifications = auth(UserPermission.all(), (req, res) =>
  /*
  POST /api/v1/me/notifications/_read
   */
  NotificationModel.where({ user: req.user._id, isRead: false })
    .where({ type: { $ne: NotificationType.system } })
    .then(notifications =>
      Promise.all(
        notifications.map(notification => {
          notification.isRead = true;
          return notification.save();
        }),
      ),
    )
    .then(() => {
      res.status(204).send();
    }),
);

exports.getSystemAnnouncements = (req, res) => {
  /*
  GET /api/v1/system-announcements
  */
  const form = new NotificationsSearchForm(req.query);
  const errorMessage = form.validate();
  if (errorMessage) {
    throw new errors.Http400(errorMessage);
  }

  const query = NotificationModel.where({
    type: NotificationType.system,
  }).where({ expiredTime: { $gte: Date.now() } });

  return NotificationModel.paginate(query, {
    offset: form.index * form.size,
    limit: form.size,
  }).then(result => {
    res.json(
      new PageList(form.index, form.size, result.totalDocs, result.docs),
    );
  });
};
