const forms = require('../');

class SpeciesSearchForm extends forms.Form {}
SpeciesSearchForm.define({
  index: new forms.fields.IntegerField({
    filter: value => {
      const result = forms.filters.integer(0)(value);
      return result < 0 ? 0 : result;
    },
  }),
  size: new forms.fields.IntegerField({
    filter: value => {
      const result = forms.filters.integer(forms.constants.PAGE_SIZE_MAXIMUM)(
        value,
      );
      if (result < 0) {
        return forms.constants.PAGE_SIZE_MAXIMUM;
      }
      if (result > forms.constants.PAGE_SIZE_MAXIMUM) {
        return forms.constants.PAGE_SIZE_MAXIMUM;
      }
      return result;
    },
  }),
  sort: new forms.fields.StringField({
    default: 'index',
    validators: [forms.validators.regexp(/^-?(index)$/)],
  }),
});
module.exports = SpeciesSearchForm;
