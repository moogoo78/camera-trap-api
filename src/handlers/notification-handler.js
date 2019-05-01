const auth = require('../auth/authorization');
const errors = require('../models/errors');
const PageList = require('../models/page-list');
const UserPermission = require('../models/const/user-permission');
const NotificationModel = require('../models/data/notification-model');
const NotificationsSearchForm = require('../forms/notification/notifications-search-form');
require('../models/data/issue-model'); // for populate. todo: remove it after crated issue handler.

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
    .sort(form.sort)
    .populate('dataField')
    .populate('uploadSession')
    .populate('issue')
    .populate('sender');
  if (form.isRead != null) {
    query.where({ isRead: form.isRead });
  }
  return NotificationModel.paginate(query, {
    offset: form.index * form.size,
    limit: form.size,
  }).then(result => {
    res.json(
      new PageList(form.index, form.size, result.totalDocs, result.docs),
    );
  });
});
